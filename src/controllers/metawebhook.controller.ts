// src/controllers/metawebhook.controller.ts
import type { Request, Response } from "express";
import Console, { ConsoleData } from "../lib/Console";

import Atendimento from "../models/Atendimento";
import MensagemModel, { MensagemTipo, MensagemMainStatus } from "../models/Mensagem";
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
      value?: any;
    }>;
  }>;
};

type WebhookValue = any;

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

function safeTipo(msgType: any): MensagemTipo {
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
  // recebido via webhook (inbound) nós gravamos como RECEIVED
  return "PENDING";
}

function pickDefined<T extends object>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class MetaWebhookController {
  private meta = new MetaController();

  private defaultTipoAtendimento = process.env.META_DEFAULT_TIPO_ATENDIMENTO || "outro";
  private reopenWindowDays = 3;

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
    } catch (error) {
      return res.sendStatus(500);
    }
  }

  /**
   * Recebe webhook
   * - salva mensagens inbound
   * - atualiza status de mensagens
   * - garante atendimento aberto / reabre fechado recente / cria novo
   */
  async receive(req: Request, res: Response) {
    try {
      const body = req.body as WebhookBody;

      // resposta rápida para a Meta
      res.status(200).json({ status: true });

      // processa em seguida (no mesmo ciclo, mas resposta já foi enviada)
      await this.processWebhook(body);
    } catch (error) {
      Console({ type: "error", message: "Erro geral no receive do webhook." });
      ConsoleData({ type: "error", data: error });
      // se já respondeu, não dá pra alterar; se não respondeu, manda 500
      try {
        if (!res.headersSent) return res.status(500).json({ status: false, message: "Erro interno" });
      } catch { }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Core processing                                                           */
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
  /* Inbound messages                                                          */
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

      const from = digits(msg?.from);
      const type = safeTipo(msg?.type);

      // nome do cliente (se veio em contacts)
      const contact = contacts.find((c: any) => digits(c?.wa_id) === from);
      const clienteNome = contact?.profile?.name ? String(contact.profile.name) : "";

      // garante atendimento
      const atendimento = await this.ensureAtendimento({
        numeroWhatsapp: from,
        clienteId: from, // por enquanto: clienteId = número (mapeamento externo pode vir depois)
        clienteNome,
      });

      // monta doc base
      const baseDoc: any = {
        wamid,
        messageId: wamid,
        direction: "INBOUND",
        status: "RECEIVED",
        type,
        from,
        phoneNumberId: meta.phoneNumberId,
        wabaId: meta.wabaId,
        metaTimestamp: toDateFromSeconds(msg?.timestamp),
        atendimentoId: atendimento?._id,
        raw: rawBody,
      };

      // conteúdo por tipo
      if (type === "text") {
        baseDoc.text = { body: msg?.text?.body, preview_url: true };
      }

      if (["image", "audio", "video", "document", "sticker"].includes(type)) {
        const mediaObj = msg?.[type] || {};
        baseDoc.media = {
          kind: type,
          id: mediaObj?.id,
          mime_type: mediaObj?.mime_type,
          sha256: mediaObj?.sha256,
          filename: mediaObj?.filename,
          caption: mediaObj?.caption,
        };

        // se tiver media id: baixa e sobe pro Cloudinary (evita depender do Graph depois)
        if (mediaObj?.id) {
          try {
            const saved = await this.meta.saveInboundMediaToCloudinary(String(mediaObj.id), "meta/inbound");
            if (saved?.cloudinary?.secure_url) {
              baseDoc.media.link = saved.cloudinary.secure_url;
              baseDoc.media.meta = {
                ...(baseDoc.media.meta || {}),
                cloudinary: saved.cloudinary,
                meta: saved.meta,
              };
            }
          } catch (e) {
            // não falha o webhook por isso — só registra
            Console({ type: "error", message: "Falha ao salvar mídia inbound no Cloudinary." });
            ConsoleData({ type: "error", data: e });
          }
        }
      }

      if (type === "interactive") {
        const inter = msg?.interactive || {};
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
        const loc = msg?.location || {};
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
        baseDoc.contacts = Array.isArray(msg?.contacts) ? msg.contacts : [];
      }

      if (type === "reaction") {
        const r = msg?.reaction || {};
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
              timestamp: baseDoc.metaTimestamp || new Date(),
              raw: rawBody,
            },
          },
        },
        { upsert: true, new: true }
      );


      // vincula no atendimento + atualiza métricas
      if (saved?._id && atendimento?._id) {
        await Atendimento.updateOne(
          { _id: atendimento._id },
          {
            $set: {
              status: "aguardando-atendente",
              dataAtualizacao: baseDoc.metaTimestamp || new Date(),
              dataUltimaMensagemCliente: baseDoc.metaTimestamp || new Date(),
              clienteNome: clienteNome || undefined,
            },
            $addToSet: { mensagens: saved._id },
          }
        );
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Status updates                                                            */
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

        // se quiser: quando READ, você pode atualizar métricas do atendimento (opcional)
      } catch (error) {
        Console({ type: "error", message: "Erro ao processar status (Meta)." });
        ConsoleData({ type: "error", data: error });
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Atendimento rules                                                         */
  /* ------------------------------------------------------------------------ */

  private async ensureAtendimento(params: {
    numeroWhatsapp: string;
    clienteId: string;
    clienteNome?: string;
  }) {
    const numeroWhatsapp = normalizeBRBase10(params.numeroWhatsapp);

    // 1) atendimento ativo
    const ativo = await Atendimento.findOne({
      numeroWhatsapp,
      tipo: this.defaultTipoAtendimento,
      status: { $in: ["aberto", "aguardando-atendente", "aguardando-cliente"] },
    })
      .sort({ dataAtualizacao: -1 })
      .lean();

    if (ativo) return ativo;

    // 2) fechado recente (até N dias)
    const fechado = await Atendimento.findOne({
      numeroWhatsapp,
      tipo: this.defaultTipoAtendimento,
      status: { $in: ["fechado", "cancelado"] },
    })
      .sort({ dataFim: -1, dataAtualizacao: -1 })
      .lean();

    if (fechado?.dataFim && isWithinDays(new Date(fechado.dataFim), this.reopenWindowDays)) {
      await Atendimento.updateOne(
        { _id: fechado._id },
        {
          $set: {
            status: "aberto",
            dataFim: null,
            dataAtualizacao: new Date(),
          },
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

      const reopened = await Atendimento.findById(fechado._id).lean();
      if (reopened) return reopened;
    }

    // 3) cria novo
    const created = await Atendimento.create({
      tipo: this.defaultTipoAtendimento,
      status: "aberto",
      numeroWhatsapp,
      clienteId: params.clienteId,
      clienteNome: params.clienteNome || "",
      historico: [
        {
          title: "Atendimento criado",
          content: "Criado automaticamente via webhook da Meta.",
          date: new Date(),
          user: "system",
        },
      ],
    });

    return created.toObject();
  }
}
