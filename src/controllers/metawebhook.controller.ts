// src/controllers/metawebhook.controller.ts
import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";

import Console, { ConsoleData } from "../lib/Console";

import MensagemController from "../controllers/mensagem.controller";
import AtendimentoController from "../controllers/atendimento.controller";

import CloudinaryController from "../controllers/cloudinary.controller";

type WebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string; // seconds (string)
  type?: string;

  text?: { body?: string; preview_url?: boolean };

  image?: { id?: string; mime_type?: string; sha256?: string; caption?: string;[k: string]: any };
  audio?: { id?: string; mime_type?: string; sha256?: string;[k: string]: any };
  video?: { id?: string; mime_type?: string; sha256?: string; caption?: string;[k: string]: any };
  document?: { id?: string; mime_type?: string; sha256?: string; filename?: string; caption?: string;[k: string]: any };
  sticker?: { id?: string; mime_type?: string; sha256?: string;[k: string]: any };

  location?: any;
  contacts?: any;
  interactive?: any;
  context?: any;
  reaction?: any;

  [k: string]: any;
};

type WebhookStatus = {
  id?: string;
  status?: string; // sent/delivered/read/failed...
  timestamp?: string; // seconds
  recipient_id?: string;
  conversation?: { id?: string };
  pricing?: any;
  errors?: any[];
  [k: string]: any;
};

type WebhookChangeValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string; waba_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<WebhookMessage>;
  statuses?: Array<WebhookStatus>;
  [k: string]: any;
};

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: WebhookChangeValue }>;
  }>;
};

function digits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function toE164(raw?: string | number | null): string | undefined {
  if (raw == null) return undefined;
  const d = digits(String(raw));
  if (!d) return undefined;
  return d.startsWith("55") ? d : `55${d}`;
}

function toDateFromSeconds(ts?: string | number | null) {
  if (!ts) return null;
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000);
}

function safeUnlink(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function mapStatus(status?: string) {
  const s = String(status || "").toLowerCase();
  const map: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED" | "PENDING" | "RECEIVED"> = {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
    undelivered: "FAILED",
    deleted: "FAILED",
    pending: "PENDING",
    received: "RECEIVED",
  };
  return map[s] ?? "FAILED";
}

export default class MetaWebhookController {
  private mensagens = new MensagemController();
  private atendimentos = new AtendimentoController();
  private cloudinary = new CloudinaryController();

  // ============================================================
  // CONFIG (Graph API)
  // ============================================================
  private getMetaToken() {
    const token =
      process.env.WHATSAPP_TOKEN ||
      process.env.WHATSAPP_CLOUD_API_TOKEN ||
      process.env.META_WA_TOKEN;

    if (!token) {
      throw new Error("Defina WHATSAPP_TOKEN (ou WHATSAPP_CLOUD_API_TOKEN / META_WA_TOKEN) no .env");
    }
    return token;
  }

  private getGraphBase() {
    return process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com";
  }

  private getApiVersion() {
    return process.env.WHATSAPP_API_VERSION || "v21.0";
  }

  // ============================================================
  // PARSERS (Value)
  // ============================================================
  private extractPhoneNumberId(value?: WebhookChangeValue) {
    const phoneNumberId = value?.metadata?.phone_number_id;
    return phoneNumberId ? String(phoneNumberId) : "";
  }

  private extractClientE164(value?: WebhookChangeValue) {
    const waId = value?.contacts?.[0]?.wa_id;
    return toE164(waId);
  }

  private extractClientName(value?: WebhookChangeValue) {
    return value?.contacts?.[0]?.profile?.name || "";
  }

  private hasContacts(value?: WebhookChangeValue) {
    return Array.isArray(value?.contacts) && value!.contacts!.length > 0;
  }

  private getMessages(value?: WebhookChangeValue) {
    return Array.isArray(value?.messages) ? value!.messages! : [];
  }

