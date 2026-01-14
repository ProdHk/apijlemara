// src/controllers/metawebhook.controller.ts
import type { Request, Response } from "express";
import Console, { ConsoleData } from "../lib/Console";

import Atendimento from "../models/Atendimento";
import MensagemModel, { MensagemTipo, MensagemMainStatus } from "../models/Mensagem";

import Disparo from "../models/Disparo";
import DisparoItem from "../models/DisparoItem";

import MetaController from "./meta.controller";
import { normalizeBRBase10 } from "../lib/phone";

/* -------------------------------------------------------------------------- */
/* Types (Webhook Meta - mínimo necessário)                                   */
/* -------------------------------------------------------------------------- */

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: WebhookValue;
    }>;
  }>;
};

type WebhookValue = {
  messaging_product?: string;

  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
    waba_id?: string;
  };

  contacts?: Array<{
    wa_id?: string;
    profile?: { name?: string };
  }>;

  messages?: Array<{
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;

    text?: { body?: string; preview_url?: boolean };

    image?: MetaMedia;
    audio?: MetaMedia;
    video?: MetaMedia;
    document?: MetaMedia;
    sticker?: MetaMedia;

    interactive?: {
      type?: string;
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string; description?: string };
      [k: string]: unknown;
    };

    location?: {
      latitude?: number;
      longitude?: number;
      name?: string;
      address?: string;
      url?: string;
      [k: string]: unknown;
    };

    contacts?: unknown[];

    reaction?: {
      message_id?: string;
      emoji?: string;
      [k: string]: unknown;
    };

    [k: string]: unknown;
  }>;

  statuses?: Array<{
    id?: string;
    status?: string;
    timestamp?: string;

    conversation?: { id?: string };

    pricing?: unknown;
    recipient_id?: string;

    errors?: unknown[];
    [k: string]: unknown;
  }>;

  [k: string]: unknown;
};

type MetaMedia = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
  [k: string]: unknown;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function digits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function toDateFromSeconds(ts?: string | number | null) {
  if (!ts) return null;
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000);
}

function isWithinDays(date: Date, days: number) {
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - date.getTime() <= ms;
}

function getValues(body: WebhookBody): WebhookValue[] {
  const out: WebhookValue[] = [];
  const entry = body?.entry || [];
  for (const e of entry) {
    const changes = e?.changes || [];
    for (const c of changes) {
      if (c?.value) out.push(c.value);
    }
  }
  return out;
}

function safeTipo(msgType: unknown): MensagemTipo {
  const t = String(msgType || "unknown").toLowerCase();
  const allowed = new Set([
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
  ]);
  return (allowed.has(t) ? t : "unknown") as MensagemTipo;
}

function mapStatusToMain(s?: string): MensagemMainStatus {
  const v = String(s || "").toUpperCase();
  if (v === "SENT") return "SENT";
  if (v === "DELIVERED") return "DELIVERED";
  if (v === "READ") return "READ";
  if (v === "FAILED") return "FAILED";
  // inbound salvo como RECEIVED; aqui é status webhook
  return "PENDING";
}

function pickDefined<T extends object>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

function startOfDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/* -------------------------------------------------------------------------- */
/* Disparo context                                                            */
/* -------------------------------------------------------------------------- */

type DisparoContext = {
  disparoId?: string;
  atendenteId?: string;
  disparoStatus?: string;
  itemId?: string;
};

