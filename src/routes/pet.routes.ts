// src/routes/pet.routes.ts
import { Router } from "express";
import PetController from "../controllers/pet.controller";

const router = Router();
const controller = new PetController();

/**
 * ========= LISTAGENS POR TIPO =========
 */
router.get("/ideias", (req, res) => controller.buscarIdeias(req, res));
router.get("/melhorias", (req, res) => controller.buscarMelhorias(req, res));
router.get("/resumos", (req, res) => controller.buscarResumos(req, res));
router.get("/cursos", (req, res) => controller.buscarCursos(req, res));
router.get("/erro-interno", (req, res) => controller.buscarErrosInternos(req, res));

/**
 * ========= BUSCAS =========
 */
router.get("/:id", (req, res) => controller.buscarId(req, res));            // GET /api/pet/:id
router.get("/buscar/usuario", (req, res) => controller.buscarPorUsuario(req, res));

/**
 * ========= AÇÕES =========
 */
router.post("/cadastrar", (req, res) => controller.cadastrar(req, res));
router.post("/pontuar", (req, res) => controller.pontuar(req, res));
router.post("/adicionar/anexo", (req, res) => controller.adicionarAnexo(req, res));

export default router;
