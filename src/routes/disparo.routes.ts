// src/routes/disparo.routes.ts
import { Router } from "express";
import DisparoController from "../controllers/disparo.controller";
import multer from "multer";

const router = Router();
const controller = new DisparoController();


const upload = multer({ dest: "uploads/" });


/**
 * ========= LISTAGENS =========
 */
router.get("/", (req, res) => controller.list(req, res)); // GET /api/disparos?atendenteId&status&page&limit

/**
 * ========= BUSCAS =========
 */
router.get("/:id", (req, res) => controller.get(req, res)); // GET /api/disparos/:id

/**
 * ========= AÇÕES =========
 */
router.post("/cadastrar", upload.single("file"), (req, res) => controller.create(req, res)); // POST /api/disparos/cadastrar (multipart/form-data)
router.post("/:id/send-next", (req, res) => controller.sendNext(req, res)); // POST /api/disparos/:id/send-next

router.patch("/:id/pause", (req, res) => controller.pause(req, res)); // PATCH /api/disparos/:id/pause
router.patch("/:id/resume", (req, res) => controller.resume(req, res)); // PATCH /api/disparos/:id/resume

router.delete("/:id", (req, res) => controller.remove(req, res)); // DELETE /api/disparos/:id

export default router;
