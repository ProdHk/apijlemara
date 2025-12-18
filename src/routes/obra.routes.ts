// src/routes/obra.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import ObraController from "controllers/obra.controller";

const router = Router();
const obraController = new ObraController();

/**
 * GET /api/obras
 * Lista todas
 */
router.get("/", async (req, res) => {
  Console({ type: "log", message: "GET /api/obras" });
  try {
    const result = await obraController.listarTodas();
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar obras";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * GET /api/obras/publicas
 * Lista obras públicas para o site
 */
router.get("/publicas", async (req, res) => {
  Console({ type: "log", message: "GET /api/obras/publicas" });
  try {
    const result = await obraController.buscarPublicasSite();
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar obras públicas";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * GET /api/obras/:id
 * Busca por _id
 */
router.get("/:id", async (req, res) => {
  Console({ type: "log", message: `GET /api/obras/${req.params.id}` });
  try {
    const { id } = req.params;
    const result = await obraController.buscarPorId(id);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar obra";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * GET /api/obras/codErp/:cod
 * Busca por Cod_obr (ERP)
 */
router.get("/codErp/:cod", async (req, res) => {
  Console({ type: "log", message: `GET /api/obras/codErp/${req.params.cod}` });
  try {
    const { cod } = req.params;
    const result = await obraController.buscarPorCodigoErp(String(cod));
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar obra por código ERP";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * POST /api/obras
 * Cadastra/Upsert (por Cod_obr) - payload ERP
 */
router.post("/", async (req, res) => {
  Console({ type: "log", message: "POST /api/obras" });
  try {
    const result = await obraController.cadastrar(req.body);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar obra";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * POST /api/obras/sync
 * Sincroniza com ERP:
 * - se vier obraId, atualiza por _id
 * - se não vier, faz upsert por Cod_obr
 *
 * body: { obraId?: string, payload: {...} }
 */
router.post("/sync", async (req, res) => {
  Console({ type: "log", message: "POST /api/obras/sync" });
  try {
    const { obraId, payload } = req.body || {};
    const result = await obraController.sincronizarErp({ obraId, payload });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar obra";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * POST /api/obras/sync/lote
 * Sincroniza lista ERP
 * body: payload: Array<ObraErp>
 */
router.post("/sync/lote", async (req, res) => {
  Console({ type: "log", message: "POST /api/obras/sync/lote" });
  try {
    const payload = req.body;
    const result = await obraController.sincronizarListaErp(payload);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar lista de obras";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * PATCH /api/obras/:id/infraestrutura
 * body: InfraestruturaType
 */
router.patch("/:id/infraestrutura", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/obras/${req.params.id}/infraestrutura` });
  try {
    const { id } = req.params;
    const result = await obraController.atualizarInfraestrutura(req.body, id);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar infraestrutura";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * PATCH /api/obras/:id/infosite
 * body: InfoSiteType
 */
router.patch("/:id/infosite", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/obras/${req.params.id}/infosite` });
  try {
    const { id } = req.params;
    const result = await obraController.atualizarInfoSite(id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar infoSite";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * PATCH /api/obras/:id/localizacao
 * body: { lat: string, lng: string, linkMaps?: string }
 */
router.patch("/:id/localizacao", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/obras/${req.params.id}/localizacao` });
  try {
    const { id } = req.params;
    const { lat, lng, linkMaps } = req.body || {};
    const result = await obraController.atualizarLocalizacao(id, String(lat), String(lng), linkMaps);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar localização";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

/**
 * POST /api/obras/:id/fotos
 * body: FotosType[]
 */
router.post("/:id/fotos", async (req, res) => {
  Console({ type: "log", message: `POST /api/obras/${req.params.id}/fotos` });
  try {
    const { id } = req.params;
    const result = await obraController.adicionarFotos(id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao adicionar fotos";
    Console({ type: "error", message });
    ConsoleData({ type: "error", data: error });
    return res.status(500).json({ status: false, message, data: null });
  }
});

const obraRoutes = router;
export default obraRoutes;
