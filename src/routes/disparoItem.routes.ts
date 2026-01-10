// src/routes/disparoItem.routes.ts
import { Router } from "express";
import DisparoItemController from "../controllers/disparoItem.controller";

const router = Router();
const controller = new DisparoItemController();

/**
 * ========= LISTAGENS =========
 */
router.get("/", (req, res) => controller.list(req, res)); // GET /api/disparo-items?disparoId&status&page&limit

/**
 * ========= BUSCAS =========
 */
router.get("/:id", (req, res) => controller.get(req, res)); // GET /api/disparo-items/:id

/**
 * ========= AÇÕES =========
 */
router.post("/:id/retry", (req, res) => controller.retry(req, res)); // POST /api/disparo-items/:id/retry
router.patch("/:id/status", (req, res) => controller.setStatus(req, res)); // PATCH /api/disparo-items/:id/status

export default router;
