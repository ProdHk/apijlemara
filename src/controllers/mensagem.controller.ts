// src/controllers/mensagem.controller.ts
import Console, { ConsoleData } from "../lib/Console";
import Mensagem, {
  MensagemMainStatus,
  MensagemTipo,
  MensagemDirection,
  MensagemTypes,
} from "../models/Mensagem";

type MetaWebhookPayload = any;

function toDateFromSeconds(ts?: string | number | null): Date | null {
  if (!ts) return null;
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return null;
  // Meta costuma enviar timestamp em segundos
  return new Date(n * 1000);
}

function pushUniqueStatus(
  statuses: any[] | undefined,
  next: { status: MensagemMainStatus; timestamp: Date; raw?: any }
) {
  const list = Array.isArray(statuses) ? statuses : [];
  const exists = list.some(
    (s) =>
      s?.status === next.status &&
      new Date(s?.timestamp).getTime() === next.timestamp.getTime()
  );
  if (!exists) list.push(next);
  return list;
}

function mapMessageType(msg: any): MensagemTipo {
  const t = msg?.type;
  const allowed: MensagemTipo[] = [
    "text",
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "location",
    "contacts",
    "interactive",
    "template",
    "reaction",
    "unknown",
  ];
  if (allowed.includes(t)) return t;
  return "unknown";
}

function normalizeDigits(phone?: string) {
  if (!phone) return undefined;
  return String(phone).replace(/\D+/g, "");
}

function extractWabaAndPhoneNumberId(payload: any) {
  // paths comuns do webhook
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const phoneNumberId = value?.metadata?.phone_number_id;
  const wabaId = value?.metadata?.display_phone_number
    ? value?.metadata?.phone_number_id // mantém phoneNumberId
    : value?.metadata?.phone_number_id;

  // waba_id costuma existir em value.metadata ou value?.contacts? (depende do payload)
  const waba = value?.metadata?.waba_id || value?.waba_id || value?.business_account_id;

  return {
    phoneNumberId: phoneNumberId ? String(phoneNumberId) : undefined,
    wabaId: waba ? String(waba) : undefined,
  };
}

function extractMessages(payload: any) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  return Array.isArray(value?.messages) ? value.messages : [];
}

function extractStatuses(payload: any) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  return Array.isArray(value?.statuses) ? value.statuses : [];
}

function buildDocFromInboundMessage(payload: any, msg: any): Partial<MensagemTypes> {
  const { phoneNumberId, wabaId } = extractWabaAndPhoneNumberId(payload);

  const wamid = msg?.id;
  const from = normalizeDigits(msg?.from);
  const to = normalizeDigits(phoneNumberId); // aqui “to” é o número da empresa (id não é phone), então pode ficar vazio
  const type = mapMessageType(msg);

  const metaTimestamp = toDateFromSeconds(msg?.timestamp);

  const base: Partial<MensagemTypes> = {
    wamid,
    messageId: wamid,
    direction: "INBOUND" as MensagemDirection,
    status: "RECEIVED",
    type,
    from,
    to: undefined, // opcional: se você tiver display_phone_number em metadata, dá pra salvar o número da empresa
    phoneNumberId,
    wabaId,
    metaTimestamp,
    raw: payload,
  };

  // text
  if (type === "text") {
    base.text = {
      body: msg?.text?.body,
      preview_url: msg?.text?.preview_url ?? true,
    };
  }

  // media
  if (
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "document" ||
    type === "sticker"
  ) {
    const mediaObj = msg?.[type] || {};
    base.media = {
      kind: type,
      id: mediaObj?.id,
      mime_type: mediaObj?.mime_type,
      sha256: mediaObj?.sha256,
      filename: mediaObj?.filename,
      caption: mediaObj?.caption,
    };
  }

  // interactive
  if (type === "interactive") {
    const inter = msg?.interactive || {};
    const reply = inter?.button_reply || inter?.list_reply;
    const replyType = inter?.type;
    base.interactive = {
      type: replyType || "unknown",
      id: reply?.id,
      title: reply?.title,
      description: reply?.description,
      payload: reply?.id,
      raw: inter,
    };
  }

  // template (geralmente outbound, mas deixo aqui)
  if (type === "template") {
    const tpl = msg?.template || {};
    base.template = {
      name: tpl?.name,
      language: tpl?.language?.code || tpl?.language,
      components: tpl?.components || [],
    } as any;
  }

  // location
  if (type === "location") {
    const loc = msg?.location || {};
    base.location = {
      latitude: loc?.latitude,
      longitude: loc?.longitude,
      name: loc?.name,
      address: loc?.address,
      url: loc?.url,
      raw: loc,
    };
  }

  // contacts
  if (type === "contacts") {
    base.contacts = msg?.contacts || [];
  }

  // reaction
  if (type === "reaction") {
    const react = msg?.reaction || {};
    base.reaction = {
      message_id: react?.message_id,
      emoji: react?.emoji,
      raw: react,
    };
  }

  // context (reply)
  if (msg?.context?.id || msg?.context?.from) {
    base.context = {
      id: msg?.context?.id,
      from: normalizeDigits(msg?.context?.from),
    };
  }

  // inicializa histórico
  if (metaTimestamp) {
    base.statuses = [{ status: "RECEIVED", timestamp: metaTimestamp, raw: msg }];
  }

  return base;
}

