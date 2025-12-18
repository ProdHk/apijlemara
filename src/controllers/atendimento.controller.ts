// src/controllers/atendimento.controller.ts
import mongoose, { Types } from "mongoose";
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

function toPublic(doc: any) {
  return doc ? { ...doc, _id: String(doc._id) } : doc;
}

function digits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
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

/**
 * Estratégia anti-duplicidade:
 * - 1 atendimento por (numeroWhatsapp) + (tipo) enquanto estiver ativo (aberto/aguardando-*).
 * - Se existir ativo, atualiza; se não existir, cria.
 * - Se existir fechado/cancelado e chegar nova interação, reabre o mais recente do mesmo numeroWhatsapp+tipo.
 *
 * Obs: Seu model não tem "phoneNumberId". Então a unicidade é por numeroWhatsapp.
 * Se você tiver múltiplos números da empresa, recomendo adicionar depois: phoneNumberId + index.
 */
const ATIVOS: AtendimentoStatus[] = ["aberto", "aguardando-cliente", "aguardando-atendente"];
const INATIVOS: AtendimentoStatus[] = ["fechado", "cancelado"];

export default class AtendimentoController {
  // =========================
  // CORE: garantir atendimento (sem duplicar)
  // =========================
  async ensure(params: {
    numeroWhatsapp: string; // cliente digits
    tipo?: AtendimentoTipo;
    atendente?: string | Types.ObjectId | null;

    clienteId: string;
    clienteNome?: string;
    clienteRef?: string | null;

    observacao?: string;
  }) {
    Console({ type: "log", message: "Ensure atendimento (sem duplicidade)..." });

    try {
      const numeroWhatsapp = digits(params.numeroWhatsapp);
      if (!numeroWhatsapp) throw new Error("numeroWhatsapp é obrigatório");
      if (!params.clienteId) throw new Error("clienteId é obrigatório");

      const tipo: AtendimentoTipo = params.tipo ?? "outro";
      const agora = now();

      // 1) tenta achar ativo (mais performático que sort+find em muitos casos)
      const ativo = await Atendimento.findOne({
        numeroWhatsapp,
        tipo,
        status: { $in: ATIVOS },
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
        };

        const updated = await Atendimento.findByIdAndUpdate(
          ativo._id,
          { $set: pickDefined(patch) },
          { new: true }
        ).lean();

        return toPublic(updated);
      }

      // 2) não tem ativo -> tenta reabrir o mais recente inativo
      const inativo = await Atendimento.findOne({
        numeroWhatsapp,
        tipo,
        status: { $in: INATIVOS },
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
            }),
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

      // 3) cria novo
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

        numeroWhatsapp,

        clienteId: params.clienteId,
        clienteNome: params.clienteNome ?? "",
        clienteRef: params.clienteRef ?? null,

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
      const phone = digits(numeroWhatsapp);
      if (!phone) return null;

      const filter: any = { numeroWhatsapp: phone, status: { $in: ATIVOS } };
      if (tipo) filter.tipo = tipo;

      const doc = await Atendimento.findOne(filter).sort({ updatedAt: -1 }).lean();
      return toPublic(doc);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar atendimento por número." });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  // =========================
  // LISTA AVANÇADA (robusta e performática)
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
          filter.$or = [
            { atendente: { $exists: false } },
            { atendente: null },
          ];
        } else {
          filter.atendente = a;
        }
      }

      if (params.clienteId) filter.clienteId = String(params.clienteId);
      if (params.clienteRef) filter.clienteRef = String(params.clienteRef);

      if (params.numeroWhatsapp) filter.numeroWhatsapp = digits(params.numeroWhatsapp);

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

      // resultado contato (é string simples no model atual)
      if (params.resultadoContato) filter.resultadoContato = String(params.resultadoContato);

      // busca textual simples (sem text-index para manter easycode)
      if (params.q && String(params.q).trim()) {
        const rx = safeRegex(String(params.q).trim());
        filter.$or = [
          ...(filter.$or || []),
          { numeroWhatsapp: rx },
          { clienteId: rx },
          { clienteNome: rx },
          { clienteRef: rx },
          { observacao: rx },
        ];
      }

      const [total, docs] = await Promise.all([
        Atendimento.countDocuments(filter),
        Atendimento.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
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
}

// =========================
// helpers
// =========================
function pickDefined<T extends object>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}
