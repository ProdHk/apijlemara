import mongoose, { Schema } from "mongoose";

export interface ClienteType {
  cod_pes?: number;
  nome_pes?: string;
  tipo_pes?: number;
  cpf_pes?: string;
  dtcad_pes?: Date;
  dtnasc_pes?: Date;
  IntExt_pes?: number;
  UsrCad_pes?: string;
  UsrAlt_pes?: string;
  Status_pes?: number;
  Tratamento_pes?: string;
  Email_pes?: string;
  EndWWW_pes?: string;
  Matricula_Pes?: string | null;
  Empreendimento_Pes?: string | null;
  ForCli_Pes?: string | null;
  Aval_Prod_Serv_Pes?: string | null;
  Atd_Entrega_Pes?: string | null;
  AtInat_pes?: number;
  DataAlt_pes?: Date;
  NomeFant_Pes?: string;
  Anexos_pes?: number;
  InscrMunic_pes?: string;
  inscrest_pes?: string;
  Login_pes?: string;
  Senha_pes?: string;
  CNAE_pes?: string | null;
  DataCadPortal_pes?: Date;
  CadastradoPrefeituraGyn_pes?: boolean;
  HabilitadoRiscoSacado_pes?: boolean;
  CEI_Pes?: string | null;
  IntegradoEDI_pes?: string | null;
  BloqueioLgpd_Pes?: number;
  CliDDA_PPes?: string | null;

  /* informações adicionais */
  numeroWhatsapp?: string | null;
  atendimentos?: string[];
}

const ClienteSchema = new Schema<ClienteType>(
  {
    cod_pes: { type: Number, index: true },
    nome_pes: { type: String, trim: true },
    tipo_pes: { type: Number },
    cpf_pes: { type: String, trim: true, index: true },
    dtcad_pes: { type: Date },
    dtnasc_pes: { type: Date },
    IntExt_pes: { type: Number },
    UsrCad_pes: { type: String, trim: true },
    UsrAlt_pes: { type: String, trim: true },
    Status_pes: { type: Number },
    Tratamento_pes: { type: String, trim: true },
    Email_pes: { type: String, trim: true, index: true },
    EndWWW_pes: { type: String, trim: true },
    Matricula_Pes: { type: String, default: null, trim: true },
    Empreendimento_Pes: { type: String, default: null, trim: true },
    ForCli_Pes: { type: String, default: null, trim: true },
    Aval_Prod_Serv_Pes: { type: String, default: null, trim: true },
    Atd_Entrega_Pes: { type: String, default: null, trim: true },
    AtInat_pes: { type: Number },
    DataAlt_pes: { type: Date },
    NomeFant_Pes: { type: String, trim: true },
    Anexos_pes: { type: Number },
    InscrMunic_pes: { type: String, trim: true },
    inscrest_pes: { type: String, trim: true },
    Login_pes: { type: String, trim: true },
    Senha_pes: { type: String },
    CNAE_pes: { type: String, default: null, trim: true },
    DataCadPortal_pes: { type: Date },
    CadastradoPrefeituraGyn_pes: { type: Boolean },
    HabilitadoRiscoSacado_pes: { type: Boolean },
    CEI_Pes: { type: String, default: null, trim: true },
    IntegradoEDI_pes: { type: String, default: null, trim: true },
    BloqueioLgpd_Pes: { type: Number },
    CliDDA_PPes: { type: String, default: null, trim: true },

    /* informações adicionais */
    numeroWhatsapp: { type: String, default: null, trim: true },
    atendimentos: { type: [String], default: [] },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

const Cliente =
  mongoose.models.Cliente || mongoose.model<ClienteType>("Cliente", ClienteSchema);

export default Cliente;
