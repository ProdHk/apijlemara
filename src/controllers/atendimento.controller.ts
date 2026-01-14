// src/controllers/atendimento.controller.ts
import mongoose, { Types } from "mongoose";
import type { Request, Response } from "express";
import Console, { ConsoleData } from "../lib/Console";

import Atendimento, {
  AtendimentoType,
  AtendimentoStatus,
  AtendimentoTipo,
  ResultadoContato,
  HistoricoType,
} from "../models/Atendimento";

type SortBy = "updatedAt" | "createdAt" | "dataAtualizacao";
type SortDir = "asc" | "desc";

export type ListarAtendimentosParams = {
  status?: AtendimentoStatus[];
  tipo?: AtendimentoTipo[];
  atendente?: string | null; // null => sem filtro | "" => sem atendente | "id" => específico

  clienteId?: string;
  clienteNome?: string;
  clienteRef?: string;

  numeroWhatsapp?: string;

  dataDe?: Date;
  dataAte?: Date;

  updatedDe?: Date;
  updatedAte?: Date;

  q?: string;

  page?: number;
  limit?: number;

  sortBy?: SortBy;
  sortDir?: SortDir;

  resultadoContato?: ResultadoContato;
};

export type ListarAtendimentosResponse = {
  items: any[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type MsgDirection = "INBOUND" | "OUTBOUND";

type AttachMessageMeta = {
  direction: MsgDirection;
  ts?: Date | null;
  actor?: string; // "system" | userId | nome
};

type ResponseType = {
  status: boolean;
  message: string;
  data: any;
};

export type MetricasAtuaisDTO = {
  total: number;
  totalAtivos: number;

  porStatus: Record<AtendimentoStatus, number>;
  porTipo: Record<AtendimentoTipo, number>;
  porResultadoContato: Partial<Record<ResultadoContato, number>>;

  semAtendenteAtivos: number;
  atrasados24h: number;

  ultimos7dias: { dia: string; total: number }[];
};

/* -------------------------------------------------------------------------- */
/* Consts                                                                     */
/* -------------------------------------------------------------------------- */

const ATIVOS: AtendimentoStatus[] = ["aberto", "aguardando-cliente", "aguardando-atendente"];
const INATIVOS: AtendimentoStatus[] = ["fechado", "cancelado"];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toPublic(doc: any) {
  return doc ? { ...doc, _id: String(doc._id) } : doc;
}

function digits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function normalizeBRToCanonicalE164(d: string) {
  const v = digits(d);
  if (!v.startsWith("55")) return v;

  if (v.length < 12) return v;

  const ddd = v.slice(2, 4);
  const rest = v.slice(4);

  if (rest.length === 8) return `55${ddd}9${rest}`; // adiciona 9
  if (rest.length === 9) return `55${ddd}${rest}`; // ok

  return v;
}

function now() {
  return new Date();
}

function safeRegex(q: string) {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i");
}

function buildHistory(title: string, content: string, user = "system"): HistoricoType {
  return { title, content, user, date: now() };
}

function ok(res: Response, data: any) {
  return res.status(200).json(data);
}

function fail(res: Response, error: unknown, fallback = "Erro interno") {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  return res.status(500).json({ status: false, message, data: null });
}

function pickDefined<T extends object>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/**
 * Resolve "chave" do cliente para não duplicar:
 * prioridade:
 * 1) waId (Meta)
 * 2) numeroWhatsappCanon (BR com 9º dígito)
 * 3) aliases (original/canon)
 */
function buildCustomerKey(params: {
  numeroWhatsapp?: string;
  numeroWhatsappCanon?: string;
  waId?: string | null;
}) {
  const waId = digits(params.waId || "");
  const canon = digits(params.numeroWhatsappCanon || normalizeBRToCanonicalE164(params.numeroWhatsapp || ""));
  const original = digits(params.numeroWhatsapp || "");

  return {
    waId,
    canon,
    original,
    aliases: Array.from(new Set([original, canon].filter(Boolean))),
  };
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class AtendimentoController {
  // =========================
  // CORE: garantir atendimento (sem duplicar)
  // =========================
  async ensure(params: {
    numeroWhatsapp: string; // cliente digits (pode vir sem 9º dígito)
    tipo?: AtendimentoTipo;
    atendente?: string | Types.ObjectId | null;

    clienteId: string; // sua chave interna (pode ser waId/canon etc)
    clienteNome?: string;
    clienteRef?: string | null;

    // NOVO (se existir no model atualizado)
    waId?: string | null;

    observacao?: string;
  }) {
    Console({ type: "log", message: "Ensure atendimento (sem duplicidade)..." });

    try {
      const { waId, canon, original, aliases } = buildCustomerKey({
        numeroWhatsapp: params.numeroWhatsapp,
        waId: params.waId,
      });

      if (!canon) throw new Error("numeroWhatsapp é obrigatório");
      if (!params.clienteId) throw new Error("clienteId é obrigatório");

      const tipo: AtendimentoTipo = params.tipo ?? "outro";
      const agora = now();

      // 1) tenta achar ativo por waId (melhor chave)
      if (waId) {
        const byWa = await Atendimento.findOne({
          waId,
          tipo,
          status: { $in: ATIVOS },
        })
          .select("_id status dataFim dataPrimeiraRespostaAtendente")
          .lean();

        if (byWa?._id) {
          const patch: Partial<AtendimentoType> = {
            dataAtualizacao: agora,
            atendente: params.atendente ?? undefined,
            clienteNome: params.clienteNome ?? undefined,
            clienteRef: params.clienteRef ?? undefined,
            observacao: params.observacao ?? undefined,

            // mantém consistência (se existirem no model)
            numeroWhatsapp: canon as any,
            numeroWhatsappCanon: canon as any,
          } as any;

          const updated = await Atendimento.findByIdAndUpdate(
            byWa._id,
            {
              $set: pickDefined(patch),
              ...(aliases.length ? { $addToSet: { numeroWhatsappAliases: { $each: aliases } } } : {}),
            },
            { new: true }
          ).lean();

          return toPublic(updated);
        }
      }

      // 2) tenta achar ativo por canon/aliases
      const ativo = await Atendimento.findOne({
        tipo,
        status: { $in: ATIVOS },
        $or: [
          { numeroWhatsappCanon: canon },
          { numeroWhatsapp: canon }, // legado
          { numeroWhatsappAliases: canon },
          ...(original ? [{ numeroWhatsappAliases: original }] : []),
        ],
      })
        .select("_id status dataFim dataPrimeiraRespostaAtendente")
        .lean();

      if (ativo?._id) {
        const patch: Partial<AtendimentoType> = {
          dataAtualizacao: agora,
          atendente: params.atendente ?? undefined,
          clienteNome: params.clienteNome ?? undefined,
          clienteRef: params.clienteRef ?? undefined,
          observacao: params.observacao ?? undefined,

          // se tiver waId, grava
          ...(waId ? ({ waId } as any) : {}),
          numeroWhatsapp: canon as any,
          numeroWhatsappCanon: canon as any,
        } as any;

        const updated = await Atendimento.findByIdAndUpdate(
          ativo._id,
          {
            $set: pickDefined(patch),
            ...(aliases.length ? { $addToSet: { numeroWhatsappAliases: { $each: aliases } } } : {}),
          },
          { new: true }
        ).lean();

        return toPublic(updated);
      }

      // 3) não tem ativo -> tenta reabrir o mais recente inativo (waId > canon/aliases)
      const inativo = await Atendimento.findOne({
        tipo,
        status: { $in: INATIVOS },
        $or: [
          ...(waId ? [{ waId }] : []),
          { numeroWhatsappCanon: canon },
          { numeroWhatsapp: canon },
          { numeroWhatsappAliases: canon },
          ...(original ? [{ numeroWhatsappAliases: original }] : []),
        ],
      })
        .sort({ updatedAt: -1 })
        .select("_id status")
        .lean();

      if (inativo?._id) {
        const updated = await Atendimento.findByIdAndUpdate(
          inativo._id,
          {
            $set: pickDefined<Partial<AtendimentoType>>({
              status: "aberto",
              dataFim: null,
              dataAtualizacao: agora,
              atendente: params.atendente ?? undefined,
              clienteId: params.clienteId,
              clienteNome: params.clienteNome ?? undefined,
              clienteRef: params.clienteRef ?? undefined,
              observacao: params.observacao ?? undefined,

              ...(waId ? ({ waId } as any) : {}),
              numeroWhatsapp: canon as any,
              numeroWhatsappCanon: canon as any,
            } as any),
            ...(aliases.length ? { $addToSet: { numeroWhatsappAliases: { $each: aliases } } } : {}),
            $push: {
              historico: buildHistory(
                "Atendimento reaberto",
                "Nova interação identificada. Atendimento reaberto automaticamente.",
                "system"
              ),
            },
          },
          { new: true }
        ).lean();

        return toPublic(updated);
      }

      // 4) cria novo
      const created = await Atendimento.create({
        atendente: params.atendente ?? null,
        status: "aberto",
        tipo,

        dataInicio: agora,
        dataAtualizacao: agora,
        dataFim: null,

        observacao: params.observacao ?? "",

        mensagens: [],
        anexos: [],
        historico: [],

        // ✅ canonical por padrão
        numeroWhatsapp: canon,
        numeroWhatsappCanon: canon,
        numeroWhatsappAliases: aliases,

        // ✅ chave interna
        clienteId: params.clienteId,
        clienteNome: params.clienteNome ?? "",
        clienteRef: params.clienteRef ?? null,

        // ✅ se existir
        ...(waId ? { waId } : {}),

        dataPrimeiraRespostaAtendente: null,
        dataUltimaMensagemCliente: null,
        dataUltimaMensagemAtendente: null,

        resultadoContato: null,
      } satisfies AtendimentoType);

      return toPublic(created.toObject());
    } catch (error) {
      Console({ type: "error", message: "Erro no ensure do atendimento." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  // =========================
  // MENSAGENS: anexar + atualizar métricas/status (idempotente)
  // =========================
  async anexarMensagem(params: {
    atendimentoId: string;
    mensagemId: string; // ObjectId da Mensagem
    meta: AttachMessageMeta;
  }) {
    Console({ type: "log", message: "Anexando mensagem ao atendimento..." });

    try {
      if (!params.atendimentoId) throw new Error("atendimentoId é obrigatório");
      if (!params.mensagemId) throw new Error("mensagemId é obrigatório");
      if (!params.meta?.direction) throw new Error("meta.direction é obrigatório");

      const atendimentoId = new mongoose.Types.ObjectId(params.atendimentoId);
      const mensagemId = new mongoose.Types.ObjectId(params.mensagemId);
      const ts = params.meta.ts ?? now();

      const atendimento = await Atendimento.findById(atendimentoId)
        .select("_id status dataPrimeiraRespostaAtendente")
        .lean();

      if (!atendimento) return null;

      const shouldReopen = atendimento.status === "fechado" || atendimento.status === "cancelado";
      const nextStatus: AtendimentoStatus =
        params.meta.direction === "INBOUND" ? "aguardando-atendente" : "aguardando-cliente";

      const patch: Partial<AtendimentoType> = {
        dataAtualizacao: ts,
        status: nextStatus,
        ...(shouldReopen ? { dataFim: null } : {}),
      };

      if (params.meta.direction === "INBOUND") {
        patch.dataUltimaMensagemCliente = ts;
      } else {
        patch.dataUltimaMensagemAtendente = ts;
        if (!atendimento.dataPrimeiraRespostaAtendente) {
          patch.dataPrimeiraRespostaAtendente = ts;
        }
      }

      const history = shouldReopen
        ? buildHistory(
          "Atendimento reaberto",
          "Nova interação vinculada. Atendimento reaberto automaticamente.",
          params.meta.actor ?? "system"
        )
        : null;

      const update: any = {
        $set: pickDefined(patch),
        $addToSet: { mensagens: mensagemId }, // idempotente
      };
      if (history) update.$push = { historico: history };

      const updated = await Atendimento.findByIdAndUpdate(atendimentoId, update, { new: true }).lean();
      return toPublic(updated);
    } catch (error) {
      Console({ type: "error", message: "Erro ao anexar mensagem ao atendimento." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  // =========================
  // BUSCAS ESSENCIAIS (gestão)
  // =========================
  async buscarPorId(id: string) {
    Console({ type: "log", message: `Buscando atendimento ${id}...` });
    try {
      if (!id) throw new Error("ID é obrigatório");
      const doc = await Atendimento.findById(id).lean();
      return toPublic(doc);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar atendimento por id." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  async buscarAtivosPorNumero(numeroWhatsapp: string, tipo?: AtendimentoTipo) {
    Console({ type: "log", message: "Buscando atendimento ativo por número..." });
    try {
      const original = digits(numeroWhatsapp);
      if (!original) return null;
      const canon = normalizeBRToCanonicalE164(original);

      const filter: any = {
        status: { $in: ATIVOS },
        $or: [
          { numeroWhatsappCanon: canon },
          { numeroWhatsapp: canon },
          { numeroWhatsappAliases: canon },
          { numeroWhatsappAliases: original },
        ],
      };
      if (tipo) filter.tipo = tipo;

      const doc = await Atendimento.findOne(filter).sort({ updatedAt: -1 }).lean();
      return toPublic(doc);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar atendimento por número." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  async buscarAtivosPorWaId(waId: string, tipo?: AtendimentoTipo) {
    Console({ type: "log", message: "Buscando atendimento ativo por waId..." });
    try {
      const w = digits(waId);
      if (!w) return null;

      const filter: any = { waId: w, status: { $in: ATIVOS } };
      if (tipo) filter.tipo = tipo;

      const doc = await Atendimento.findOne(filter).sort({ updatedAt: -1 }).lean();
      return toPublic(doc);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar atendimento por waId." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  // =========================
  // LISTA AVANÇADA
  // =========================
  async listar(params: ListarAtendimentosParams = {}): Promise<ListarAtendimentosResponse> {
    try {
      const page = Math.max(1, Number(params.page || 1));
      const limit = Math.min(200, Math.max(1, Number(params.limit || 25)));
      const skip = (page - 1) * limit;

      const sortBy: SortBy = params.sortBy || "updatedAt";
      const sortDir: SortDir = params.sortDir || "desc";
      const sort: Record<string, 1 | -1> = { [sortBy]: sortDir === "asc" ? 1 : -1 };

      const filter: any = {};

      if (params.status?.length) filter.status = { $in: params.status };
      if (params.tipo?.length) filter.tipo = { $in: params.tipo };

      // atendente:
      // null/undefined => não filtra
      // "" => sem atendente
      // "id" => específico
      if (params.atendente !== undefined && params.atendente !== null) {
        const a = String(params.atendente);
        if (a.trim() === "") {
          filter.$or = [{ atendente: { $exists: false } }, { atendente: null }];
        } else {
          filter.atendente = a;
        }
      }

      if (params.clienteId) filter.clienteId = String(params.clienteId);
      if (params.clienteRef) filter.clienteRef = String(params.clienteRef);

      if (params.clienteNome) filter.clienteNome = safeRegex(String(params.clienteNome));

      if (params.numeroWhatsapp) {
        const original = digits(params.numeroWhatsapp);
        const canon = normalizeBRToCanonicalE164(original);

        filter.$or = [
          ...(filter.$or || []),
          { numeroWhatsappCanon: canon },
          { numeroWhatsapp: canon },
          { numeroWhatsappAliases: canon },
          ...(original ? [{ numeroWhatsappAliases: original }] : []),
        ];
      }

      // datas: dataInicio
      if (params.dataDe || params.dataAte) {
        filter.dataInicio = {};
        if (params.dataDe) filter.dataInicio.$gte = params.dataDe;
        if (params.dataAte) filter.dataInicio.$lte = params.dataAte;
      }

      // datas: updatedAt
      if (params.updatedDe || params.updatedAte) {
        filter.updatedAt = {};
        if (params.updatedDe) filter.updatedAt.$gte = params.updatedDe;
        if (params.updatedAte) filter.updatedAt.$lte = params.updatedAte;
      }

      if (params.resultadoContato) filter.resultadoContato = String(params.resultadoContato);

      // busca textual simples
      if (params.q && String(params.q).trim()) {
        const rx = safeRegex(String(params.q).trim());
        filter.$or = [
          ...(filter.$or || []),
          { numeroWhatsapp: rx },
          { numeroWhatsappCanon: rx },
          { numeroWhatsappAliases: rx },
          { waId: rx },
          { clienteId: rx },
          { clienteNome: rx },
          { clienteRef: rx },
          { observacao: rx },
        ];
      }

      const [total, docs] = await Promise.all([
        Atendimento.countDocuments(filter),
        Atendimento.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      ]);

      const items = (docs || []).map(toPublic);
      return {
        items,
        page,
        limit,
        total,
        hasMore: skip + items.length < total,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao listar atendimentos." });
      ConsoleData({ type: "error", data: error });
      return { items: [], page: 1, limit: 25, total: 0, hasMore: false };
    }
  }

  // =========================
  // STATUS / GESTÃO
  // =========================
  async transferir(atendimentoId: string, novaAtendenteId: string | null, actor = "system") {
    Console({ type: "log", message: "Transferindo atendimento..." });
    try {
      if (!atendimentoId) throw new Error("atendimentoId é obrigatório");

      const updated = await Atendimento.findByIdAndUpdate(
        atendimentoId,
        {
          $set: {
            atendente: novaAtendenteId ? new mongoose.Types.ObjectId(novaAtendenteId) : null,
            dataAtualizacao: now(),
          },
          $push: {
            historico: buildHistory(
              "Transferência",
              novaAtendenteId
                ? `Atendimento transferido para atendente ${novaAtendenteId}.`
                : "Atendimento ficou sem atendente.",
              actor
            ),
          },
        },
        { new: true }
      ).lean();

      return toPublic(updated);
    } catch (error) {
      Console({ type: "error", message: "Erro ao transferir atendimento." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  async finalizar(atendimentoId: string, payload?: { resultadoContato?: ResultadoContato | null; actor?: string }) {
    Console({ type: "log", message: "Finalizando atendimento..." });
    try {
      if (!atendimentoId) throw new Error("atendimentoId é obrigatório");
      const actor = payload?.actor ?? "system";

      const updated = await Atendimento.findByIdAndUpdate(
        atendimentoId,
        {
          $set: pickDefined<Partial<AtendimentoType>>({
            status: "fechado",
            dataFim: now(),
            dataAtualizacao: now(),
            resultadoContato: payload?.resultadoContato ?? undefined,
          }),
          $push: {
            historico: buildHistory(
              "Atendimento fechado",
              payload?.resultadoContato
                ? `Fechado com resultado: ${payload.resultadoContato}`
                : "Fechado sem resultado de contato.",
              actor
            ),
          },
        },
        { new: true }
      ).lean();

      return toPublic(updated);
    } catch (error) {
      Console({ type: "error", message: "Erro ao finalizar atendimento." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  async reabrir(atendimentoId: string, actor = "system") {
    Console({ type: "log", message: "Reabrindo atendimento..." });
    try {
      if (!atendimentoId) throw new Error("atendimentoId é obrigatório");

      const updated = await Atendimento.findByIdAndUpdate(
        atendimentoId,
        {
          $set: { status: "aberto", dataFim: null, dataAtualizacao: now() },
          $push: { historico: buildHistory("Atendimento reaberto", "Reaberto manualmente.", actor) },
        },
        { new: true }
      ).lean();

      return toPublic(updated);
    } catch (error) {
      Console({ type: "error", message: "Erro ao reabrir atendimento." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  // =========================
  // MÉTRICAS (para view)
  // =========================
  calcularMetricas(at: any) {
    const inicio = at.dataInicio ?? at.createdAt ?? null;
    const fim = at.dataFim ?? null;
    const primeiraResposta = at.dataPrimeiraRespostaAtendente ?? null;

    const tmaMs =
      inicio && primeiraResposta ? new Date(primeiraResposta).getTime() - new Date(inicio).getTime() : null;

    const tmeMs = inicio && fim ? new Date(fim).getTime() - new Date(inicio).getTime() : null;

    return {
      tmaMs,
      tmeMs,
      ultimaMsgClienteEm: at.dataUltimaMensagemCliente ?? null,
      ultimaMsgAtendenteEm: at.dataUltimaMensagemAtendente ?? null,
    };
  }

  async detalhe(id: string) {
    const doc = await Atendimento.findById(id).lean<any | null>();
    if (!doc) return null;

    const atendimento = toPublic(doc);
    const metricas = this.calcularMetricas(atendimento);

    return { atendimento, metricas };
  }

  // =========================
  // HANDLERS (HTTP) - mantém compatibilidade do seu projeto
  // =========================
  async buscarAtivos({ req, res }: { req: Request; res: Response }) {
    Console({ type: "log", message: "GET /api/atendimento/atendimentos-ativos" });

    try {
      const result = await Atendimento.find({ status: { $in: ATIVOS } }).lean();
      const response: ResponseType = {
        status: true,
        message: "Atendimentos ativos encontrados",
        data: result.map(toPublic),
      };
      return ok(res, response);
    } catch (error) {
      return fail(res, error, "Erro ao buscar atendimentos ativos");
    }
  }

  async buscarAtivosAtendente({ req, res }: { req: Request; res: Response }) {
    Console({ type: "log", message: "GET /api/atendimento/atendimentos-ativos-atendente" });

    try {
      const { atendente } = req.body;

      const filter: any = { status: { $in: ATIVOS } };
      if (String(atendente || "").trim()) filter.atendente = String(atendente);

      const result = await Atendimento.find(filter).lean();
      const response: ResponseType = {
        status: true,
        message: "Atendimentos ativos encontrados",
        data: result.map(toPublic),
      };
      return ok(res, response);
    } catch (error) {
      return fail(res, error, "Erro ao buscar atendimentos ativos");
    }
  }

  async buscarPorStatus({ req, res }: { req: Request; res: Response }) {
    Console({ type: "log", message: "GET /api/atendimento/atendimentos-por-status" });

    try {
      const { status } = req.body;
      const result = await Atendimento.find({ status }).lean();

      const response: ResponseType = {
        status: true,
        message: "Atendimentos encontrados",
        data: result.map(toPublic),
      };

      return ok(res, response);
    } catch (error) {
      return fail(res, error, "Erro ao buscar atendimentos");
    }
  }
  async buscarSemAtendente({ req, res }: { req: Request; res: Response }) {
    Console({ type: "log", message: "GET /api/atendimento/atendimentos-sem-atendente" });

    try {
      const result = await Atendimento.find({ atendente: null }).lean();

      const response: ResponseType = {
        status: true,
        message: "Atendimentos encontrados",
        data: result.map(toPublic),
      };

      return ok(res, response);
    } catch (error) {
      return fail(res, error, "Erro ao buscar atendimentos");
    }
  }

  async buscarPorFila({ req, res }: { req: Request; res: Response }) {
    Console({ type: "log", message: "GET /api/atendimento/atendimentos-por-fila" });

    try {
      const { fila } = req.body;
      const result = await Atendimento.find({ tipo: fila }).lean();

      const response: ResponseType = {
        status: true,
        message: "Atendimentos da fila " + fila + " encontrados",
        data: result.map(toPublic),
      };

      return ok(res, response);
    } catch (error) {
      return fail(res, error, "Erro ao buscar atendimentos da fila " + req.body?.fila);
    }
  }

  async buscarMetricasAtuais({ req, res }: { req: Request; res: Response }) {
    Console({ type: "log", message: "GET /api/atendimento/metricas-atuais" });

    try {
      const _now = new Date();
      const d24h = new Date(_now.getTime() - 24 * 60 * 60 * 1000);
      const d7 = new Date(_now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [agg] = await Atendimento.aggregate([
        {
          $facet: {
            total: [{ $count: "v" }],
            totalAtivos: [{ $match: { status: { $in: ATIVOS } } }, { $count: "v" }],

            porStatus: [{ $group: { _id: "$status", v: { $sum: 1 } } }],
            porTipo: [{ $group: { _id: "$tipo", v: { $sum: 1 } } }],

            porResultadoContato: [
              { $match: { resultadoContato: { $ne: null } } },
              { $group: { _id: "$resultadoContato", v: { $sum: 1 } } },
            ],

            semAtendenteAtivos: [
              {
                $match: {
                  status: { $in: ATIVOS },
                  $or: [{ atendente: null }, { atendente: { $exists: false } }],
                },
              },
              { $count: "v" },
            ],

            atrasados24h: [{ $match: { status: { $in: ATIVOS }, dataAtualizacao: { $lte: d24h } } }, { $count: "v" }],

            ultimos7dias: [
              { $match: { createdAt: { $gte: d7 } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  total: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
              { $project: { _id: 0, dia: "$_id", total: 1 } },
            ],
          },
        },
      ]);

      const toRecord = (arr: any[]) =>
        (arr || []).reduce((acc, it) => {
          acc[it._id] = it.v;
          return acc;
        }, {} as Record<string, number>);

      const data: MetricasAtuaisDTO = {
        total: agg?.total?.[0]?.v ?? 0,
        totalAtivos: agg?.totalAtivos?.[0]?.v ?? 0,

        porStatus: toRecord(agg?.porStatus) as any,
        porTipo: toRecord(agg?.porTipo) as any,
        porResultadoContato: toRecord(agg?.porResultadoContato) as any,

        semAtendenteAtivos: agg?.semAtendenteAtivos?.[0]?.v ?? 0,
        atrasados24h: agg?.atrasados24h?.[0]?.v ?? 0,

        ultimos7dias: agg?.ultimos7dias ?? [],
      };

      return ok(res, { status: true, message: "Métricas atuais carregadas", data });
    } catch (error) {
      return fail(res, error, "Erro ao buscar métricas atuais");
    }
  }
}
