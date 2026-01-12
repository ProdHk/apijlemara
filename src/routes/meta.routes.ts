// src/routes/meta.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import MetaController from "../controllers/meta.controller";

const router = Router();
const controller = new MetaController();

/**
 * IMPORTANTES
 * - Tokens/IDs SEMPRE vêm do .env (não aceitar do front).
 * - phoneNumberId pode existir no body como override (multi-instância),
 *   mas é opcional e o controller aplica default do ENV.
 */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function ok(res: any, data: any, status = 200) {
  return res.status(status).json(data);
}

function err(res: any, error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  return res.status(status).json({ status: false, message, data: null });
}

function str(v: any) {
  return String(v ?? "").trim();
}

function isObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /meta/health
 * (rota extra - não quebra compat)
 */
router.get("/health", async (_req, res) => {
  try {
    return ok(res, {
      status: true,
      message: "meta ok",
      data: { uptime: process.uptime(), now: new Date().toISOString() },
    });
  } catch (error) {
    return err(res, error, "Erro no health");
  }
});

/* -------------------------------------------------------------------------- */
/* ENVIO (Meta -> WhatsApp Cloud)                                             */
/* -------------------------------------------------------------------------- */

// body: { to, body, preview_url?, atendimentoId?, biz_opaque_callback_data?, phoneNumberId? }
router.post("/enviar/texto", async (req, res) => {
  Console({ type: "log", message: "POST /meta/enviar/texto" });
  try {
    if (!isObject(req.body)) {
      return ok(
        res,
        { status: false, message: "Body inválido.", data: null },
        400
      );
    }
    if (!str(req.body.to) || !str(req.body.body)) {
      return ok(
        res,
        { status: false, message: "Campos obrigatórios: to, body.", data: null },
        400
      );
    }

    const data = await controller.sendText(req.body);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao enviar texto");
  }
});

// body: { to, name, language?, components?, atendimentoId?, biz_opaque_callback_data?, phoneNumberId? }
router.post("/enviar/template", async (req, res) => {
  Console({ type: "log", message: "POST /meta/enviar/template" });
  try {
    if (!isObject(req.body)) {
      return ok(
        res,
        { status: false, message: "Body inválido.", data: null },
        400
      );
    }
    if (!str(req.body.to) || !str(req.body.name)) {
      return ok(
        res,
        { status: false, message: "Campos obrigatórios: to, name.", data: null },
        400
      );
    }

    const data = await controller.sendTemplate(req.body);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao enviar template");
  }
});

// body: { to, latitude, longitude, name?, address?, atendimentoId?, biz_opaque_callback_data?, phoneNumberId? }
router.post("/enviar/location", async (req, res) => {
  Console({ type: "log", message: "POST /meta/enviar/location" });
  try {
    if (!isObject(req.body)) {
      return ok(
        res,
        { status: false, message: "Body inválido.", data: null },
        400
      );
    }
    const to = str(req.body.to);
    const lat = req.body.latitude;
    const lng = req.body.longitude;

    if (!to || typeof lat !== "number" || typeof lng !== "number") {
      return ok(
        res,
        {
          status: false,
          message: "Campos obrigatórios: to, latitude (number), longitude (number).",
          data: null,
        },
        400
      );
    }

    const data = await controller.sendLocation(req.body);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao enviar location");
  }
});

// body: { to, type, link?, filePath?, caption?, filename?, atendimentoId?, biz_opaque_callback_data?, phoneNumberId? }
router.post("/enviar/media", async (req, res) => {
  Console({ type: "log", message: "POST /meta/enviar/media" });
  try {
    if (!isObject(req.body)) {
      return ok(
        res,
        { status: false, message: "Body inválido.", data: null },
        400
      );
    }
    const to = str(req.body.to);
    const type = str(req.body.type);

    if (!to || !type) {
      return ok(
        res,
        { status: false, message: "Campos obrigatórios: to, type.", data: null },
        400
      );
    }

    // link OU filePath (controller valida também)
    const data = await controller.sendMedia(req.body);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao enviar mídia");
  }
});

/**
 * Interactive (compat)
 * - No controller novo eu NÃO implementei sendInteractive ainda.
 * - Mantive o endpoint por compatibilidade.
 */
router.post("/enviar/interactive", (_req, res) => {
  return res.status(501).json({
    status: false,
    message:
      "Endpoint /enviar/interactive ainda não implementado no meta.controller refatorado.",
    data: null,
  });
});

/**
 * Marcar mensagem como lida (opcional)
 * body: { wamid, phoneNumberId? }
 */
router.post("/mensagens/marcar-lida", async (req, res) => {
  Console({ type: "log", message: "POST /meta/mensagens/marcar-lida" });
  try {
    const wamid = str(req.body?.wamid);
    const phoneNumberId = req.body?.phoneNumberId;

    if (!wamid) {
      return ok(res, { status: false, message: "wamid é obrigatório", data: null }, 400);
    }

    const data = await controller.markAsRead(wamid, phoneNumberId);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao marcar como lida");
  }
});

/* -------------------------------------------------------------------------- */
/* TEMPLATES (admin)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * GET /meta/templates
 * query: ?wabaId=... (override opcional)
 */
router.get("/templates", async (req, res) => {
  Console({ type: "log", message: "GET /meta/templates" });
  try {
    const wabaId = str((req.query as any)?.wabaId) || undefined;
    const data = await controller.listTemplates(wabaId);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao listar templates");
  }
});

/**
 * POST /meta/templates
 * body: payload do template (Meta)
 * query: ?wabaId=... (override opcional)
 */
router.post("/templates", async (req, res) => {
  Console({ type: "log", message: "POST /meta/templates" });
  try {
    const wabaId = str((req.query as any)?.wabaId) || undefined;
    const data = await controller.createTemplate(req.body, wabaId);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao criar template");
  }
});

/**
 * GET /meta/templates/http
 * (rota extra) usa o handler httpListTemplates do controller
 * - não altera /templates existente
 */
router.get("/templates/http", async (req, res) => {
  Console({ type: "log", message: "GET /meta/templates/http" });
  return controller.httpListTemplates(req, res);
});

/* -------------------------------------------------------------------------- */
/* MÍDIAS (download/publicar)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Busca info de mídia na Meta (url/mime/etc)
 * GET /meta/media/:mediaId
 */
router.get("/media/:mediaId", async (req, res) => {
  Console({ type: "log", message: "GET /meta/media/:mediaId" });
  try {
    const mediaId = str(req.params.mediaId);
    if (!mediaId) {
      return ok(res, { status: false, message: "mediaId é obrigatório", data: null }, 400);
    }

    const data = await controller.getMediaInfo(mediaId);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao buscar media");
  }
});

/**
 * Publica mídia no Cloudinary (Meta -> Cloudinary)
 * POST /meta/media/publicar-cloudinary
 * body: { mediaId, folder? }
 */
router.post("/media/publicar-cloudinary", async (req, res) => {
  Console({ type: "log", message: "POST /meta/media/publicar-cloudinary" });
  try {
    const mediaId = str(req.body?.mediaId);
    const folder = str(req.body?.folder) || "meta/inbound";

    if (!mediaId) {
      return ok(res, { status: false, message: "mediaId é obrigatório", data: null }, 400);
    }

    const data = await controller.saveInboundMediaToCloudinary(mediaId, folder);
    return ok(res, { status: true, data });
  } catch (error: any) {
    return err(res, error, error?.message || "Erro ao publicar media no Cloudinary");
  }
});

export default router;