  private getStatuses(value?: WebhookChangeValue) {
    return Array.isArray(value?.statuses) ? value!.statuses! : [];
  }

  // ============================================================
  // MEDIA HELPERS
  // ============================================================
  private extractMediaInfo(msg: WebhookMessage): { kind: "image" | "audio" | "video" | "document" | "sticker"; id: string } | null {
    if (msg.image?.id) return { kind: "image", id: String(msg.image.id) };
    if (msg.audio?.id) return { kind: "audio", id: String(msg.audio.id) };
    if (msg.video?.id) return { kind: "video", id: String(msg.video.id) };
    if (msg.document?.id) return { kind: "document", id: String(msg.document.id) };
    if (msg.sticker?.id) return { kind: "sticker", id: String(msg.sticker.id) };
    return null;
  }

  private buildCloudinaryFolder(kind: string) {
    const base = "whatsapp";
    if (kind === "image") return `${base}/images`;
    if (kind === "audio") return `${base}/audios`;
    if (kind === "video") return `${base}/videos`;
    if (kind === "document") return `${base}/documents`;
    if (kind === "sticker") return `${base}/stickers`;
    return base;
  }

  private async downloadMediaToTempFile(mediaId: string): Promise<string> {
    const token = this.getMetaToken();
    const base = this.getGraphBase();
    const version = this.getApiVersion();

    // 1) get media metadata (url)
    const metaUrl = `${base}/${version}/${mediaId}`;
    const metaRes = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const fileUrl: string | undefined = metaRes.data?.url;
    if (!fileUrl) throw new Error(`Não foi possível obter URL para mediaId ${mediaId}`);

    // 2) download binary
    const binRes = await axios.get<ArrayBuffer>(fileUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
    });

    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `wa-media-${mediaId}-${Date.now()}`);

    fs.writeFileSync(tmpPath, Buffer.from(binRes.data));
    return tmpPath;
  }

  private async uploadMediaToCloudinary(msg: WebhookMessage) {
    const info = this.extractMediaInfo(msg);
    if (!info?.id) return null;

    const folder = this.buildCloudinaryFolder(info.kind);

    try {
      const tmpPath = await this.downloadMediaToTempFile(info.id);

      // tudo público, retorna id da mídia
      const upload = await this.cloudinary.uploadFile(tmpPath, folder);

      safeUnlink(tmpPath);

      if (!upload) return null;

      return {
        kind: info.kind,
        whatsappMediaId: info.id,
        cloudinaryPublicId: upload.public_id, // <- esse é o "id" pra salvar no DB
        cloudinaryUrl: upload.secure_url || upload.url,
        mime_type:
          (msg as any)?.[info.kind]?.mime_type ||
          upload.resource_type ||
          undefined,
        raw: upload,
      };
    } catch (error) {
      Console({ type: "error", message: `Falha upload media (Cloudinary): ${(error as Error).message}` });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  // ============================================================
  // INBOUND / OUTBOUND DETECTION
  // ============================================================
  private isInboundFromClient(value: WebhookChangeValue, msg: WebhookMessage) {
    // Heurística simples e eficiente:
    // - se veio contacts[] no payload, normalmente é inbound real do cliente
    // - confirma: msg.from bate com wa_id
    const clientE164 = this.extractClientE164(value);
    if (!clientE164) return false;

    const fromE164 = toE164(msg?.from);
    return !!(fromE164 && fromE164 === clientE164);
  }

  // ============================================================
  // PROCESS: MESSAGES
  // ============================================================
  private async processMessages(value: WebhookChangeValue) {
    const phoneNumberId = this.extractPhoneNumberId(value);
    const messages = this.getMessages(value);
    if (!messages.length) return;

    const clientE164 = this.extractClientE164(value); // cliente (quando tiver contacts)
    const clientName = this.extractClientName(value);

    for (const msg of messages) {
      try {
        const wamid = msg?.id;
        if (!wamid) continue;

        // OUTBOUND echo (sem contacts) => salva/atualiza na Mensagem, mas não cria atendimento aqui
        if (!this.hasContacts(value)) {
          await this.mensagens.processWebhook({
            object: "whatsapp_business_account",
            entry: [{ changes: [{ value: { ...value, messages: [msg] } }] }],
          });
          continue;
        }

        // INBOUND real do cliente
        const isInbound = this.isInboundFromClient(value, msg);
        if (!isInbound) continue;

        // 1) Se tiver media -> baixa + manda pro Cloudinary e injeta no payload como "link"
        const mediaUp = await this.uploadMediaToCloudinary(msg);

        // 2) Persistir mensagem (idempotente)
        const saveRes = await this.mensagens.processWebhook({
          object: "whatsapp_business_account",
          entry: [
            {
              changes: [
                {
                  value: {
                    ...value,
                    messages: [
                      {
                        ...msg,
                        __mediaUpload: mediaUp || undefined, // opcional (fica dentro do raw)
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });

        // MensagemController retorna lista; vamos pegar a primeira salva
        const savedMsg = (saveRes as any)?.data?.messages?.[0];
        if (!savedMsg?._id) continue;

        // 3) Vincular/garantir atendimento e anexar mensagem
        // - clienteId: por enquanto, use o próprio telefone (sem complicar)
        const atendimento = await this.atendimentos.ensure({
          numeroWhatsapp: clientE164 || msg.from || "",
          tipo: "outro",
          clienteId: digits(clientE164 || msg.from || ""), // easycode: clienteId = telefone
          clienteNome: clientName || "",
          clienteRef: null,
        });

        if (!atendimento?._id) continue;

        await this.atendimentos.anexarMensagem({
          atendimentoId: String(atendimento._id),
          mensagemId: String(savedMsg._id),
          meta: {
            direction: "INBOUND",
            ts: savedMsg.metaTimestamp ? new Date(savedMsg.metaTimestamp) : toDateFromSeconds(msg.timestamp),
            actor: "system",
          },
        });
      } catch (error) {
        Console({ type: "error", message: "Erro ao processar messages." });
        ConsoleData({ type: "error", data: error });
      }
    }
  }

  // ============================================================
  // PROCESS: STATUSES
  // ============================================================
  private async processStatuses(value: WebhookChangeValue) {
    const statuses = this.getStatuses(value);
    if (!statuses.length) return;

    for (const st of statuses) {
      try {
        const wamid = String(st?.id || "");
        if (!wamid) continue;

        // atualiza via MensagemController (idempotente)
        await this.mensagens.processWebhook({
          object: "whatsapp_business_account",
          entry: [{ changes: [{ value: { ...value, statuses: [st] } }] }],
        });

        // Opcional (regras):
        // - Se status chegou para mensagem que não está vinculada a atendimento,
        //   você pode tentar anexar. Mas sem "to" e sem phoneNumberId no Atendimento,
        //   pode gerar ruído. Melhor anexar quando chegar "message" de fato.
        //
        // Se você quiser mesmo anexar em status:
        // - Buscar a Mensagem por wamid (criar método no MensagemController)
        // - Deducir cliente (from/to)
        // - ensure() e anexarMensagem()
      } catch (error) {
        Console({ type: "error", message: "Erro ao processar statuses." });
        ConsoleData({ type: "error", data: error });
      }
    }
  }

  // ============================================================
  // PROCESS: CHANGE.VALUE
  // ============================================================
  private async processChangeValue(value: WebhookChangeValue) {
    await this.processMessages(value);
    await this.processStatuses(value);
  }

  // ============================================================
  // ENTRYPOINT: BODY
  // ============================================================
  async handleWebhookBody(body: WebhookBody) {
    try {
      if (body?.object !== "whatsapp_business_account") return;

      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;
          await this.processChangeValue(value);
        }
      }
    } catch (error) {
      Console({ type: "error", message: "Erro geral no handleWebhookBody." });
      ConsoleData({ type: "error", data: error });
    }
  }
}