function isActiveDisparoStatus(status?: string) {
  const s = String(status || "").toLowerCase().trim();
  // ajuste conforme seus enums reais (aqui: ativa = já rodou/rodando/pausado)
  return s === "rodando" || s === "pausado" || s === "concluido";
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class MetaWebhookController {
  private meta = new MetaController();

  private defaultTipoAtendimento = String(process.env.META_DEFAULT_TIPO_ATENDIMENTO || "outro").trim() || "outro";

  /**
   * Janela para reabrir atendimento fechado (mensagem inbound)
   */
  private reopenWindowDays = 3;

  /**
   * Janela para achar disparo recente e vincular atendimento automaticamente
   * (se existir DisparoItem/Disparo para o número)
   */
  private disparoLookbackDays = Number(process.env.META_DISPARO_LOOKBACK_DAYS || 3);

  /**
   * Verificação do webhook (Meta)
   * Meta envia:
   *  hub.mode=subscribe
   *  hub.verify_token=...
   *  hub.challenge=...
   */
  verify(req: Request, res: Response) {
    try {
      const mode = String(req.query["hub.mode"] || "");
      const token = String(req.query["hub.verify_token"] || "");
      const challenge = String(req.query["hub.challenge"] || "");

      const verifyToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || "a1");

      if (mode === "subscribe" && token === verifyToken) {
        return res.status(200).send(challenge);
      }

      return res.sendStatus(403);
    } catch {
      return res.sendStatus(500);
    }
  }

  /**
   * Recebe webhook
   * - salva mensagens inbound
   * - atualiza status de mensagens
   * - garante atendimento aberto / reabre fechado recente / cria novo
   * - ✅ novo: tenta vincular ao Disparo/Atendente quando existir disparo recente
   */
  async receive(req: Request, res: Response) {
    try {
      const body = req.body as WebhookBody;

      // resposta rápida para a Meta
      res.status(200).json({ status: true });

      // processa em seguida
      await this.processWebhook(body);
    } catch (error) {
      Console({ type: "error", message: "Erro geral no receive do webhook." });
      ConsoleData({ type: "error", data: error });
      try {
        if (!res.headersSent) return res.status(500).json({ status: false, message: "Erro interno" });
      } catch {
        // ignore
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Core processing                                                          */
  /* ------------------------------------------------------------------------ */

  async processWebhook(body: WebhookBody) {
    try {
      if (body?.object !== "whatsapp_business_account") {
        return { status: true, message: "Ignorado (object != whatsapp_business_account)" };
      }

      const values = getValues(body);

      for (const value of values) {
        await this.processInboundMessages(value, body);
        await this.processStatuses(value);
      }

      return { status: true, message: "Webhook processado." };
    } catch (error) {
      Console({ type: "error", message: "Erro ao processar webhook." });
      ConsoleData({ type: "error", data: error });
      return { status: false, message: "Erro ao processar webhook." };
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Inbound messages                                                         */
  /* ------------------------------------------------------------------------ */

  private getMessages(value: WebhookValue) {
    const messages = value?.messages;
    return Array.isArray(messages) ? messages : [];
  }

  private getContacts(value: WebhookValue) {
    const contacts = value?.contacts;
    return Array.isArray(contacts) ? contacts : [];
  }

  private getMetadata(value: WebhookValue) {
    const md = value?.metadata || {};
    return {
      phoneNumberId: md?.phone_number_id ? String(md.phone_number_id) : undefined,
      displayPhone: md?.display_phone_number ? String(md.display_phone_number) : undefined,
      wabaId: md?.waba_id ? String(md.waba_id) : undefined,
    };
  }

  private async processInboundMessages(value: WebhookValue, rawBody: WebhookBody) {
    const messages = this.getMessages(value);
    if (!messages.length) return;

    const contacts = this.getContacts(value);
    const meta = this.getMetadata(value);

    for (const msg of messages) {
      const wamid = String(msg?.id || "");
      if (!wamid) continue;

      const from = digits(String(msg?.from || ""));
      if (!from) continue;

      const type = safeTipo(msg?.type);

      // nome do cliente (se veio em contacts)
      const contact = contacts.find((c) => digits(String(c?.wa_id || "")) === from);
      const clienteNome = contact?.profile?.name ? String(contact.profile.name) : "";

      // ✅ busca contexto de disparo (se existir disparo recente para o número)
      const disparoCtx = await this.findDisparoContextByPhone(from);

      // ✅ garante atendimento (e já tenta vincular atendente/disparo quando existir)
      const atendimento = await this.ensureAtendimento({
        numeroWhatsapp: from,
        clienteId: from, // por enquanto: clienteId = número
        clienteNome,
        disparoCtx,
      });

      // monta doc base
      const metaTs = toDateFromSeconds(msg?.timestamp);

      const baseDoc: Record<string, unknown> = {
        wamid,
        messageId: wamid,
        direction: "INBOUND",
        status: "RECEIVED",
        type,
        from,
        phoneNumberId: meta.phoneNumberId,
        wabaId: meta.wabaId,
        metaTimestamp: metaTs,
        atendimentoId: (atendimento as any)?._id,
        raw: rawBody,
      };

      // conteúdo por tipo
      if (type === "text") {
        baseDoc.text = { body: (msg as any)?.text?.body, preview_url: true };
      }

      if (["image", "audio", "video", "document", "sticker"].includes(type)) {
        const mediaObj = (msg as any)?.[type] as MetaMedia | undefined;
        baseDoc.media = {
          kind: type,
          id: mediaObj?.id,
          mime_type: mediaObj?.mime_type,
          sha256: mediaObj?.sha256,
          filename: mediaObj?.filename,
          caption: mediaObj?.caption,
        };

        // se tiver media id: baixa e sobe pro Cloudinary
        if (mediaObj?.id) {
          try {
            const saved = await this.meta.saveInboundMediaToCloudinary(String(mediaObj.id), "meta/inbound");
            if (saved?.cloudinary?.secure_url) {
              (baseDoc.media as any).link = saved.cloudinary.secure_url;
              (baseDoc.media as any).meta = {
                ...((baseDoc.media as any).meta || {}),
                cloudinary: saved.cloudinary,
                meta: saved.meta,
              };
            }
          } catch (e) {
            Console({ type: "error", message: "Falha ao salvar mídia inbound no Cloudinary." });
            ConsoleData({ type: "error", data: e });
          }
        }
      }

      if (type === "interactive") {
        const inter = (msg as any)?.interactive || {};
        const reply = inter?.button_reply || inter?.list_reply;
        baseDoc.interactive = {
          type: inter?.type || "unknown",
          id: reply?.id,
          title: reply?.title,
          description: reply?.description,
          payload: reply?.id,
          raw: inter,
        };
      }

      if (type === "location") {
        const loc = (msg as any)?.location || {};
        baseDoc.location = {
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          name: loc?.name,
          address: loc?.address,
          url: loc?.url,
          raw: loc,
        };
      }

      if (type === "contacts") {
        baseDoc.contacts = Array.isArray((msg as any)?.contacts) ? (msg as any).contacts : [];
      }

      if (type === "reaction") {
        const r = (msg as any)?.reaction || {};
        baseDoc.reaction = {
          message_id: r?.message_id,
          emoji: r?.emoji,
          raw: r,
        };
      }

      const { wamid: _ignoreWamid, ...baseDocNoWamid } = baseDoc;

      const saved = await MensagemModel.findOneAndUpdate(
        { wamid },
        {
          $setOnInsert: { wamid },
          $set: pickDefined(baseDocNoWamid),
          $push: {
            statuses: {
              status: "RECEIVED",
              timestamp: metaTs || new Date(),
              raw: rawBody,
            },
          },
        },
        { upsert: true, new: true }
      );

      // vincula no atendimento + atualiza métricas
      if (saved?._id && (atendimento as any)?._id) {
        const now = metaTs || new Date();

        await Atendimento.updateOne(
          { _id: (atendimento as any)._id },
          {
            $set: pickDefined({
              status: "aguardando-atendente",
              dataAtualizacao: now,
              dataUltimaMensagemCliente: now,
              clienteNome: clienteNome || undefined,

              // ✅ reforça vínculo (caso o atendimento tenha sido reaproveitado e ainda não tinha)
              ...(disparoCtx?.disparoId ? { disparoId: disparoCtx.disparoId } : {}),
              ...(disparoCtx?.atendenteId ? { atendenteId: disparoCtx.atendenteId } : {}),
              ...(disparoCtx?.atendenteId ? { atendente: disparoCtx.atendenteId } : {}),
            } as any),
            $addToSet: { mensagens: saved._id },
          }
        );

        // ✅ marca item do disparo como "respondeu" (opcional, não quebra se não achar)
        if (disparoCtx?.itemId) {
          try {
            await DisparoItem.updateOne(
              { _id: disparoCtx.itemId },
              {
                $set: {
                  status: "respondido",
                  finishedAt: now,
                },
              }
            );
          } catch {
            // ignore
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Status updates                                                           */
  /* ------------------------------------------------------------------------ */

  private getStatuses(value: WebhookValue) {
    const statuses = value?.statuses;
    return Array.isArray(statuses) ? statuses : [];
  }

  private async processStatuses(value: WebhookValue) {
    const statuses = this.getStatuses(value);
    if (!statuses.length) return;

    for (const st of statuses) {
      const wamid = String(st?.id || "");
      if (!wamid) continue;

      try {
        const main = mapStatusToMain(st?.status);
        const ts = toDateFromSeconds(st?.timestamp) || new Date();

        // atualiza mensagem
        await MensagemModel.updateOne(
          { wamid },
          {
            $set: pickDefined({
              status: main,
              conversationId: st?.conversation?.id ? String(st.conversation.id) : undefined,
              metaTimestamp: ts,
            }),
            $push: {
              statuses: { status: main, timestamp: ts, raw: st },
            },
          }
        );

        // ✅ atualiza DisparoItem.meta (quando a mensagem foi enviada por disparo)
        // o sendNext normalmente salva messageId em DisparoItem.meta.messageId
        const metaPatch: Record<string, unknown> = {
          "meta.messageId": wamid,
          "meta.lastStatus": String(st?.status || "").toUpperCase(),
        };

        if (main === "SENT") metaPatch["meta.sentAt"] = ts;
        if (main === "DELIVERED") metaPatch["meta.deliveredAt"] = ts;
        if (main === "READ") metaPatch["meta.readAt"] = ts;

        await DisparoItem.updateOne(
          { "meta.messageId": wamid },
          {
            $set: metaPatch,
          }
        );

        // (opcional) se quiser atualizar atendimento quando READ/DELIVERED, faça aqui
      } catch (error) {
        Console({ type: "error", message: "Erro ao processar status (Meta)." });
        ConsoleData({ type: "error", data: error });
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Disparo lookup                                                           */
  /* ------------------------------------------------------------------------ */

  /**
   * Procura o último DisparoItem recente pelo telefone (phoneE164/phoneRaw),
   * e retorna atendenteId + disparoId (se o disparo estiver ativo).
   */
  private async findDisparoContextByPhone(phone: string): Promise<DisparoContext | null> {
    try {
      const p = normalizeBRBase10(phone);
      if (!p) return null;

      const since = startOfDaysAgo(this.disparoLookbackDays);

      // busca por item recente com o telefone
      const item = await DisparoItem.findOne({
        $and: [
          {
            $or: [{ phoneE164: p }, { phoneRaw: p }, { phoneRaw: phone }, { phoneE164: phone }],
          },
          { createdAt: { $gte: since } },
        ],
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!item?.disparoId) return null;

      const disparo = await Disparo.findById(item.disparoId).lean();
      if (!disparo) return null;

      const disparoStatus = String((disparo as any)?.status || "");
      if (!isActiveDisparoStatus(disparoStatus)) return null;

      const atendenteId = String((disparo as any)?.atendenteId || "").trim();
      const disparoId = String((disparo as any)?._id || "").trim();

      return {
        itemId: String((item as any)?._id || ""),
        disparoId: disparoId || undefined,
        atendenteId: atendenteId || undefined,
        disparoStatus: disparoStatus || undefined,
      };
    } catch (e) {
      Console({ type: "error", message: "Falha ao buscar contexto de Disparo pelo telefone." });
      ConsoleData({ type: "error", data: e });
      return null;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Atendimento rules                                                        */
  /* ------------------------------------------------------------------------ */

  private async ensureAtendimento(params: {
    numeroWhatsapp: string;
    clienteId: string;
    clienteNome?: string;
    disparoCtx?: DisparoContext | null;
  }) {
    const numeroWhatsapp = normalizeBRBase10(params.numeroWhatsapp);
    const disparoCtx = params.disparoCtx || null;

    // 0) ✅ se existir atendimento ativo E já estiver vinculado, só retorna
    // (ou, se não estiver vinculado e existe ctx, faz "attach" no atendimento)
    const ativo = await Atendimento.findOne({
      numeroWhatsapp,
      tipo: this.defaultTipoAtendimento,
      status: { $in: ["aberto", "aguardando-atendente", "aguardando-cliente"] },
    })
      .sort({ dataAtualizacao: -1 })
      .lean();

    if (ativo) {
      // ✅ se veio um disparo ativo e o atendimento ainda não tem atendente/disparo, vincula
      const needAttach =
        Boolean(disparoCtx?.disparoId || disparoCtx?.atendenteId) &&
        (!String((ativo as any)?.disparoId || "") || !String((ativo as any)?.atendenteId || (ativo as any)?.atendente || ""));

      if (needAttach) {
        await Atendimento.updateOne(
          { _id: (ativo as any)._id },
          {
            $set: pickDefined({
              ...(disparoCtx?.disparoId ? { disparoId: disparoCtx.disparoId } : {}),
              ...(disparoCtx?.atendenteId ? { atendenteId: disparoCtx.atendenteId } : {}),
              ...(disparoCtx?.atendenteId ? { atendente: disparoCtx.atendenteId } : {}),
              dataAtualizacao: new Date(),
            } as any),
            $push: {
              historico: {
                title: "Vínculo automático (Disparo)",
                content: `Atendimento vinculado automaticamente ao disparo${disparoCtx?.disparoId ? ` ${disparoCtx.disparoId}` : ""} (atendente ${disparoCtx?.atendenteId || "—"}).`,
                date: new Date(),
                user: "system",
              },
            },
          }
        );

        const updated = await Atendimento.findById((ativo as any)._id).lean();
        if (updated) return updated;
      }

      return ativo;
    }

    // 1) fechado recente (até N dias) -> reabre
    const fechado = await Atendimento.findOne({
      numeroWhatsapp,
      tipo: this.defaultTipoAtendimento,
      status: { $in: ["fechado", "cancelado"] },
    })
      .sort({ dataFim: -1, dataAtualizacao: -1 })
      .lean();

    if (fechado?.dataFim && isWithinDays(new Date(fechado.dataFim), this.reopenWindowDays)) {
      await Atendimento.updateOne(
        { _id: (fechado as any)._id },
        {
          $set: pickDefined({
            status: "aberto",
            dataFim: null,
            dataAtualizacao: new Date(),

            ...(disparoCtx?.disparoId ? { disparoId: disparoCtx.disparoId } : {}),
            ...(disparoCtx?.atendenteId ? { atendenteId: disparoCtx.atendenteId } : {}),
            ...(disparoCtx?.atendenteId ? { atendente: disparoCtx.atendenteId } : {}),
          } as any),
          $push: {
            historico: {
              title: "Atendimento reaberto",
              content: "Reaberto automaticamente por nova mensagem do cliente.",
              date: new Date(),
              user: "system",
            },
          },
        }
      );

      const reopened = await Atendimento.findById((fechado as any)._id).lean();
      if (reopened) return reopened;
    }

    // 2) cria novo
    const created = await Atendimento.create({
      tipo: this.defaultTipoAtendimento,
      status: "aberto",
      numeroWhatsapp,
      clienteId: params.clienteId,
      clienteNome: params.clienteNome || "",

      // ✅ se existe ctx de disparo, já cria com atendente/disparo
      ...(disparoCtx?.disparoId ? { disparoId: disparoCtx.disparoId } : {}),
      ...(disparoCtx?.atendenteId ? { atendenteId: disparoCtx.atendenteId } : {}),
      ...(disparoCtx?.atendenteId ? { atendente: disparoCtx.atendenteId } : {}),

      historico: [
        {
          title: "Atendimento criado",
          content: disparoCtx?.disparoId
            ? `Criado automaticamente via webhook da Meta e vinculado ao disparo ${disparoCtx.disparoId} (atendente ${disparoCtx.atendenteId || "—"}).`
            : "Criado automaticamente via webhook da Meta.",
          date: new Date(),
          user: "system",
        },
      ],
    });

    return created.toObject();
  }
}
