// src/models/Atendimento.ts
import mongoose, { Schema, Types } from "mongoose";

export type AtendimentoStatus =
  | "aberto"
  | "fechado"
  | "cancelado"
  | "aguardando-cliente"
  | "aguardando-atendente";

export type ResultadoContato =
  | "SEM_RESPOSTA"
  | "NUMERO_INVALIDO"
  | "NAO_RECONHECE"
  | "PROMESSA_PAGAMENTO"
  | "CHAMAR_DEPOIS"
  | "ENCAMINHADO_SETOR";

export type AtendimentoTipo =
  | "venda"
  | "cobranca"
  | "compra"
  | "lembrete"
  | "outro";

export type HistoricoType = {
  title: string;
  content: string;
  date: Date;
  user: string; // id do usuário (string) ou nome/login — mantendo simples
};

export interface AtendimentoType {
  _id?: string | Types.ObjectId;

  atendente?: string | Types.ObjectId | null;
  status?: AtendimentoStatus;
  tipo?: AtendimentoTipo;

  dataInicio?: Date;
  dataAtualizacao?: Date;
  dataFim?: Date | null;

  observacao?: string;

  mensagens?: (string | Types.ObjectId)[];
  anexos?: Types.ObjectId[];
  historico: HistoricoType[];

  numeroWhatsapp?: string; // telefone normalizado

  clienteId: string;
  clienteNome?: string;
  clienteRef?: string | null; // codigo pessoa uau

  // métricas/timestamps
  dataPrimeiraRespostaAtendente?: Date | null;
  dataUltimaMensagemCliente?: Date | null;
  dataUltimaMensagemAtendente?: Date | null;

  // resultado de contato
  resultadoContato?: ResultadoContato | null;
}

const AtendimentoSchema = new Schema<AtendimentoType>(
  {
    atendente: { type: Schema.Types.ObjectId, ref: "Usuario", default: null, index: true },

    status: {
      type: String,
      enum: ["aberto", "fechado", "cancelado", "aguardando-cliente", "aguardando-atendente"],
      default: "aberto",
      index: true,
    },

    tipo: {
      type: String,
      enum: ["venda", "cobranca", "compra", "lembrete", "outro"],
      default: "outro",
      index: true,
    },

    dataInicio: { type: Date, default: Date.now, index: true },
    dataAtualizacao: { type: Date, default: Date.now, index: true },
    dataFim: { type: Date, default: null },

    observacao: { type: String, default: "" },

    mensagens: [{ type: Schema.Types.ObjectId, ref: "Mensagem" }],
    anexos: [{ type: Schema.Types.ObjectId, ref: "Anexo" }],

    historico: [
      {
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true, trim: true },
        date: { type: Date, default: Date.now },
        user: { type: String, required: true, trim: true },
      },
    ],

    numeroWhatsapp: {
      type: String,
      default: "",
      trim: true,
      index: true,
      // mantido simples: apenas dígitos (ex: 5531999999999)
      validate: {
        validator: (v: string) => !v || /^\d{10,15}$/.test(v),
        message: "numeroWhatsapp deve conter apenas dígitos (10 a 15).",
      },
    },

    clienteId: { type: String, required: true, trim: true, index: true },
    clienteNome: { type: String, default: "", trim: true },
    clienteRef: { type: String, default: null, trim: true, index: true },

    dataPrimeiraRespostaAtendente: { type: Date, default: null },
    dataUltimaMensagemCliente: { type: Date, default: null },
    dataUltimaMensagemAtendente: { type: Date, default: null },

    resultadoContato: {
      type: String,
      enum: [
        "SEM_RESPOSTA",
        "NUMERO_INVALIDO",
        "NAO_RECONHECE",
        "PROMESSA_PAGAMENTO",
        "CHAMAR_DEPOIS",
        "ENCAMINHADO_SETOR",
      ],
      default: null,
      index: true,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
    minimize: false,
  }
);

const Atendimento =
  mongoose.models.Atendimento ||
  mongoose.model<AtendimentoType>("Atendimento", AtendimentoSchema);

export default Atendimento;
