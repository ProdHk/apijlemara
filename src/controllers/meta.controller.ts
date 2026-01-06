// src/controllers/meta.controller.ts
import type { Request, Response } from "express";
import axios, { AxiosError, AxiosInstance } from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import { configDotenv } from "dotenv";

import Console, { ConsoleData } from "../lib/Console";
import Atendimento from "../models/Atendimento";
import MensagemModel, { MensagemTipo, MensagemTypes } from "../models/Mensagem";
import CloudinaryController from "./cloudinary.controller";
import { normalizeBRBase10 } from "../lib/phone";

configDotenv();

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
/* -------------------------------------------------------------------------- */


function pickWaIdFromMetaSend(meta: any): string | null {
  const wa = meta?.contacts?.[0]?.wa_id;
  return wa ? String(wa) : null;
}

function env(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Defina ${name} no .env`);
  return String(v);
}

function cleanDigits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function tmpFile(ext?: string) {
  const name = `meta_${Date.now()}_${Math.random().toString(16).slice(2)}${ext ? `.${ext}` : ""}`;
  return path.join(os.tmpdir(), name);
}

function makeReqId(prefix = "meta") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function pickAxiosError(e: any) {
  const ax = e as AxiosError<any>;
  return {
    message: ax?.message,
    code: (ax as any)?.code,
    status: ax?.response?.status,
    statusText: ax?.response?.statusText,
    data: ax?.response?.data,
    url: ax?.config?.url,
    method: ax?.config?.method,
    baseURL: ax?.config?.baseURL,
  };
}

/* -------------------------------------------------------------------------- */
/* Meta API Types (mínimo necessário)                                         */
/* -------------------------------------------------------------------------- */

type MetaSendResult = {
  messaging_product?: "whatsapp";
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string }>;
};

type MetaMediaInfo = {
  id: string;
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
};

type MetaTemplateListResult = any;
type MetaTemplateCreateResult = any;

type SendTextInput = {
  to: string;
  body: string;
  preview_url?: boolean;
  phoneNumberId?: string;
  atendimentoId?: string;
  biz_opaque_callback_data?: string;
};

type SendMediaInput = {
  to: string;
  type: Exclude<
    MensagemTipo,
    "template" | "interactive" | "location" | "contacts" | "reaction" | "unknown" | "text"
  >;
  caption?: string;
  filename?: string;
  link?: string;
  filePath?: string;
  phoneNumberId?: string;
  atendimentoId?: string;
  biz_opaque_callback_data?: string;
};

type SendLocationInput = {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  phoneNumberId?: string;
  atendimentoId?: string;
  biz_opaque_callback_data?: string;
};

type SendTemplateInput = {
  to: string;
  name: string;
  language?: string;
  components?: any[];
  phoneNumberId?: string;
  atendimentoId?: string;
  biz_opaque_callback_data?: string;
};

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class MetaController {
  private api: AxiosInstance;
  private cloudinary = new CloudinaryController();

  private token = env("META_WA_TOKEN");
  private base = env("WHATSAPP_GRAPH_BASE");
  private version = env("WHATSAPP_API_VERSION");
  private defaultPhoneNumberId = env("META_WA_PHONE_NUMBER_ID");
  private defaultWabaId = env("META_WABA_ID");
  private defaultTipoAtendimento = process.env.META_DEFAULT_TIPO_ATENDIMENTO || "outro";
  private defaultLanguage = process.env.META_DEFAULT_LANGUAGE || "pt_BR";

  constructor() {
    const baseURL = `${this.base}/${this.version}`;

    this.api = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    Console({
      type: "log",
      message: `[META] Controller iniciado. baseURL=${baseURL} defaultPhoneNumberId=${this.defaultPhoneNumberId} defaultWabaId=${this.defaultWabaId}`,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                  */
  /* ------------------------------------------------------------------------ */

  private phoneNumberIdOrDefault(input?: string) {
    const v = String(input || "").trim();
    return v ? v : this.defaultPhoneNumberId;
  }

  private wabaIdOrDefault(input?: string) {
    const v = String(input || "").trim();
    return v ? v : this.defaultWabaId;
  }

  private async ensureAtendimentoForOutbound(params: {
    toDigits: string;
    atendimentoId?: string;
    clienteNome?: string;
    waId?: string | null;
  }) {
    if (params.atendimentoId) {
      const at = await Atendimento.findById(params.atendimentoId).lean();
      if (at) return at;
    }

    const original = cleanDigits(params.toDigits);
    const canon = normalizeBRBase10(original);
    const waId = params.waId ? cleanDigits(params.waId) : "";

    // 1) se tiver waId: busca por waId
    if (waId) {
      const byWa = await Atendimento.findOne({
        waId,
        status: { $in: ["aberto", "aguardando-atendente", "aguardando-cliente"] },
      })
        .sort({ dataAtualizacao: -1 })
        .lean();

      if (byWa) {
        await Atendimento.updateOne(
          { _id: byWa._id },
          {
            $set: { numeroWhatsappCanon: canon, numeroWhatsapp: canon },
            $addToSet: { numeroWhatsappAliases: { $each: [original, canon].filter(Boolean) } },
          }
        );
        return byWa;
      }
    }

    // 2) fallback por canon ou aliases
    const ativo = await Atendimento.findOne({
      $or: [
        { numeroWhatsappCanon: canon },
        { numeroWhatsapp: canon }, // legado
        { numeroWhatsappAliases: original },
        { numeroWhatsappAliases: canon },
      ],
      tipo: this.defaultTipoAtendimento,
      status: { $in: ["aberto", "aguardando-atendente", "aguardando-cliente"] },
    })
      .sort({ dataAtualizacao: -1 })
      .lean();

    if (ativo) {
      await Atendimento.updateOne(
        { _id: ativo._id },
        {
          ...(waId ? { $set: { waId } } : {}),
          $set: { numeroWhatsappCanon: canon, numeroWhatsapp: canon },
          $addToSet: { numeroWhatsappAliases: { $each: [original, canon].filter(Boolean) } },
        }
      );
      return ativo;
    }

    // 3) cria novo
    const created = await Atendimento.create({
      tipo: this.defaultTipoAtendimento,
      status: "aberto",
      waId: waId || undefined,
      numeroWhatsapp: canon, // compat UI
      numeroWhatsappCanon: canon,
      numeroWhatsappAliases: Array.from(new Set([original, canon].filter(Boolean))),
      clienteId: waId || canon,
      clienteNome: params.clienteNome || "",
      historico: [
        {
          title: "Atendimento criado",
          content: "Criado automaticamente (envio outbound).",
          date: new Date(),
          user: "system",
        },
      ],
    });

    return created.toObject();
  }

  private async registerOutboundMessage(params: {
    reqId?: string;
    wamid: string;
    toDigits: string;
    phoneNumberId: string;
    type: MensagemTipo;
    textBody?: string;
    textPreviewUrl?: boolean;
    media?: MensagemTypes["media"];
    template?: MensagemTypes["template"];
    location?: MensagemTypes["location"];
    raw?: any;
    bizOpaqueCallbackData?: string;
    atendimentoId?: string;
    waId?: string | null;
  }) {
    const reqId = params.reqId || makeReqId("out_reg");
    const canon = normalizeBRBase10(cleanDigits(params.toDigits));

    const atendimento = await this.ensureAtendimentoForOutbound({
      toDigits: canon,
      atendimentoId: params.atendimentoId,
      waId: params.waId,
    });

    const doc: Partial<MensagemTypes> = {
      wamid: params.wamid,
      messageId: params.wamid,
      direction: "OUTBOUND",
      status: "SENT",
      type: params.type,
      to: canon, // ✅ sempre canonical
      phoneNumberId: params.phoneNumberId,
      wabaId: this.defaultWabaId,
      bizOpaqueCallbackData: params.bizOpaqueCallbackData ?? null,
      text: params.textBody
        ? { body: params.textBody, preview_url: params.textPreviewUrl ?? true }
        : undefined,
      media: params.media,
      template: params.template,
      location: params.location,
      atendimentoId: atendimento?._id,
      metaTimestamp: new Date(),
      raw: params.raw,
    };

    const { wamid: _ignoreWamid, ...docNoWamid } = doc;

    try {
      const saved = await MensagemModel.findOneAndUpdate(
        { wamid: params.wamid },
        {
          $setOnInsert: { wamid: params.wamid },
          $set: docNoWamid,
          $push: {
            statuses: {
              status: "SENT",
              timestamp: new Date(),
              raw: params.raw,
            },
          },
        },
        { upsert: true, new: true }
      );

      if (saved?._id && atendimento?._id) {
        await Atendimento.updateOne(
          { _id: atendimento._id },
          {
            $set: {
              status: "aguardando-cliente",
              dataAtualizacao: new Date(),
              dataUltimaMensagemAtendente: new Date(),
            },
            $addToSet: { mensagens: saved._id },
          }
        );
      }

      Console({
        type: "success",
        message: `[META][${reqId}] Outbound registrado. msgId=${String(saved?._id || "")} atendimentoId=${String(
          atendimento?._id || ""
        )} to=${canon} waId=${String(params.waId || "")}`,
      });

      return saved;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] Falha ao registrar outbound (Mongo).` });
      ConsoleData({ type: "error", data: e });
      throw e;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Templates                                                                */
  /* ------------------------------------------------------------------------ */

  async listTemplates(wabaId?: string): Promise<MetaTemplateListResult> {
    const reqId = makeReqId("list_tpl");
    const id = this.wabaIdOrDefault(wabaId);

    Console({ type: "log", message: `[META][${reqId}] Listando templates wabaId=${id}` });

    const t0 = Date.now();
    try {
      const res = await this.api.get(`/${id}/message_templates`, { params: { limit: 200 } });
      Console({ type: "success", message: `[META][${reqId}] Templates ok (${Date.now() - t0}ms)` });
      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] Erro ao listar templates.` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  async createTemplate(payload: any, wabaId?: string): Promise<MetaTemplateCreateResult> {
    const reqId = makeReqId("create_tpl");
    const id = this.wabaIdOrDefault(wabaId);

    Console({ type: "log", message: `[META][${reqId}] Criando template wabaId=${id}` });
    ConsoleData({ type: "log", data: { payload } });

    const t0 = Date.now();
    try {
      const res = await this.api.post(`/${id}/message_templates`, payload);
      Console({ type: "success", message: `[META][${reqId}] Create template ok (${Date.now() - t0}ms)` });
      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] Erro ao criar template.` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Send                                                                     */
  /* ------------------------------------------------------------------------ */

  async sendText(input: SendTextInput) {
    const reqId = makeReqId("send_text");
    const toRaw = cleanDigits(input.to);
    const to = normalizeBRBase10(toRaw);
    const phoneNumberId = this.phoneNumberIdOrDefault(input.phoneNumberId);

    if (!to) throw new Error("Destino inválido (to).");

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: input.body,
        preview_url: input.preview_url ?? true,
      },
      ...(input.biz_opaque_callback_data ? { biz_opaque_callback_data: input.biz_opaque_callback_data } : {}),
    };

    Console({ type: "log", message: `[META][${reqId}] sendText -> /${phoneNumberId}/messages to=${to}` });
    ConsoleData({ type: "log", data: { payload } });

    const t0 = Date.now();
    try {
      const res = await this.api.post<MetaSendResult>(`/${phoneNumberId}/messages`, payload);
      Console({ type: "success", message: `[META][${reqId}] sendText ok (${Date.now() - t0}ms)` });
      ConsoleData({ type: "log", data: res.data });

      const wamid = String(res.data?.messages?.[0]?.id || "");
      const waId = pickWaIdFromMetaSend(res.data); // ✅

      if (wamid) {
        await this.registerOutboundMessage({
          reqId,
          wamid,
          toDigits: to,
          phoneNumberId,
          type: "text",
          textBody: input.body,
          textPreviewUrl: input.preview_url ?? true,
          raw: res.data,
          bizOpaqueCallbackData: input.biz_opaque_callback_data,
          atendimentoId: input.atendimentoId,
          waId,
        });
      }

      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] sendText falhou (${Date.now() - t0}ms)` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  async sendLocation(input: SendLocationInput) {
    const reqId = makeReqId("send_loc");
    const toRaw = cleanDigits(input.to);
    const to = normalizeBRBase10(toRaw);
    const phoneNumberId = this.phoneNumberIdOrDefault(input.phoneNumberId);

    if (!to) throw new Error("Destino inválido (to).");

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "location",
      location: {
        latitude: input.latitude,
        longitude: input.longitude,
        ...(input.name ? { name: input.name } : {}),
        ...(input.address ? { address: input.address } : {}),
      },
      ...(input.biz_opaque_callback_data ? { biz_opaque_callback_data: input.biz_opaque_callback_data } : {}),
    };

    Console({ type: "log", message: `[META][${reqId}] sendLocation -> /${phoneNumberId}/messages to=${to}` });
    ConsoleData({ type: "log", data: { payload } });

    const t0 = Date.now();
    try {
      const res = await this.api.post<MetaSendResult>(`/${phoneNumberId}/messages`, payload);
      Console({ type: "success", message: `[META][${reqId}] sendLocation ok (${Date.now() - t0}ms)` });
      ConsoleData({ type: "log", data: res.data });

      const wamid = String(res.data?.messages?.[0]?.id || "");
      const waId = pickWaIdFromMetaSend(res.data); // ✅

      if (wamid) {
        await this.registerOutboundMessage({
          reqId,
          wamid,
          toDigits: to,
          phoneNumberId,
          type: "location",
          location: payload.location,
          raw: res.data,
          bizOpaqueCallbackData: input.biz_opaque_callback_data,
          atendimentoId: input.atendimentoId,
          waId,
        });
      }

      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] sendLocation falhou (${Date.now() - t0}ms)` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  async sendTemplate(input: SendTemplateInput) {
    const reqId = makeReqId("send_tpl");
    const toRaw = cleanDigits(input.to);
    const to = normalizeBRBase10(toRaw);
    if (!to) throw new Error("Destino inválido (to).");

    const phoneNumberId = this.phoneNumberIdOrDefault(input.phoneNumberId);

    const templateName = String((input as any).name || (input as any).templateName || "").trim();
    if (!templateName) {
      Console({ type: "error", message: `[META][${reqId}] Template name ausente (name/templateName).` });
      ConsoleData({ type: "error", data: { input } });
      throw new Error("Template name ausente (name/templateName).");
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: input.language || this.defaultLanguage },
        ...(Array.isArray(input.components) ? { components: input.components } : {}),
      },
      ...(input.biz_opaque_callback_data ? { biz_opaque_callback_data: input.biz_opaque_callback_data } : {}),
    };

    Console({
      type: "log",
      message: `[META][${reqId}] sendTemplate -> /${phoneNumberId}/messages to=${to} template=${templateName}`,
    });
    ConsoleData({ type: "log", data: { payload } });

    const t0 = Date.now();
    try {
      const res = await this.api.post<MetaSendResult>(`/${phoneNumberId}/messages`, payload);
      Console({ type: "success", message: `[META][${reqId}] sendTemplate ok (${Date.now() - t0}ms)` });
      ConsoleData({ type: "log", data: res.data });

      const wamid = String(res.data?.messages?.[0]?.id || "");
      const waId = pickWaIdFromMetaSend(res.data); // ✅

      if (wamid) {
        await this.registerOutboundMessage({
          reqId,
          wamid,
          toDigits: to,
          phoneNumberId,
          type: "template",
          template: {
            name: templateName,
            language: input.language || this.defaultLanguage,
            components: input.components,
          },
          raw: res.data,
          bizOpaqueCallbackData: input.biz_opaque_callback_data,
          atendimentoId: input.atendimentoId,
          waId,
        });
      }

      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] sendTemplate falhou (${Date.now() - t0}ms)` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  async sendMedia(input: SendMediaInput) {
    const reqId = makeReqId("send_media");
    const toRaw = cleanDigits(input.to);
    const to = normalizeBRBase10(toRaw);
    const phoneNumberId = this.phoneNumberIdOrDefault(input.phoneNumberId);

    if (!to) throw new Error("Destino inválido (to).");

    let link = input.link?.trim() || "";
    let cloudinaryMeta: any = null;

    if (!link && input.filePath) {
      Console({ type: "log", message: `[META][${reqId}] Upload Cloudinary (filePath) -> ${input.filePath}` });
      const up = await this.cloudinary.uploadFile(input.filePath, "meta/outbound");
      if (!up?.secure_url) throw new Error("Falha ao subir mídia no Cloudinary");
      link = up.secure_url;
      cloudinaryMeta = up;
    }

    if (!link) throw new Error("Envie link ou filePath para mídia.");

    const payload: any = {
      messaging_product: "whatsapp",
      to,
      type: input.type,
      [input.type]: {
        link,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.type === "document" && input.filename ? { filename: input.filename } : {}),
      },
      ...(input.biz_opaque_callback_data ? { biz_opaque_callback_data: input.biz_opaque_callback_data } : {}),
    };

    Console({
      type: "log",
      message: `[META][${reqId}] sendMedia -> /${phoneNumberId}/messages to=${to} type=${input.type}`,
    });
    ConsoleData({ type: "log", data: { payload } });

    const t0 = Date.now();
    try {
      const res = await this.api.post<MetaSendResult>(`/${phoneNumberId}/messages`, payload);
      Console({ type: "success", message: `[META][${reqId}] sendMedia ok (${Date.now() - t0}ms)` });
      ConsoleData({ type: "log", data: res.data });

      const wamid = String(res.data?.messages?.[0]?.id || "");
      const waId = pickWaIdFromMetaSend(res.data); // ✅

      if (wamid) {
        await this.registerOutboundMessage({
          reqId,
          wamid,
          toDigits: to,
          phoneNumberId,
          type: input.type,
          media: {
            kind: input.type,
            link,
            caption: input.caption,
            filename: input.filename,
            meta: cloudinaryMeta ? { cloudinary: cloudinaryMeta } : undefined,
          },
          raw: res.data,
          bizOpaqueCallbackData: input.biz_opaque_callback_data,
          atendimentoId: input.atendimentoId,
          waId,
        });
      }

      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] sendMedia falhou (${Date.now() - t0}ms)` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  async markAsRead(wamid: string, phoneNumberId?: string) {
    const reqId = makeReqId("mark_read");
    const id = this.phoneNumberIdOrDefault(phoneNumberId);

    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
    };

    Console({ type: "log", message: `[META][${reqId}] markAsRead -> /${id}/messages wamid=${wamid}` });

    try {
      const res = await this.api.post(`/${id}/messages`, payload);
      Console({ type: "success", message: `[META][${reqId}] markAsRead ok` });
      return res.data;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] markAsRead falhou` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Media inbound: Meta -> temp file -> Cloudinary                            */
  /* ------------------------------------------------------------------------ */

  async getMediaInfo(mediaId: string): Promise<MetaMediaInfo> {
    const reqId = makeReqId("media_info");
    Console({ type: "log", message: `[META][${reqId}] getMediaInfo id=${mediaId}` });

    try {
      const res = await this.api.get(`/${mediaId}`);
      Console({ type: "success", message: `[META][${reqId}] getMediaInfo ok` });
      return res.data as MetaMediaInfo;
    } catch (e) {
      Console({ type: "error", message: `[META][${reqId}] getMediaInfo falhou` });
      ConsoleData({ type: "error", data: pickAxiosError(e) });
      throw e;
    }
  }

  private async downloadMediaToTempFile(mediaUrl: string, suggestedMime?: string) {
    let ext = "";
    if (suggestedMime) {
      if (suggestedMime.includes("jpeg")) ext = "jpg";
      else if (suggestedMime.includes("png")) ext = "png";
      else if (suggestedMime.includes("pdf")) ext = "pdf";
      else if (suggestedMime.includes("mp3")) ext = "mp3";
      else if (suggestedMime.includes("ogg")) ext = "ogg";
      else if (suggestedMime.includes("mp4")) ext = "mp4";
    }

    const filePath = tmpFile(ext);

    const resp = await axios.get(mediaUrl, {
      responseType: "stream",
      headers: { Authorization: `Bearer ${this.token}` },
      timeout: 60_000,
    });

    await new Promise<void>((resolve, reject) => {
      const w = fs.createWriteStream(filePath);
      resp.data.pipe(w);
      w.on("finish", () => resolve());
      w.on("error", (e) => reject(e));
    });

    return filePath;
  }

  async saveInboundMediaToCloudinary(mediaId: string, folder = "meta/inbound") {
    const reqId = makeReqId("in_media");
    Console({ type: "log", message: `[META][${reqId}] saveInboundMediaToCloudinary mediaId=${mediaId}` });

    const info = await this.getMediaInfo(mediaId);
    if (!info?.url) throw new Error("Meta não retornou url do media.");

    const filePath = await this.downloadMediaToTempFile(info.url, info.mime_type);

    try {
      const up = await this.cloudinary.uploadFile(filePath, folder);
      if (!up?.secure_url) throw new Error("Upload Cloudinary falhou.");

      Console({ type: "success", message: `[META][${reqId}] inbound media up ok` });
      return { meta: info, cloudinary: up };
    } finally {
      try {
        fs.unlinkSync(filePath);
      } catch { }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Express handlers                                                          */
  /* ------------------------------------------------------------------------ */

  async httpListTemplates(req: Request, res: Response) {
    const reqId = makeReqId("http_list_tpl");
    try {
      const { wabaId } = (req.query || {}) as any;
      const data = await this.listTemplates(wabaId ? String(wabaId) : undefined);
      return res.json({ status: true, data });
    } catch (error) {
      Console({ type: "error", message: `[META][${reqId}] Erro ao listar templates (HTTP).` });
      ConsoleData({ type: "error", data: error });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }
}
