import mongoose, { Schema, Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/* Enums (TS)                                                                 */
/* -------------------------------------------------------------------------- */

export const DISPARO_STATUS = [
  "rascunho", // criado mas ainda não gerou itens
  "processando", // lendo planilha / criando itens
  "agendado", // aguardando horário
  "em_fila", // pronto para consumo do worker
  "rodando", // worker enviando
  "pausado",
  "concluido",
  "cancelado",
  "erro",
] as const;

export type DisparoStatus = (typeof DISPARO_STATUS)[number];

export const DISPARO_MODO = ["agora", "agendado"] as const;
export type DisparoModo = (typeof DISPARO_MODO)[number];

export const DISPARO_PROVIDER = ["meta"] as const;
export type DisparoProvider = (typeof DISPARO_PROVIDER)[number];

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DisparoArquivo = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storage: "local" | "cloudinary" | "s3" | "gdrive" | "url";
  pathOrUrl: string;
  checksum?: string;
};

export type DisparoTemplateVarMap = {
  var: string;
  column: string;
  fallback?: string;
};

export type DisparoSheetMap = {
  phoneColumn: string;
  nameColumn?: string;
  keyColumn?: string;
  variables: DisparoTemplateVarMap[];
};

export type DisparoAgendamento = {
  modo: DisparoModo;
  dataAgendada?: Date;
  timezone?: string;
};

export type DisparoMetaConfig = {
  phoneNumberId?: string;
  apiVersion?: string;
  templateCategory?: string;
  templateLanguage?: string;
};

export type DisparoStats = {
  total: number;
  fila: number;
  processando: number;
  enviado: number;
  erro: number;
  ignorado: number;
  processado: number;

  startedAt?: Date;
  finishedAt?: Date;
};

export type DisparoWorkerState = {
  /** id do processo/instância que está executando (ex: hostname:pid) */
  lockedBy?: string;
  /** quando o worker assumiu o disparo */
  lockedAt?: Date;
  /** heartbeat para indicar que está vivo */
  heartbeatAt?: Date;
};

export interface DisparoType {
  _id?: string | Types.ObjectId;

  empresa?: string;

  criadoPor: string;
  atendenteId: string;

  provider: DisparoProvider;
  status: DisparoStatus;

  titulo: string;
  descricao?: string;

  templateId: string;
  templateNome?: string;

  sheetMap: DisparoSheetMap;

  arquivo: DisparoArquivo;

  agendamento: DisparoAgendamento;

  meta?: DisparoMetaConfig;

  tentativasMax: number;
  prioridade: number;
  pausado: boolean;

  stats: DisparoStats;

  /** estado do worker (opcional, mas útil) */
  worker?: DisparoWorkerState;

  ultimoErro?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const DisparoArquivoSchema = new Schema<DisparoArquivo>(
  {
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true },
    storage: {
      type: String,
      enum: ["local", "cloudinary", "s3", "gdrive", "url"],
      required: true,
    },
    pathOrUrl: { type: String, required: true, trim: true },
    checksum: { type: String, required: false, trim: true },
  },
  { _id: false, id: false }
);

const DisparoTemplateVarMapSchema = new Schema<DisparoTemplateVarMap>(
  {
    var: { type: String, required: true, trim: true },
    column: { type: String, required: true, trim: true },
    fallback: { type: String, required: false, trim: true },
  },
  { _id: false, id: false }
);

const DisparoSheetMapSchema = new Schema<DisparoSheetMap>(
  {
    phoneColumn: { type: String, required: true, trim: true },
    nameColumn: { type: String, required: false, trim: true },
    keyColumn: { type: String, required: false, trim: true },
    variables: { type: [DisparoTemplateVarMapSchema], default: [] },
  },
  { _id: false, id: false }
);

const DisparoAgendamentoSchema = new Schema<DisparoAgendamento>(
  {
    modo: { type: String, enum: DISPARO_MODO, required: true, default: "agora" },
    dataAgendada: { type: Date, required: false },
    timezone: { type: String, required: false, trim: true },
  },
  { _id: false, id: false }
);

const DisparoMetaConfigSchema = new Schema<DisparoMetaConfig>(
  {
    phoneNumberId: { type: String, required: false, trim: true },
    apiVersion: { type: String, required: false, trim: true },
    templateCategory: { type: String, required: false, trim: true },
    templateLanguage: { type: String, required: false, trim: true },
  },
  { _id: false, id: false }
);

const DisparoStatsSchema = new Schema<DisparoStats>(
  {
    total: { type: Number, default: 0 },
    fila: { type: Number, default: 0 },
    processando: { type: Number, default: 0 },
    enviado: { type: Number, default: 0 },
    erro: { type: Number, default: 0 },
    ignorado: { type: Number, default: 0 },
    processado: { type: Number, default: 0 },
    startedAt: { type: Date, required: false },
    finishedAt: { type: Date, required: false },
  },
  { _id: false, id: false }
);

const DisparoWorkerStateSchema = new Schema<DisparoWorkerState>(
  {
    lockedBy: { type: String, required: false, trim: true },
    lockedAt: { type: Date, required: false },
    heartbeatAt: { type: Date, required: false },
  },
  { _id: false, id: false }
);

const DisparoSchema = new Schema<DisparoType>(
  {
    empresa: { type: String, required: false, trim: true },

    criadoPor: { type: String, required: true, trim: true },
    atendenteId: { type: String, required: true, trim: true },

    provider: { type: String, enum: DISPARO_PROVIDER, default: "meta" },

    status: { type: String, enum: DISPARO_STATUS, default: "rascunho" },

    titulo: { type: String, required: true, trim: true },
    descricao: { type: String, required: false, trim: true, default: "" },

    templateId: { type: String, required: true, trim: true },
    templateNome: { type: String, required: false, trim: true },

    sheetMap: { type: DisparoSheetMapSchema, required: true },

    arquivo: { type: DisparoArquivoSchema, required: true },

    agendamento: { type: DisparoAgendamentoSchema, default: () => ({}) },

    meta: { type: DisparoMetaConfigSchema, required: false },

    tentativasMax: { type: Number, default: 3 },
    prioridade: { type: Number, default: 0 },
    pausado: { type: Boolean, default: false },

    stats: { type: DisparoStatsSchema, default: () => ({}) },

    worker: { type: DisparoWorkerStateSchema, default: () => ({}) },

    ultimoErro: { type: String, required: false, trim: true },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

// listagem por atendente + status + data
DisparoSchema.index({ atendenteId: 1, status: 1, createdAt: -1 });

// agendados prontos (worker encontra fácil)
DisparoSchema.index({ status: 1, "agendamento.dataAgendada": 1 });

// multi-tenant
DisparoSchema.index({ empresa: 1, createdAt: -1 });

// priorização (worker)
DisparoSchema.index({ status: 1, prioridade: -1, updatedAt: 1 });

const Disparo =
  mongoose.models.Disparo || mongoose.model<DisparoType>("Disparo", DisparoSchema);

export default Disparo;
