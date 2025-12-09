// src/models/Obra.ts
import mongoose, { Schema } from "mongoose";

export interface FotosType {
  url: string;
  legenda: string;
  descricao: string;
  visivelSite: boolean;
}

export interface InfraestruturaType {
  agua?: boolean;
  luz?: boolean;
  internet?: boolean;
  esgoto?: boolean;
  pavimentacao?: boolean;
  iluminacaoPublica?: boolean;
  areaVerde?: boolean;
}

export interface DestaquesSite {
  nome: string;
  descricao: string;
}

export interface InfoSiteType {
  titulo?: string | null;
  descricao?: string | null;
  destaques?: DestaquesSite[];
  precoAPartir?: number | null;
  areaMediaM2?: number | null;
}

export interface ObraType {
  // ✅ campos ERP
  Cod_obr?: string;
  Empresa_obr?: number;
  Descr_obr?: string;
  Status_obr?: number;
  Ender_obr?: string;
  Fone_obr?: string;
  Fisc_obr?: string;
  DtIni_obr?: string;
  Dtfim_obr?: string;
  TipoObra_obr?: number;
  EnderEntr_obr?: string;
  CEI_obr?: string | null;
  DataCad_obr?: string;
  DataAlt_obr?: string;
  UsrCad_obr?: string;

  // ✅ campos adicionais
  _id?: string;
  publico: boolean;
  nomePublico: string;
  infraestrutura?: InfraestruturaType;
  fotos?: FotosType[];
  linkMaps?: string;
  lat?: string;
  lng?: string;
  infoSite?: InfoSiteType;
}

/* -------------------------------------------------------------------------- */
/*  SUBSCHEMAS                                                                */
/* -------------------------------------------------------------------------- */

const InfraestruturaSchema = new Schema<InfraestruturaType>(
  {
    agua: { type: Boolean, default: false },
    luz: { type: Boolean, default: false },
    internet: { type: Boolean, default: false },
    esgoto: { type: Boolean, default: false },
    pavimentacao: { type: Boolean, default: false },
    iluminacaoPublica: { type: Boolean, default: false },
    areaVerde: { type: Boolean, default: false },
  },
  { _id: false }
);

const FotosSchema = new Schema<FotosType>(
  {
    url: { type: String, required: true, trim: true },
    legenda: { type: String, required: true, trim: true },
    descricao: { type: String, required: true, trim: true },
    visivelSite: { type: Boolean, required: true, default: true },
  },
  { _id: false }
);

const DestaqueSiteSchema = new Schema<DestaquesSite>(
  {
    nome: { type: String, default: null, trim: true },
    descricao: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const InfoSiteSchema = new Schema<InfoSiteType>(
  {
    titulo: { type: String, default: null, trim: true },
    descricao: { type: String, default: null, trim: true },
    destaques: { type: [DestaqueSiteSchema], default: [] },
    precoAPartir: { type: Number, default: null },
    areaMediaM2: { type: Number, default: null },
  },
  { _id: false }
);

/* -------------------------------------------------------------------------- */
/*  SCHEMA PRINCIPAL                                                          */
/* -------------------------------------------------------------------------- */

const ObraSchema = new Schema<ObraType>(
  {
    Cod_obr: { type: String, index: true, trim: true },
    Empresa_obr: { type: Number },
    Descr_obr: { type: String, trim: true },
    Status_obr: { type: Number },
    Ender_obr: { type: String, trim: true },
    Fone_obr: { type: String, trim: true },
    Fisc_obr: { type: String, trim: true },
    DtIni_obr: { type: String },
    Dtfim_obr: { type: String },
    TipoObra_obr: { type: Number },
    EnderEntr_obr: { type: String, trim: true },
    CEI_obr: { type: String, default: null, trim: true },
    DataCad_obr: { type: String },
    DataAlt_obr: { type: String },
    UsrCad_obr: { type: String, trim: true },

    publico: { type: Boolean, default: false },
    nomePublico: { type: String, default: "", trim: true },

    infraestrutura: {
      type: InfraestruturaSchema,
      default: () => ({}),
    },

    // 🔧 aqui é ARRAY de fotos
    fotos: {
      type: [FotosSchema],
      default: [],
    },

    linkMaps: { type: String, default: "", trim: true },
    lat: { type: String, default: "", trim: true },
    lng: { type: String, default: "", trim: true },

    infoSite: {
      type: InfoSiteSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    minimize: false, // mantém objetos vazios (InfoSite, infraestrutura)
    versionKey: false,
  }
);

// evita OverwriteModelError em hot reload
const Obra =
  mongoose.models.Obra || mongoose.model<ObraType>("Obra", ObraSchema);

export default Obra;
