// src/controllers/unidade.controller.ts
import Console, { ConsoleData } from "../lib/Console";
import Unidade, { ApiUauUnidadeResponse, UnidadeType } from "../models/Unidade";

function cleanNullString(v: unknown) {
  return v === "null" ? null : v;
}

function toStr(v: unknown) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/**
 * Ajuste aqui quando souber exatamente onde o UAU coloca lote/quadra/bairro/cidade/lat/lng.
 * Mantive fallback simples e seguro.
 */
function mapUauToUnidade(payload: ApiUauUnidadeResponse): UnidadeType {
  const lote = toStr(payload.C1_unid) || toStr(payload.C2_unid);
  const quadra = toStr(payload.C3_unid) || toStr(payload.C4_unid);

  return {
    identificador: payload.Identificador_unid,

    empresa: payload.Empresa_unid,
    produto: payload.Prod_unid,
    numeroPerson: payload.NumPer_unid,
    obra: payload.Obra_unid,

    status: payload.Vendido_unid > 0 ? 1 : 0,
    numCategoriaStatus: payload.NumCategStatus_unid ?? null,

    valor: payload.ValPreco_unid,

    lote: lote || undefined,
    quadra: quadra || undefined,

    bairro: (cleanNullString(payload.C5_unid) as string | null) ?? undefined,
    cidade: (cleanNullString(payload.C6_unid) as string | null) ?? undefined,

    lat: (cleanNullString(payload.C7_unid) as string | null) ?? undefined,
    lng: (cleanNullString(payload.C8_unid) as string | null) ?? undefined,

    origemUau: {
      codigo: payload.Codigo_Unid,
      vendido: payload.Vendido_unid,
      dataCadastro: payload.DataCad_unid,
      usuarioCadastro: payload.UsrCad_unid,
    },
  };
}

function isEqual(a: any, b: any) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function diffPatch(current: any, incoming: any) {
  const patch: Record<string, any> = {};
  for (const key of Object.keys(incoming)) {
    const nextVal = (incoming as any)[key];
    if (nextVal === undefined) continue;

    const curVal = current?.[key];
    if (!isEqual(curVal, nextVal)) patch[key] = nextVal;
  }
  return patch;
}

function normalizeId(doc: any) {
  if (!doc) return doc;
  return { ...doc, _id: String(doc._id) };
}

export default class UnidadeController {
  async buscarDisponiveis() {
    Console({ type: "log", message: "Buscando unidades disponíveis..." });
    try {
      const unidades = await Unidade.find({ status: 0 }).lean();
      return unidades.map(normalizeId);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar unidades." });
      ConsoleData({ type: "error", data: error });
      return [];
    }
  }

  async buscarPorStatus(status: number) {
    Console({ type: "log", message: `Buscando unidades por status ${status}...` });
    try {
      const unidades = await Unidade.find({ status }).lean();
      return unidades.map(normalizeId);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar unidades." });
      ConsoleData({ type: "error", data: error });
      return [];
    }
  }

  async buscarPorObra(cod_obr: string) {
    Console({ type: "log", message: `Buscando unidades por obra ${cod_obr}...` });
    try {
      const unidades = await Unidade.find({ obra: cod_obr }).lean();
      return unidades.map(normalizeId);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar unidades." });
      ConsoleData({ type: "error", data: error });
      return [];
    }
  }

  /**
   * Cadastra ou atualiza SOMENTE campos alterados (por identificador).
   */
  async cadastrar(payload: ApiUauUnidadeResponse) {
    Console({ type: "log", message: "Cadastrando/atualizando unidade..." });

    try {
      const identificador = payload?.Identificador_unid;
      if (!identificador) return null;

      const incoming = mapUauToUnidade(payload);
      const current = await Unidade.findOne({ identificador }).lean();

      if (!current) {
        const created = await Unidade.create(incoming);
        return normalizeId(created.toObject());
      }

      const patch = diffPatch(current, incoming);
      if (Object.keys(patch).length === 0) return normalizeId(current);

      const updated = await Unidade.findOneAndUpdate(
        { identificador },
        { $set: patch },
        { new: true }
      ).lean();

      return normalizeId(updated);
    } catch (error) {
      Console({ type: "error", message: "Erro ao cadastrar/atualizar unidade." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  /**
   * Adiciona fotos sem duplicar (mantém array existente).
   * - usa $addToSet + $each (evita repetição)
   * - retorna doc atualizado
   */
  async adicionarFotos(identificador: string, fotos: string[]) {
    Console({ type: "log", message: "Adicionando fotos na unidade..." });

    try {
      if (!identificador) return null;
      if (!Array.isArray(fotos) || fotos.length === 0) return null;

      const updated = await Unidade.findOneAndUpdate(
        { identificador },
        { $addToSet: { fotos: { $each: fotos } } },
        { new: true }
      ).lean();

      if (!updated) {
        Console({ type: "error", message: "Unidade não encontrada." });
        return null;
      }

      return normalizeId(updated);
    } catch (error) {
      Console({ type: "error", message: "Erro ao adicionar fotos na unidade." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  /**
   * Upsert em lote (sem duplicar).
   */
  async cadastrarEmLote(payloads: ApiUauUnidadeResponse[]) {
    Console({ type: "log", message: "Cadastrando/atualizando unidades em lote..." });

    try {
      if (!payloads?.length) return [];

      const ops = payloads
        .filter((p) => !!p?.Identificador_unid)
        .map((p) => {
          const incoming = mapUauToUnidade(p);
          return {
            updateOne: {
              filter: { identificador: incoming.identificador },
              update: { $set: incoming },
              upsert: true,
            },
          };
        });

      if (!ops.length) return [];

      await Unidade.bulkWrite(ops, { ordered: false });

      const ids = payloads
        .map((p) => p?.Identificador_unid)
        .filter(Boolean) as string[];

      const unidades = await Unidade.find({ identificador: { $in: ids } }).lean();
      return unidades.map(normalizeId);
    } catch (error) {
      Console({ type: "error", message: "Erro ao cadastrar/atualizar unidades em lote." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }
}
