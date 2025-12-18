// src/routes/mensagem.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import MensagemController from "../controllers/mensagem.controller";

const router = Router();
const mensagemController = new MensagemController();

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                   */
/* -------------------------------------------------------------------------- */
function digits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function toInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function ok(res: any, data: any, status = 200) {
  return res.status(status).json(data);
}

function err(res: any, error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  return res.status(status).json({ status: false, message, data: null });
}

/* -------------------------------------------------------------------------- */
/*  ROTAS                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/mensagens/health
 */
router.get("/health", async (req, res) => {
  Console({ type: "log", message: "GET /api/mensagens/health" });
  try {
    return ok(res, {
      status: true,
      message: "mensagem ok",
      data: { uptime: process.uptime(), now: new Date().toISOString() },
    });
  } catch (error) {
    return err(res, error, "Erro no health");
  }
});

/**
 * POST /api/mensagens/webhook
 * (opcional) endpoint para testar/processar manualmente o payload do webhook da Meta
 */
router.post("/webhook", async (req, res) => {
  Console({ type: "log", message: "POST /api/mensagens/webhook" });
  try {
    const result = await mensagemController.processWebhook(req.body);
    return ok(res, result);
  } catch (error) {
    return err(res, error, "Erro ao processar webhook");
  }
});

/**
 * GET /api/mensagens/atendimento/:atendimentoId
 * Lista mensagens vinculadas a um atendimento (ordenadas asc no controller)
 */
router.get("/atendimento/:atendimentoId", async (req, res) => {
  const { atendimentoId } = req.params;
  Console({
    type: "log",
    message: `GET /api/mensagens/atendimento/${atendimentoId}`,
  });

  try {
    if (!atendimentoId) {
      return ok(res, {
        status: false,
        message: "atendimentoId não informado.",
        data: [],
      }, 400);
    }

    const data = await mensagemController.listarPorAtendimento(atendimentoId);

    return ok(res, {
      status: true,
      message: "Mensagens do atendimento encontradas.",
      data,
    });
  } catch (error) {
    return err(res, error, "Erro ao listar mensagens por atendimento");
  }
});

/**
 * GET /api/mensagens/numero
 * Query:
 *  - phoneNumberId (obrigatório)
 *  - from (telefone do cliente; obrigatório)
 *  - limit (opcional, default 50, max 500)
 *
 * Ex: /api/mensagens/numero?phoneNumberId=123&from=31999999999&limit=100
 */
router.get("/numero", async (req, res) => {
  Console({ type: "log", message: "GET /api/mensagens/numero" });

  try {
    const phoneNumberId = String(req.query.phoneNumberId || "").trim();
    const from = digits(String(req.query.from || ""));
    const limit = clamp(toInt(req.query.limit, 50), 1, 500);

    if (!phoneNumberId) {
      return ok(res, {
        status: false,
        message: "phoneNumberId não informado.",
        data: [],
      }, 400);
    }

    if (!from) {
      return ok(res, {
        status: false,
        message: "from (telefone do cliente) não informado.",
        data: [],
      }, 400);
    }

    const data = await mensagemController.listarPorNumero({
      phoneNumberId,
      from,
      limit,
    });

    return ok(res, {
      status: true,
      message: "Mensagens encontradas.",
      data,
      meta: { phoneNumberId, from, limit, total: data.length },
    });
  } catch (error) {
    return err(res, error, "Erro ao listar mensagens por número");
  }
});

const mensagemRoutes = router;
export default mensagemRoutes;
