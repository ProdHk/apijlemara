// src/models/Pet.ts
import mongoose, { Schema, Types } from "mongoose";

/** ====== Tipos (TS) ====== */
export const PET_STATUS = [
  "rascunho",
  "publicado",
  "rejeitado",
  "aceito",
  "aguardando-implantacao",
] as const;

export const PET_TIPO = ["ideia", "melhoria", "resumo", "curso", "erro-interno"] as const;

export type PetStatus = (typeof PET_STATUS)[number];
export type PetTipo = (typeof PET_TIPO)[number];

export type PetImplantacao = {
  apto: boolean;
  concluido: boolean;
  responsaveis: string[]; // <- era tuple [string], isso quebra pra listas
};

export type PetAnexoTipo = "documento" | "interacao";

export type PetAnexo = {
  tipo: PetAnexoTipo;
  titulo: string;
  descricao: string;
  responsavel: string;
  link?: string;
};

export interface PetType {
  _id?: string | Types.ObjectId;

  responsavel: string;
  status: PetStatus;
  tipo: PetTipo;

  titulo: string;
  subTitulo: string;
  descricao: string;
  descricao2: string;
  conclusao: string;

  anexos: PetAnexo[]; // <- era [string] e depois tentava setar objetos (inconsistência)

  pontuacao: number;
  petImplantacao: PetImplantacao;
}

/** ====== Schemas (Mongoose) ====== */
const PetImplantacaoSchema = new Schema<PetImplantacao>(
  {
    apto: { type: Boolean, default: false },
    concluido: { type: Boolean, default: false },
    responsaveis: { type: [String], default: [] },
  },
  {
    _id: false,
    id: false,
    // timestamps aqui geralmente não faz sentido pra subdocumento embutido
  }
);

const PetAnexoSchema = new Schema<PetAnexo>(
  {
    tipo: { type: String, enum: ["documento", "interacao"], required: true },
    titulo: { type: String, required: true, trim: true },
    descricao: { type: String, required: true, trim: true },
    responsavel: { type: String, required: true, trim: true },
    link: { type: String, required: false },
  },
  {
    _id: false,
    id: false,
    // timestamps aqui também costuma ser desnecessário; se quiser, pode ligar.
  }
);

const PetSchema = new Schema<PetType>(
  {
    responsavel: { type: String, required: true, trim: true },
    status: { type: String, enum: PET_STATUS, default: "rascunho" },
    tipo: { type: String, enum: PET_TIPO, required: true },

    titulo: { type: String, required: true, trim: true },
    subTitulo: { type: String, default: "", trim: true },
    descricao: { type: String, required: true, trim: true },
    descricao2: { type: String, default: "", trim: true },
    conclusao: { type: String, required: true, trim: true },

    // ✅ correto: array de subdocumentos
    anexos: { type: [PetAnexoSchema], default: [] },

    pontuacao: { type: Number, required: true },

    // ✅ subdocumento com defaults
    petImplantacao: { type: PetImplantacaoSchema, default: () => ({}) },
  },
  {
    timestamps: true, // createdAt / updatedAt
    minimize: false,
  }
);

const Pet = mongoose.models.Pet || mongoose.model<PetType>("Pet", PetSchema);

export default Pet;
