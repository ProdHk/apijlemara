// src/routes/atendimento.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";

import AtendimentoController, {
  ListarAtendimentosParams,
} from "../controllers/atendimento.controller";

const router = Router();
const controller = new AtendimentoController();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
function ok(res: any, payload: any, status = 200) {
  return res.status(status).json(payload);
}

function err(res: any, error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  return res.status(status).json({ status: false, message, data: null });
}

function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function splitCsv(v: any): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function digits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function toInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function toSortDir(v: any): "asc" | "desc" | undefined {
  const s = String(v || "").toLowerCase();
  if (s === "asc") return "asc";
  if (s === "desc") return "desc";
  return undefined;
}

function toSortBy(v: any): "updatedAt" | "createdAt" | "dataAtualizacao" | undefined {
  const s = String(v || "");
  if (s === "updatedAt" || s === "createdAt" || s === "dataAtualizacao") return s;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Rotas "legadas" (handlers no controller usando { req, res })               */
/* -------------------------------------------------------------------------- */
router.get("/atendimentos-ativos", (req, res) => controller.buscarAtivos({ req, res }));
router.post("/atendimentos-ativos-atendente", (req, res) => controller.buscarAtivosAtendente({ req, res }));
router.post("/atendimentos-por-status", (req, res) => controller.buscarPorStatus({ req, res }));
router.post("/atendimentos-por-fila", (req, res) => controller.buscarPorFila({ req, res }));
router.get("/metricas-atuais", (req, res) => controller.buscarMetricasAtuais({ req, res }));

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/atendimentos/health
 */
router.get("/health", async (_req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/health" });
  return ok(res, {
    status: true,
    message: "atendimentos ok",
    data: { uptime: process.uptime(), now: new Date().toISOString() },
  });
});

/* -------------------------------------------------------------------------- */
/* Consultas específicas (DEVEM vir antes de "/:id")                           */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/atendimentos/ativos/por-numero?numeroWhatsapp=...&tipo=...
 */
router.get("/ativos/por-numero", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/ativos/por-numero" });

  try {
    const numeroWhatsapp = digits(String(req.query.numeroWhatsapp || ""));
    const tipo = req.query.tipo ? (String(req.query.tipo) as any) : undefined;

    if (!numeroWhatsapp) {
      return ok(res, { status: false, message: "numeroWhatsapp não informado.", data: null }, 400);
    }

    const data = await controller.buscarAtivosPorNumero(numeroWhatsapp, tipo);
    if (!data) {
      return ok(res, { status: false, message: "Nenhum atendimento ativo encontrado.", data: null }, 404);
    }

    return ok(res, { status: true, message: "Atendimento ativo encontrado.", data });
  } catch (error) {
    return err(res, error, "Erro ao buscar atendimento ativo por número");
  }
});

/**
 * GET /api/atendimentos/ativos/por-waid?waId=...&tipo=...
 * (✅ faltava essa rota)
 */
router.get("/ativos/por-waid", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/ativos/por-waid" });

  try {
    const waId = digits(String(req.query.waId || ""));
    const tipo = req.query.tipo ? (String(req.query.tipo) as any) : undefined;

    if (!waId) {
      return ok(res, { status: false, message: "waId não informado.", data: null }, 400);
    }

    const data = await controller.buscarAtivosPorWaId(waId, tipo);
    if (!data) {
      return ok(res, { status: false, message: "Nenhum atendimento ativo encontrado.", data: null }, 404);
    }

    return ok(res, { status: true, message: "Atendimento ativo encontrado.", data });
  } catch (error) {
    return err(res, error, "Erro ao buscar atendimento ativo por waId");
  }
});

/* -------------------------------------------------------------------------- */
/* Lista avançada                                                             */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/atendimentos
 */
