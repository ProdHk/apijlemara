// src/models/Mensagem.ts
import mongoose, { Schema, model, models, Types } from "mongoose";

/**
 * Mensagem (WhatsApp Cloud API / Meta)
 * Objetivo: suportar TUDO que a Meta manda + campos úteis pro app, sem complicar.
 * - Guarda payload bruto (raw)
 * - Normaliza campos essenciais pra busca/gestão
 * - Mantém histórico de status (statuses)
 * - Suporta tipos: text/media/interactive/template/location/contacts/reaction/unknown
 */

export type MensagemDirection = "OUTBOUND" | "INBOUND";

export type MensagemMainStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "RECEIVED";

export type MensagemTipo =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "template"
  | "reaction"
  | "unknown";

export interface MensagemStatusHistory {
  status: MensagemMainStatus;
  timestamp: Date;
  raw?: any;
}

export interface MensagemError {
  code: number;
  title?: string;
  message?: string;
  details?: string;
  raw?: any;
}

export interface MensagemMedia {
  kind?: MensagemTipo; // image/document/audio...
  id?: string; // media id (Graph)
  link?: string; // url pública (cloudinary/s3/etc)
  mime_type?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
  size?: number;

  // útil pro app (thumb, duração, etc) sem forçar estrutura
  meta?: any;
}

export interface MensagemInteractive {
  // resposta do usuário (button/list)
  type?: "button_reply" | "list_reply" | "unknown";
  id?: string;
  title?: string;
  description?: string;
  payload?: string;
  raw?: any;
}

export interface MensagemTemplate {
  name: string;
  language?: string; // ex: "pt_BR"
  components?: any[];
}

export interface MensagemContext {
  // reply context
  id?: string;
  from?: string;
}

export interface MensagemLocation {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  url?: string;
  raw?: any;
}

export interface MensagemContact {
  name?: any; // manter flexível (wa manda estrutura grande)
  phones?: any[];
  emails?: any[];
  org?: any;
  addresses?: any[];
  urls?: any[];
  raw?: any;
}

export interface MensagemReaction {
  message_id?: string; // id/wamid da mensagem reagida
  emoji?: string;
  raw?: any;
}

export interface MensagemTypes {
  _id?: string | Types.ObjectId;

  // vínculo interno
  atendimentoId?: string | Types.ObjectId;

  // ids meta
  wamid: string; // messages[].id (ex: "wamid.HBgM...")
  messageId?: string; // alias opcional
  conversationId?: string | null; // statuses[].conversation.id
  bizOpaqueCallbackData?: string | null; // se você usar no envio

  direction: MensagemDirection;
  status: MensagemMainStatus;
  type: MensagemTipo;

  // roteamento
  to?: string; // phone do cliente (digits)
  from?: string; // phone do cliente (digits) quando inbound
  phoneNumberId?: string; // id do número da empresa (meta)
  wabaId?: string; // business account id (opcional)

  // conteúdo
  text?: {
    body?: string;
    preview_url?: boolean;
  };

  media?: MensagemMedia;

  interactive?: MensagemInteractive;

  template?: MensagemTemplate;

  context?: MensagemContext;

  location?: MensagemLocation;

  contacts?: MensagemContact[];

  reaction?: MensagemReaction;

  // erros + histórico
  errors?: MensagemError[];
  statuses?: MensagemStatusHistory[];

  // agrupamento interno
  threadId?: string; // ex: conversa do app (não confundir com conversationId meta)

  // timestamps úteis (além de createdAt/updatedAt)
  metaTimestamp?: Date | null; // timestamp do webhook (quando houver)

  raw?: any;

  createdAt?: Date;
  updatedAt?: Date;
}

const MensagemSchema = new Schema<MensagemTypes>(
  {
    atendimentoId: { type: Schema.Types.ObjectId, ref: "Atendimento", index: true },

    wamid: { type: String, index: true, unique: true, required: true },
    messageId: { type: String, index: true },

    conversationId: { type: String, index: true, default: null },
    bizOpaqueCallbackData: { type: String, index: true, default: null },

    direction: {
      type: String,
      enum: ["OUTBOUND", "INBOUND"],
      index: true,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SENT", "DELIVERED", "READ", "FAILED", "RECEIVED"],
      index: true,
      default: "PENDING",
    },

    type: {
      type: String,
      enum: [
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
      ],
      default: "text",
      index: true,
    },

    to: { type: String, trim: true, index: true },
    from: { type: String, trim: true, index: true },

    phoneNumberId: { type: String, trim: true, index: true },
    wabaId: { type: String, trim: true, index: true },

    text: {
      body: { type: String, trim: true },
      preview_url: { type: Boolean, default: true },
    },

    media: {
      kind: { type: String },
      id: { type: String, index: true },
      link: { type: String },
      mime_type: { type: String },
      sha256: { type: String },
      filename: { type: String },
      caption: { type: String },
      size: { type: Number },
      meta: Schema.Types.Mixed,
    },

    interactive: {
      type: { type: String },
      id: { type: String },
      title: { type: String },
      description: { type: String },
      payload: { type: String },
      raw: Schema.Types.Mixed,
    },

    template: {
      name: { type: String },
      language: { type: String },
      components: [Schema.Types.Mixed],
    },

    context: {
      id: { type: String, index: true },
      from: { type: String },
    },

    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      name: { type: String },
      address: { type: String },
      url: { type: String },
      raw: Schema.Types.Mixed,
    },

    contacts: [Schema.Types.Mixed],

    reaction: {
      message_id: { type: String, index: true },
      emoji: { type: String },
      raw: Schema.Types.Mixed,
    },

    errors: [
      {
        code: { type: Number },
        title: { type: String },
        message: { type: String },
        details: { type: String },
        raw: Schema.Types.Mixed,
      },
    ],

    statuses: [
      {
        status: {
          type: String,
          enum: ["SENT", "DELIVERED", "READ", "FAILED", "RECEIVED", "PENDING"],
          index: true,
        },
        timestamp: { type: Date },
        raw: Schema.Types.Mixed,
      },
    ],

    threadId: { type: String, index: true },

    metaTimestamp: { type: Date, default: null, index: true },

    raw: Schema.Types.Mixed,
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
  }
);

// Índice composto útil (gestão por número e status)
MensagemSchema.index({ phoneNumberId: 1, status: 1, createdAt: -1 });
MensagemSchema.index({ atendimentoId: 1, createdAt: -1 });
MensagemSchema.index({ direction: 1, createdAt: -1 });

// evita OverwriteModelError
const MensagemModel =
  (models.Mensagem as mongoose.Model<MensagemTypes>) ||
  model<MensagemTypes>("Mensagem", MensagemSchema);

export default MensagemModel;
