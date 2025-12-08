// src/models/Usuario.ts
import mongoose, { Schema, Document } from "mongoose";

export type UsuarioRole =
    | "ATENDENTE"     // fala com o cliente no dia a dia
    | "SUPERVISOR"    // coordena atendentes, distribui atendimentos
    | "GERENTE"       // visão completa da operação, relatórios, configurações
    | "ADMIN";        // nível máximo, tudo liberado (2 níveis acima da base)

export type PendenciaStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA';

export type LogPendenciaType = {
    status: PendenciaStatus;
    data: Date;
    observacao: string;
}
export type PendenciaUsuarioType = {
    titulo: string;
    descricao: string;
    data: Date;
    ref: string;
    dataLimite: Date;
    status: PendenciaStatus;
    log: LogPendenciaType[];
};
export interface UsuarioType {
    _id?: string;
    nome?: string;
    email?: string;
    senha?: string;
    telefone?: string;

    roles?: UsuarioRole[]; // múltiplos perfis se precisar
    empresa?: string;      // id/string da empresa/instância lógica
    instancia?: string;    // ex: id da instância de WhatsApp / tenant

    ativo?: boolean;
    pendencias?: PendenciaUsuarioType[];
    dataCadastro?: Date;
    dataEdicao?: Date;
    dataUltimoAcesso?: Date;
}

const UsuarioSchema = new Schema<UsuarioType>(
    {
        nome: { type: String, trim: true },

        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        senha: { type: String },      // hoje texto plano; depois dá pra plugar hash
        telefone: { type: String, trim: true },

        roles: {
            type: [String],
            enum: ["ATENDENTE", "SUPERVISOR", "GERENTE", "ADMIN"],
            default: ["ATENDENTE"],
            index: true,
        },

        empresa: { type: String, trim: true, index: true },

        // qual instância / fila / tenant de WhatsApp esse usuário opera
        instancia: { type: String, trim: true, default: "" },

        ativo: { type: Boolean, default: true },

        dataCadastro: { type: Date, default: Date.now },
        dataEdicao: { type: Date, default: Date.now },
        dataUltimoAcesso: { type: Date, default: Date.now },

        pendencias: { type: Array<PendenciaUsuarioType>, default: [] },
    },
    {
        timestamps: false,   // já controlamos datas manualmente
        versionKey: false,
    }
);


export default mongoose.model<UsuarioType>("Usuario", UsuarioSchema);