function mapStatusToMainStatus(s?: string): MensagemMainStatus {
  const v = String(s || "").toUpperCase();
  if (v === "SENT") return "SENT";
  if (v === "DELIVERED") return "DELIVERED";
  if (v === "READ") return "READ";
  if (v === "FAILED") return "FAILED";
  if (v === "RECEIVED") return "RECEIVED";
  return "PENDING";
}

export default class MensagemController {
  /**
   * Processa webhook da Meta (mensagens e/ou statuses).
   * Idempotente: usa upsert por wamid.
   */
  async processWebhook(payload: MetaWebhookPayload) {
    Console({ type: "log", message: "Processando webhook Meta (Mensagens/Statuses)..." });

    try {
      const messages = extractMessages(payload);
      const statuses = extractStatuses(payload);

      const savedMessages: any[] = [];
      const updatedStatuses: any[] = [];

      // 1) Salva mensagens (INBOUND)
      for (const msg of messages) {
        const wamid = msg?.id;
        if (!wamid) continue;

        const doc = buildDocFromInboundMessage(payload, msg);

        const upserted = await Mensagem.findOneAndUpdate(
          { wamid },
          {
            $setOnInsert: doc,
            // se cair aqui em duplicidade de webhook, não reescreve tudo
            $set: {
              // mantém raw atualizado, se você quiser
              raw: payload,
              metaTimestamp: doc.metaTimestamp ?? null,
              phoneNumberId: doc.phoneNumberId,
              wabaId: doc.wabaId,
              from: doc.from,
              type: doc.type,
              // conteúdo: só seta se existir
              ...(doc.text ? { text: doc.text } : {}),
              ...(doc.media ? { media: doc.media } : {}),
              ...(doc.interactive ? { interactive: doc.interactive } : {}),
              ...(doc.template ? { template: doc.template } : {}),
              ...(doc.context ? { context: doc.context } : {}),
              ...(doc.location ? { location: doc.location } : {}),
              ...(doc.contacts ? { contacts: doc.contacts } : {}),
              ...(doc.reaction ? { reaction: doc.reaction } : {}),
              direction: "INBOUND",
              status: "RECEIVED",
            },
          },
          { upsert: true, new: true }
        ).lean();

        savedMessages.push(upserted);
      }

      // 2) Atualiza statuses (SENT/DELIVERED/READ/FAILED)
      for (const st of statuses) {
        const wamid = st?.id;
        if (!wamid) continue;

        const mainStatus = mapStatusToMainStatus(st?.status);
        const ts = toDateFromSeconds(st?.timestamp) || new Date();

        // busca atual pra evitar duplicar histórico
        const current = await Mensagem.findOne({ wamid }, { statuses: 1 }).lean();

        const nextStatuses = pushUniqueStatus(current?.statuses, {
          status: mainStatus,
          timestamp: ts,
          raw: st,
        });

        const updated = await Mensagem.findOneAndUpdate(
          { wamid },
          {
            $set: {
              status: mainStatus,
              conversationId: st?.conversation?.id ?? null,
              metaTimestamp: ts,
              statuses: nextStatuses,
              raw: payload,
            },
          },
          { new: true }
        ).lean();

        if (updated) updatedStatuses.push(updated);
      }

      Console({
        type: "success",
        message: `Webhook processado. messages=${savedMessages.length} statuses=${updatedStatuses.length}`,
      });

      return {
        status: true,
        message: "Webhook processado.",
        data: { messages: savedMessages, statuses: updatedStatuses },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao processar webhook." });
      ConsoleData({ type: "error", data: error });
      return { status: false, message: "Erro ao processar webhook.", data: null };
    }
  }

  /**
   * Busca mensagens por atendimento (thread interna).
   */
  async listarPorAtendimento(atendimentoId: string) {
    Console({ type: "log", message: "Listando mensagens por atendimento..." });
    try {
      const msgs = await Mensagem.find({ atendimentoId })
        .sort({ createdAt: 1 })
        .lean();

      return msgs.map((m) => ({ ...m, _id: String(m._id) }));
    } catch (error) {
      Console({ type: "error", message: "Erro ao listar mensagens." });
      ConsoleData({ type: "error", data: error });
      return [];
    }
  }

  /**
   * Busca por phone (cliente) + número da empresa.
   */
  async listarPorNumero(params: { phoneNumberId: string; from: string; limit?: number }) {
    Console({ type: "log", message: "Listando mensagens por número..." });
    try {
      const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);

      const msgs = await Mensagem.find({
        phoneNumberId: params.phoneNumberId,
        from: normalizeDigits(params.from),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return msgs.map((m) => ({ ...m, _id: String(m._id) }));
    } catch (error) {
      Console({ type: "error", message: "Erro ao listar mensagens por número." });
      ConsoleData({ type: "error", data: error });
      return [];
    }
  }
}
