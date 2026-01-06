// src/routes/webhook.routes.ts
import { Router } from "express";
import MetaWebhookController from "../controllers/metawebhook.controller";

const router = Router();
const meta = new MetaWebhookController();

/**
 * META Webhook
 * - GET  /webhook  -> verificação (hub.challenge)
 * - POST /webhook  -> eventos (messages/statuses)
 *
 * Monte este router em: app.use("/api/meta", router)
 * Assim o endpoint final fica:
 *   GET/POST https://<dominio>/api/meta/webhook
 */
router.get("/", (req, res) => meta.verify(req, res));
router.post("/", (req, res) => meta.receive(req, res));

export default router;