router.get("/", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos" });

  try {
    const status = splitCsv(req.query.status);
    const tipo = splitCsv(req.query.tipo);

    // atendente:
    // - omitido => não filtra (undefined)
    // - "null"  => null (controller trata como "sem filtro", conforme seu comentário)
    // - ""      => string vazia (controller trata como "sem atendente")
    // - "<id>"  => id
    let atendente: any = undefined;
    if (req.query.atendente !== undefined) {
      const a = String(req.query.atendente);
      atendente = a === "null" ? null : a; // mantém "" e "id"
    }

    const params: ListarAtendimentosParams = {
      status: status?.length ? (status as any) : undefined,
      tipo: tipo?.length ? (tipo as any) : undefined,
      atendente,

      clienteId: req.query.clienteId ? String(req.query.clienteId) : undefined,
      clienteNome: req.query.clienteNome ? String(req.query.clienteNome) : undefined,
      clienteRef: req.query.clienteRef ? String(req.query.clienteRef) : undefined,

      numeroWhatsapp: req.query.numeroWhatsapp ? digits(String(req.query.numeroWhatsapp)) : undefined,

      dataDe: (toDateOrNull(req.query.dataDe) as any) ?? undefined,
      dataAte: (toDateOrNull(req.query.dataAte) as any) ?? undefined,

      updatedDe: (toDateOrNull(req.query.updatedDe) as any) ?? undefined,
      updatedAte: (toDateOrNull(req.query.updatedAte) as any) ?? undefined,

      q: req.query.q ? String(req.query.q) : undefined,

      page: toInt(req.query.page, 1),
      limit: toInt(req.query.limit, 25),

      sortBy: toSortBy(req.query.sortBy),
      sortDir: toSortDir(req.query.sortDir),

      resultadoContato: req.query.resultadoContato ? (String(req.query.resultadoContato) as any) : undefined,
    };

    const data = await controller.listar(params);

    return ok(res, { status: true, message: "Atendimentos listados com sucesso!", data });
  } catch (error) {
    return err(res, error, "Erro ao listar atendimentos");
  }
});

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */
/**
 * POST /api/atendimentos/ensure
 */
router.post("/ensure", async (req, res) => {
  Console({ type: "log", message: "POST /api/atendimentos/ensure" });

  try {
    const body = req.body || {};

    const numeroWhatsapp = digits(String(body.numeroWhatsapp || ""));
    const clienteId = String(body.clienteId || "").trim();

    if (!numeroWhatsapp) {
      return ok(res, { status: false, message: "numeroWhatsapp é obrigatório.", data: null }, 400);
    }
    if (!clienteId) {
      return ok(res, { status: false, message: "clienteId é obrigatório.", data: null }, 400);
    }

    const data = await controller.ensure({
      numeroWhatsapp,
      tipo: body.tipo,
      atendente: body.atendente ?? undefined,
      clienteId,
      clienteNome: body.clienteNome,
      clienteRef: body.clienteRef ?? null,
      // se você já envia waId no body, aproveita:
      waId: body.waId ?? null,
      observacao: body.observacao,
    });

    if (!data) {
      return ok(res, { status: false, message: "Falha ao garantir atendimento.", data: null }, 500);
    }

    return ok(res, { status: true, message: "Atendimento garantido.", data }, 201);
  } catch (error) {
    return err(res, error, "Erro ao garantir atendimento");
  }
});

/**
 * POST /api/atendimentos/anexar-mensagem
 */
router.post("/anexar-mensagem", async (req, res) => {
  Console({ type: "log", message: "POST /api/atendimentos/anexar-mensagem" });

  try {
    const body = req.body || {};
    const atendimentoId = String(body.atendimentoId || "").trim();
    const mensagemId = String(body.mensagemId || "").trim();
    const meta = body.meta || {};

    if (!atendimentoId) {
      return ok(res, { status: false, message: "atendimentoId é obrigatório.", data: null }, 400);
    }
    if (!mensagemId) {
      return ok(res, { status: false, message: "mensagemId é obrigatório.", data: null }, 400);
    }
    if (!meta?.direction) {
      return ok(res, { status: false, message: "meta.direction é obrigatório.", data: null }, 400);
    }

    const data = await controller.anexarMensagem({
      atendimentoId,
      mensagemId,
      meta: {
        direction: meta.direction,
        ts: meta.ts ? toDateOrNull(meta.ts) : null,
        actor: meta.actor,
      },
    });

    if (!data) {
      return ok(res, { status: false, message: "Atendimento não encontrado ou falha ao anexar.", data: null }, 404);
    }

    return ok(res, { status: true, message: "Mensagem anexada.", data });
  } catch (error) {
    return err(res, error, "Erro ao anexar mensagem");
  }
});

