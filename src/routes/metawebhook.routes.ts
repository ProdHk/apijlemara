// src/routes/metawebhook.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import MetaWebhookController from "../controllers/metawebhook.controller";

const router = Router();
const metaWebhookController = new MetaWebhookController();

function ok(res: any, data?: any) {
  // Meta Webhook exige resposta rápida: normalmente 200 OK já basta
  if (data === undefined) return res.sendStatus(200);
  return res.status(200).json(data);
}

function bad(res: any, message: string) {
  return res.status(400).json({ status: false, message, data: null });
}

function fail(res: any, error: unknown, fallback = "Erro interno") {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  // para webhook: melhor SEMPRE responder 200 (evita retries agressivos da Meta)
  return res.status(200).json({ status: false, message, data: null });
}

/**
 * GET /api/metawebhook
 * Verificação do Webhook (Meta)
 * Querystring:
 *  - hub.mode
 *  - hub.verify_token
 *  - hub.challenge
 */
router.get("/", async (req, res) => {
  Console({ type: "log", message: "GET /api/metawebhook (verify)" });

  try {
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = req.query["hub.challenge"];

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      Console({ type: "error", message: "META_WEBHOOK_VERIFY_TOKEN não definido no .env" });
      return res.sendStatus(500);
    }

    if (mode !== "subscribe") {
      return bad(res, "hub.mode inválido.");
    }

    if (!token || token !== verifyToken) {
      Console({ type: "warn", message: "Webhook verify_token inválido." });
      return res.sendStatus(403);
    }

    // Meta espera retornar o challenge em texto puro
    return res.status(200).send(String(challenge ?? ""));
  } catch (error) {
    return fail(res, error, "Erro ao verificar webhook");
  }
});

/**
 * POST /api/metawebhook
 * Recebe eventos (messages/statuses)
 */
router.post("/", async (req, res) => {
  Console({ type: "log", message: "POST /api/metawebhook" });

  try {
    // responde rápido; processa de forma assíncrona dentro do request (sem background)
    // Obs: o controller já possui try/catch interno, mas mantemos aqui também
    await metaWebhookController.handleWebhookBody(req.body);
    return ok(res);
  } catch (error) {
    return fail(res, error, "Erro ao processar webhook");
  }
});

/**
 * GET /api/metawebhook/health
 * Checagem simples para infra/uptime
 */
router.get("/health", async (req, res) => {
  Console({ type: "log", message: "GET /api/metawebhook/health" });
  try {
    return ok(res, {
      status: true,
      message: "metawebhook ok",
      data: {
        uptime: process.uptime(),
        now: new Date().toISOString(),
      },
    });
  } catch (error) {
    return fail(res, error, "Erro no health");
  }
});

const metaWebhookRoutes = router;
export default metaWebhookRoutes;
