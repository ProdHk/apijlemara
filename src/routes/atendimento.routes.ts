// src/routes/atendimento.routes.ts
import { Request, Response, Router } from "express";
import Console, { ConsoleData } from "../lib/Console";

import AtendimentoController, {
  ListarAtendimentosParams,
} from "../controllers/atendimento.controller";

const router = Router();
const controller = new AtendimentoController();

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                   */
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
/*  ROTAS                                                                     */
/* -------------------------------------------------------------------------- */





router.get("/atendimentos-ativos", (req, res) => controller.buscarAtivos({ req, res }));
router.post("/atendimentos-ativos-atendente", (req, res) => controller.buscarAtivosAtendente({ req, res }));
router.post("/atendimentos-por-status", (req, res) => controller.buscarPorStatus({ req, res }));
router.post("/atendimentos-por-fila", (req, res) => controller.buscarPorFila({ req, res }));
router.get("/metricas-atuais", (req, res) => controller.buscarMetricasAtuais({ req, res }));


































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

/**
 * GET /api/atendimentos
 * Query (tudo opcional):
 *  - status=aberto,aguardando-atendente
 *  - tipo=cobranca,venda
 *  - atendente=null | "" | "<id>"
 *      - omitido => não filtra
 *      - atendente= (vazio) => sem atendente
 *      - atendente=<id> => atendente específico
 *  - clienteId, clienteNome, clienteRef, numeroWhatsapp
 *  - dataDe, dataAte (dataInicio)
 *  - updatedDe, updatedAte (updatedAt)
 *  - resultadoContato
 *  - q
 *  - page, limit
 *  - sortBy=updatedAt|createdAt|dataAtualizacao
 *  - sortDir=asc|desc
 */
router.get("/", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos" });

  try {
    const status = splitCsv(req.query.status);
    const tipo = splitCsv(req.query.tipo);

    // atendente:
    // - se vier "null" -> manda null (controller entende como sem filtro)
    // - se vier "" -> string vazia (controller entende como "sem atendente")
    // - se vier id -> id
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

      dataDe: toDateOrNull(req.query.dataDe) as Date,
      dataAte: toDateOrNull(req.query.dataAte) as Date,

      updatedDe: toDateOrNull(req.query.updatedDe) as Date,
      updatedAte: toDateOrNull(req.query.updatedAte) as Date,

      q: req.query.q ? String(req.query.q) : undefined,

      page: toInt(req.query.page, 1),
      limit: toInt(req.query.limit, 25),

      sortBy: toSortBy(req.query.sortBy),
      sortDir: toSortDir(req.query.sortDir),

      resultadoContato: req.query.resultadoContato
        ? (String(req.query.resultadoContato) as any)
        : undefined,
    };

    const data = await controller.listar(params);

    return ok(res, {
      status: true,
      message: "Atendimentos listados com sucesso!",
      data,
    });
  } catch (error) {
    return err(res, error, "Erro ao listar atendimentos");
  }
});

/**
 * GET /api/atendimentos/:id
 */
router.get("/:id", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/:id" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return ok(res, { status: false, message: "ID não informado.", data: null }, 400);
    }

    const data = await controller.buscarPorId(id);
    if (!data) {
      return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);
    }

    return ok(res, { status: true, message: "Atendimento encontrado.", data });
  } catch (error) {
    return err(res, error, "Erro ao buscar atendimento");
  }
});

/**
 * GET /api/atendimentos/:id/detalhe
 * Retorna: { atendimento, metricas }
 */
router.get("/:id/detalhe", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/:id/detalhe" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return ok(res, { status: false, message: "ID não informado.", data: null }, 400);
    }

    const data = await controller.detalhe(id);
    if (!data) {
      return ok(res, { status: false, message: "Atendimento não encontrado.", data: null }, 404);
    }

    return ok(res, { status: true, message: "Detalhe carregado.", data });
  } catch (error) {
    return err(res, error, "Erro ao buscar detalhe do atendimento");
  }
});

/**
 * GET /api/atendimentos/ativos/por-numero?numeroWhatsapp=...&tipo=...
 * Retorna o atendimento ativo (se existir)
 */
router.get("/ativos/por-numero", async (req, res) => {
  Console({ type: "log", message: "GET /api/atendimentos/ativos/por-numero" });

  try {
    const numeroWhatsapp = digits(String(req.query.numeroWhatsapp || ""));
    const tipo = req.query.tipo ? (String(req.query.tipo) as any) : undefined;

    if (!numeroWhatsapp) {
      return ok(
        res,
        { status: false, message: "numeroWhatsapp não informado.", data: null },
        400
      );
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
 * POST /api/atendimentos/ensure
 * Body:
 * {
 *   numeroWhatsapp: string,
 *   tipo?: "venda"|"cobranca"|"compra"|"lembrete"|"outro",
 *   atendente?: string|null,
 *   clienteId: string,
 *   clienteNome?: string,
 *   clienteRef?: string|null,
 *   observacao?: string
 * }
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
 * Body:
 * {
 *   atendimentoId: string,
 *   mensagemId: string,
 *   meta: { direction: "INBOUND"|"OUTBOUND", ts?: string|Date|null, actor?: string }
 * }
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

/**
 * POST /api/atendimentos/:id/transferir
 * Body: { novaAtendenteId: string|null, actor?: string }
 */
router.post("/:id/transferir", async (req, res) => {
  Console({ type: "log", message: "POST /api/atendimentos/:id/transferir" });

  try {
    const id = String(req.params.id || "").trim();
    if (!id) return ok(res, { status: false, message: "ID não informado.", data: null }, 400);

    const novaAtendenteId =
      req.body?.novaAtendenteId === null ? null : String(req.body?.novaAtendenteId || "").trim();

    const actor = req.body?.actor ? String(req.body.actor) : "system";

    // valida: se não for null, não pode ser string vazia
    if (novaAtendenteId !== null && !novaAtendenteId) {
      return ok(
        res,
        { status: false, message: "novaAtendenteId inválido (use null ou um id).", data: null },
        400
      );
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
 * Body: { resultadoContato?: ResultadoContato|null, actor?: string }
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
 * Body: { actor?: string }
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
