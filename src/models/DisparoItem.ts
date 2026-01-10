import mongoose, { Schema, Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const DISPARO_ITEM_STATUS = [
  "fila",
  "processando", // reservado pelo worker
  "enviado",
  "erro",
  "ignorado",
] as const;

export type DisparoItemStatus = (typeof DISPARO_ITEM_STATUS)[number];

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DisparoItemErro = {
  codigo?: string; // ex: "PHONE_INVALID", "META_400"
  mensagem: string;
  detalhe?: any; // guardar payload/resposta (cuidado com PII)
  em: Date;
};

export type DisparoItemMetaResult = {
  waId?: string;
  messageId?: string;
  phoneNumberId?: string;

  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;

  lastStatus?: "SENT" | "DELIVERED" | "READ" | "FAILED";
};

export type DisparoItemLock = {
  lockedAt?: Date;
  lockedBy?: string;
  /** se travar, worker pode liberar após expirar */
  lockExpiresAt?: Date;
};

export interface DisparoItemType {
  _id?: string | Types.ObjectId;

  disparoId: string | Types.ObjectId;

  rowIndex: number;
  key?: string;

  row: Record<string, any>;
  vars: Record<string, string>;

  phoneRaw: string;
  phoneE164?: string;

  name?: string;

  status: DisparoItemStatus;

  attempts: number;
  lastAttemptAt?: Date;

  /** controle de retry/backoff */
  nextRetryAt?: Date;

  /** timestamps úteis do ciclo do item */
  reservedAt?: Date;
  finishedAt?: Date;

  /** lock do worker */
  lock?: DisparoItemLock;

  meta?: DisparoItemMetaResult;
  erro?: DisparoItemErro;

  createdAt?: Date;
  updatedAt?: Date;
}

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const DisparoItemErroSchema = new Schema<DisparoItemErro>(
  {
    codigo: { type: String, required: false, trim: true },
    mensagem: { type: String, required: true, trim: true },
    detalhe: { type: Schema.Types.Mixed, required: false },
    em: { type: Date, default: Date.now },
  },
  { _id: false, id: false }
);

const DisparoItemMetaResultSchema = new Schema<DisparoItemMetaResult>(
  {
    waId: { type: String, required: false, trim: true },
    messageId: { type: String, required: false, trim: true },
    phoneNumberId: { type: String, required: false, trim: true },

    sentAt: { type: Date, required: false },
    deliveredAt: { type: Date, required: false },
    readAt: { type: Date, required: false },

    lastStatus: { type: String, required: false, trim: true },
  },
  { _id: false, id: false }
);

const DisparoItemLockSchema = new Schema<DisparoItemLock>(
  {
    lockedAt: { type: Date, required: false },
    lockedBy: { type: String, required: false, trim: true },
    lockExpiresAt: { type: Date, required: false },
  },
  { _id: false, id: false }
);

const DisparoItemSchema = new Schema<DisparoItemType>(
  {
    disparoId: { type: Schema.Types.ObjectId, ref: "Disparo", required: true },

    rowIndex: { type: Number, required: true },

    key: { type: String, required: false, trim: true },

    row: { type: Schema.Types.Mixed, required: true },
    vars: { type: Schema.Types.Mixed, default: {} },

    phoneRaw: { type: String, required: true, trim: true },
    phoneE164: { type: String, required: false, trim: true },

    name: { type: String, required: false, trim: true },

    status: { type: String, enum: DISPARO_ITEM_STATUS, default: "fila" },

    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, required: false },

    nextRetryAt: { type: Date, required: false },

    reservedAt: { type: Date, required: false },
    finishedAt: { type: Date, required: false },

    lock: { type: DisparoItemLockSchema, default: () => ({}) },

    meta: { type: DisparoItemMetaResultSchema, required: false },

    erro: { type: DisparoItemErroSchema, required: false },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

// listagem rápida de itens do disparo (e garantia de unicidade)
DisparoItemSchema.index({ disparoId: 1, rowIndex: 1 }, { unique: true });

// worker: puxar itens aptos (fila) por disparo + ordem
DisparoItemSchema.index({ disparoId: 1, status: 1, rowIndex: 1 });

// worker: puxar por status e retry
DisparoItemSchema.index({ status: 1, nextRetryAt: 1 });

// worker: locks expirados (limpeza)
DisparoItemSchema.index({ "lock.lockExpiresAt": 1 });

// (opcional) para dashboard rápido
DisparoItemSchema.index({ status: 1, updatedAt: 1 });

const DisparoItem =
  mongoose.models.DisparoItem ||
  mongoose.model<DisparoItemType>("DisparoItem", DisparoItemSchema);

export default DisparoItem;
