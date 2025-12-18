// src/routes/cloudinary.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import CloudinaryController from "../controllers/cloudinary.controller";

const router = Router();
const cloudinaryController = new CloudinaryController();

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                   */
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

function pickString(v: any) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function asResourceType(v: any): "image" | "video" | "raw" {
  const s = String(v || "").toLowerCase();
  if (s === "video") return "video";
  if (s === "raw") return "raw";
  return "image";
}

/* -------------------------------------------------------------------------- */
/*  ROTAS                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/cloudinary/health
 */
router.get("/health", async (_req, res) => {
  Console({ type: "log", message: "GET /api/cloudinary/health" });
  try {
    return ok(res, {
      status: true,
      message: "cloudinary ok",
      data: { uptime: process.uptime(), now: new Date().toISOString() },
    });
  } catch (error) {
    return err(res, error, "Erro no health");
  }
});

/**
 * POST /api/cloudinary/resource
 * Body: { public_id: string }
 * Retorna detalhes do recurso (uso interno / debug).
 */
router.post("/resource", async (req, res) => {
  Console({ type: "log", message: "POST /api/cloudinary/resource" });

  try {
    const public_id = pickString(req.body?.public_id);

    if (!public_id) {
      return ok(
        res,
        { status: false, message: "public_id não informado.", data: null },
        400
      );
    }

    const data = await cloudinaryController.getResource(public_id);

    if (!data) {
      return ok(
        res,
        { status: false, message: "Recurso não encontrado/erro ao buscar.", data: null },
        404
      );
    }

    return ok(res, {
      status: true,
      message: "Recurso encontrado.",
      data,
    });
  } catch (error) {
    return err(res, error, "Erro ao buscar recurso");
  }
});

/**
 * POST /api/cloudinary/delete
 * Body:
 *  { public_id: string, resource_type?: "image"|"video"|"raw" }
 */
router.post("/delete", async (req, res) => {
  Console({ type: "log", message: "POST /api/cloudinary/delete" });

  try {
    const public_id = pickString(req.body?.public_id);
    const resource_type = asResourceType(req.body?.resource_type);

    if (!public_id) {
      return ok(
        res,
        { status: false, message: "public_id não informado.", data: null },
        400
      );
    }

    const result = await cloudinaryController.deleteFile(public_id, resource_type);

    if (!result) {
      return ok(
        res,
        { status: false, message: "Falha ao deletar arquivo.", data: null },
        500
      );
    }

    return ok(res, {
      status: true,
      message: "Arquivo deletado.",
      data: { public_id, resource_type, result },
    });
  } catch (error) {
    return err(res, error, "Erro ao deletar arquivo");
  }
});

/**
 * POST /api/cloudinary/upload
 * ⚠️ Este endpoint NÃO recebe arquivo binário (multipart) por enquanto.
 * Ele existe para cenários internos onde você já tem um filePath NO SERVIDOR.
 *
 * Body:
 *  { filePath: string, folder?: string }
 *
 * Ex: filePath="/tmp/wa-media-123"
 */
router.post("/upload", async (req, res) => {
  Console({ type: "log", message: "POST /api/cloudinary/upload" });

  try {
    const filePath = pickString(req.body?.filePath);
    const folder = pickString(req.body?.folder) || undefined;

    if (!filePath) {
      return ok(
        res,
        { status: false, message: "filePath não informado.", data: null },
        400
      );
    }

    const upload = await cloudinaryController.uploadFile(filePath, folder);

    if (!upload) {
      return ok(
        res,
        { status: false, message: "Falha no upload para Cloudinary.", data: null },
        500
      );
    }

    return ok(res, {
      status: true,
      message: "Upload realizado com sucesso.",
      data: upload,
    });
  } catch (error) {
    return err(res, error, "Erro ao fazer upload");
  }
});

const cloudinaryRoutes = router;
export default cloudinaryRoutes;