/* -------------------------------------------------------------------------- */
/* Rotas por ID (DEVEM vir por último)                                        */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/atendimentos/:id/detalhe
 */
router.get("/:id/detalhe", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/:id/detalhe" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) return ok(res, { status: false, message: "ID não informado.", data: null }, 400);

    const data = await controller.detalhe(id);
    if (!data) return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);

    return ok(res, { status: true, message: "Detalhe carregado.", data });
  } catch (error) {
    return err(res, error, "Erro ao buscar detalhe do atendimento");
  }
});

/**
 * GET /api/atendimentos/:id
 */
router.get("/:id", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/:id" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) return ok(res, { status: false, message: "ID não informado.", data: null }, 400);

    const data = await controller.buscarPorId(id);
    if (!data) return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);

    return ok(res, { status: true, message: "Atendimento encontrado.", data });
  } catch (error) {
    return err(res, error, "Erro ao buscar atendimento");
  }
});

/**
 * POST /api/atendimentos/:id/transferir
 */
router.post("/:id/transferir", async (req, res) => {
  Console({ type: "log", message: "POST /api/atendimentos/:id/transferir" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) return ok(res, { status: false, message: "ID não informado.", data: null }, 400);

    const novaAtendenteId =
      req.body?.novaAtendenteId === null ? null : String(req.body?.novaAtendenteId || "").trim();

    const actor = req.body?.actor ? String(req.body.actor) : "system";

    if (novaAtendenteId !== null && !novaAtendenteId) {
      return ok(res, { status: false, message: "novaAtendenteId inválido (use null ou um id).", data: null }, 400);
    }

    const data = await controller.transferir(id, novaAtendenteId, actor);
    if (!data) return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);

    return ok(res, { status: true, message: "Atendimento transferido.", data });
  } catch (error) {
    return err(res, error, "Erro ao transferir atendimento");
  }
});

/**
 * POST /api/atendimentos/:id/finalizar
 */
router.post("/:id/finalizar", async (req, res) => {
  Console({ type: "log", message: "POST /api/atendimentos/:id/finalizar" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) return ok(res, { status: false, message: "ID não informado.", data: null }, 400);

    const actor = req.body?.actor ? String(req.body.actor) : "system";
    const resultadoContato =
      req.body?.resultadoContato === null
        ? null
        : req.body?.resultadoContato
          ? String(req.body.resultadoContato)
          : undefined;

    const data = await controller.finalizar(id, { resultadoContato: resultadoContato as any, actor });
    if (!data) return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);

    return ok(res, { status: true, message: "Atendimento finalizado.", data });
  } catch (error) {
    return err(res, error, "Erro ao finalizar atendimento");
  }
});

/**
 * POST /api/atendimentos/:id/reabrir
 */
router.post("/:id/reabrir", async (req, res) => {
  Console({ type: "log", message: "POST /api/atendimentos/:id/reabrir" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) return ok(res, { status: false, message: "ID não informado.", data: null }, 400);

    const actor = req.body?.actor ? String(req.body.actor) : "system";

    const data = await controller.reabrir(id, actor);
    if (!data) return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);

    return ok(res, { status: true, message: "Atendimento reaberto.", data });
  } catch (error) {
    return err(res, error, "Erro ao reabrir atendimento");
  }
});

const atendimentoRoutes = router;
export default atendimentoRoutes;
