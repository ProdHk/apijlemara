// src/routes/unidade.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import UnidadeController from "../controllers/unidade.controller";

const router = Router();
const unidadeController = new UnidadeController();

function ok(res: any, data: any) {
  return res.status(200).json(data);
}

function fail(res: any, error: unknown, fallback = "Erro interno") {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  return res.status(500).json({ status: false, message, data: null });
}

/**
 * GET /api/unidades/disponiveis
 */
router.get("/disponiveis", async (req, res) => {
  Console({ type: "log", message: "GET /api/unidades/disponiveis" });
  try {
    const data = await unidadeController.buscarDisponiveis();
    return ok(res, { status: true, message: "Unidades disponíveis.", data });
  } catch (error) {
    return fail(res, error, "Erro ao buscar unidades disponíveis");
  }
});

/**
 * GET /api/unidades/status/:status
 */
router.get("/status/:status", async (req, res) => {
  Console({ type: "log", message: `GET /api/unidades/status/${req.params.status}` });
  try {
    const status = Number(req.params.status);
    if (Number.isNaN(status)) {
      return res.status(400).json({
        status: false,
        message: "Parâmetro 'status' inválido (use número).",
        data: null,
      });
    }

    const data = await unidadeController.buscarPorStatus(status);
    return ok(res, { status: true, message: "Unidades por status.", data });
  } catch (error) {
    return fail(res, error, "Erro ao buscar unidades por status");
  }
});

/**
 * GET /api/unidades/obra/:cod_obr
 */
router.get("/obra/:cod_obr", async (req, res) => {
  Console({ type: "log", message: `GET /api/unidades/obra/${req.params.cod_obr}` });
  try {
    const cod_obr = String(req.params.cod_obr || "").trim();
    if (!cod_obr) {
      return res.status(400).json({
        status: false,
        message: "Parâmetro 'cod_obr' é obrigatório.",
        data: null,
      });
    }

    const data = await unidadeController.buscarPorObra(cod_obr);
    return ok(res, { status: true, message: "Unidades por obra.", data });
  } catch (error) {
    return fail(res, error, "Erro ao buscar unidades por obra");
  }
});

/**
 * POST /api/unidades
 * body: ApiUauUnidadeResponse
 * (upsert por identificador via controller)
 */
router.post("/", async (req, res) => {
  Console({ type: "log", message: "POST /api/unidades" });
  try {
    const payload = req.body;
    const data = await unidadeController.cadastrar(payload);

    if (!data) {
      return res.status(400).json({
        status: false,
        message: "Não foi possível cadastrar/atualizar: Identificador_unid ausente ou payload inválido.",
        data: null,
      });
    }

    return ok(res, { status: true, message: "Unidade cadastrada/atualizada.", data });
  } catch (error) {
    return fail(res, error, "Erro ao cadastrar/atualizar unidade");
  }
});

/**
 * POST /api/unidades/lote
 * body: ApiUauUnidadeResponse[]
 * (bulk upsert)
 */
router.post("/lote", async (req, res) => {
  Console({ type: "log", message: "POST /api/unidades/lote" });
  try {
    const payloads = req.body;

    if (!Array.isArray(payloads)) {
      return res.status(400).json({
        status: false,
        message: "Payload deve ser um array de unidades (ApiUauUnidadeResponse[]).",
        data: null,
      });
    }

    const data = await unidadeController.cadastrarEmLote(payloads);

    if (!data) {
      return ok(res, {
        status: false,
        message: "Falha ao processar lote de unidades.",
        data: null,
      });
    }

    return ok(res, {
      status: true,
      message: `Lote processado. Total retornado: ${data.length}.`,
      data,
    });
  } catch (error) {
    return fail(res, error, "Erro ao cadastrar/atualizar unidades em lote");
  }
});

/**
 * PATCH /api/unidades/:identificador/fotos
 * body: { fotos: string[] }
 */
router.patch("/:identificador/fotos", async (req, res) => {
  Console({
    type: "log",
    message: `PATCH /api/unidades/${req.params.identificador}/fotos`,
  });

  try {
    const identificador = String(req.params.identificador || "").trim();
    const fotos = req.body?.fotos;

    if (!identificador) {
      return res.status(400).json({
        status: false,
        message: "Parâmetro 'identificador' é obrigatório.",
        data: null,
      });
    }

    if (!Array.isArray(fotos) || fotos.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Body inválido. Envie { fotos: string[] } com pelo menos 1 item.",
        data: null,
      });
    }

    const data = await unidadeController.adicionarFotos(identificador, fotos);

    if (!data) {
      return res.status(404).json({
        status: false,
        message: "Unidade não encontrada ou nada para atualizar.",
        data: null,
      });
    }

    return ok(res, { status: true, message: "Fotos adicionadas com sucesso.", data });
  } catch (error) {
    return fail(res, error, "Erro ao adicionar fotos na unidade");
  }
});

const unidadeRoutes = router;
export default unidadeRoutes;
