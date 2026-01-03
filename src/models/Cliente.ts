import mongoose, { Schema } from "mongoose";


export interface ClienteType {

  _id?: string;

  codPes?: number;
  nome?: string,
  tipo?: number;
  cpfCnpj?: string,
  dataNascimento?: Date;
  dataCadastro?: Date;
  status?: number;
  email?: string,
  empreendimento?: string,
  dataAlteracao?: Date;
  nomeFantasia?: string,
  anexos?: number;
  login?: string,
  senha?: string,
  numeroWhatsapp?: string;
  atendimentos?: [],
  telefones?: TelefoneClienteType[],

}
export interface TelefoneClienteType {
  telefone: string;
  ddd: string;
  complemento: string;
  tipo: number;
  principal: number;
}

const TelefoneClienteSchema = new Schema<TelefoneClienteType>(
  {
    telefone: { type: String },
    ddd: { type: String },
    complemento: { type: String },
    tipo: { type: Number },
    principal: { type: Number },
  }
);
const ClienteSchema = new Schema<ClienteType>(
  {
    codPes: { type: Number, index: true },
    nome: { type: String, trim: true },
    tipo: { type: Number },
    cpfCnpj: { type: String, trim: true, index: true },
    dataNascimento: { type: Date },
    dataCadastro: { type: Date },
    status: { type: Number },
    email: { type: String, trim: true, index: true },
    empreendimento: { type: String, default: null, trim: true },
    dataAlteracao: { type: Date },
    nomeFantasia: { type: String, trim: true },
    anexos: { type: Number },
    login: { type: String, trim: true },
    senha: { type: String },
    numeroWhatsapp: { type: String, default: null, trim: true },
    atendimentos: { type: [String], default: [] },
    telefones: { type: [TelefoneClienteSchema], default: [] },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

const Cliente =
  mongoose.models.Cliente || mongoose.model<ClienteType>("Cliente", ClienteSchema);

export default Cliente;
