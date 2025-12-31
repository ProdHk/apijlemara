// src/models/Unidade.ts
import mongoose, { Schema } from "mongoose";

export type ApiUauUnidadeResponse = {
  Empresa_unid: number;
  Prod_unid: number;
  NumPer_unid: number;
  Obra_unid: string;
  Qtde_unid: number;
  Vendido_unid: number;
  Codigo_Unid: string;
  PorcentPr_Unid: number;
  C1_unid: string;
  C2_unid: string;
  C3_unid: string;
  C4_unid: string;
  C5_unid: string | "null";
  C6_unid: string | "null";
  C7_unid: string | "null";
  C8_unid: string | "null";
  C9_unid: string | "null";
  C10_unid: string | "null";
  C11_unid: string | "null";
  C12_unid: string | "null";
  C13_unid: string | "null";
  C14_unid: string | "null";
  C15_unid: string | "null";
  C16_unid: string | "null";
  C17_unid: string | "null";
  C18_unid: string | "null";
  C19_unid: string | "null";
  C20_unid: string | "null";
  C21_unid: string | "null";
  C22_unid: string | "null";
  C23_unid: string | "null";
  C24_unid: string | "null";
  C25_unid: string | "null";
  C26_unid: string | "null";
  C27_unid: string | "null";
  C28_unid: string | "null";
  C29_unid: string | "null";
  C30_unid: string | "null";
  C31_unid: string | "null";
  C32_unid: string | "null";
  C33_unid: string | "null";
  C34_unid: string | "null";
  C35_unid: string | "null";
  C36_unid: string | "null";
  C37_unid: string | "null";
  C38_unid: string | "null";
  C39_unid: string | "null";
  C40_unid: string | "null";
  C41_unid: string | "null";
  C42_unid: string | "null";
  C43_unid: string | "null";
  C44_unid: string | "null";
  C45_unid: string | "null";
  anexos_unid: number;
  Identificador_unid: string;
  UsrCad_unid: string;
  DataCad_unid: string;
  ValPreco_unid: number;
  FracaoIdeal_unid: string | "null";
  NumObe_unid: string | "null";
  ObjEspelhoTop_unid: string | "null";
  ObjEspelhoLeft_unid: string | "null";
  PorcentComissao_unid: string | "null";
  CodTipProd_unid: string | "null";
  NumCategStatus_unid: number;
  FracaoIdealDecimal_unid: string | "null";
  DataEntregaChaves_unid: string | "null";
  DataReconhecimentoReceitaMapa_unid: string | "null";
  UnidadeVendidaDacao_unid: string | "null";
  Num_Ven: string | "null";
};

export type UnidadeType = {
  _id?: string;

  empresa?: number;
  produto?: number;
  numeroPerson?: number;
  obra?: string;

  status?: number; // seu status interno (ex: 0 disponível)
  numCategoriaStatus?: number | string | null;

  valor?: number;

  lote?: string;
  quadra?: string;
  identificador: string;

  fotos?: string[];

  bairro?: string;
  cidade?: string;

  lat?: string;
  lng?: string;

  // útil pra rastrear origem UAU sem precisar guardar 45 campos
  origemUau?: {
    codigo?: string;
    vendido?: number;
    dataCadastro?: string;
    usuarioCadastro?: string;
  };

  createdAt?: Date;
  updatedAt?: Date;
};

const UnidadesSchema = new Schema<UnidadeType>(
  {
    empresa: { type: Number },
    produto: { type: Number },
    numeroPerson: { type: Number },
    obra: { type: String },

    status: { type: Number, index: true },
    numCategoriaStatus: { type: Schema.Types.Mixed, default: null },

    valor: { type: Number },

    lote: { type: String },
    quadra: { type: String },

    identificador: { type: String, required: true, unique: true, index: true },

    fotos: { type: [String], default: [] },

    bairro: { type: String },
    cidade: { type: String },

    lat: { type: String },
    lng: { type: String },

    origemUau: {
      codigo: { type: String },
      vendido: { type: Number },
      dataCadastro: { type: String },
      usuarioCadastro: { type: String },
    },
  },
  { timestamps: true }
);

const Unidade =
  (mongoose.models.Unidade as mongoose.Model<UnidadeType>) ||
  mongoose.model<UnidadeType>("Unidade", UnidadesSchema);

export default Unidade;
