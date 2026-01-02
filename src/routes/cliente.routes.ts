// routes.routes.ts
import { Request, Response, Router } from "express";
import Console from "../lib/Console";
import ClienteController from "../controllers/cliente.controller";

const router = Router();
const controller = new ClienteController();

/**
 * Helper: evita perder o `this` e padroniza log.
 * (sem “complexidade”: é só um wrapper mínimo)
 */
function bindGet(path: string, handler: any) {
  router.get(path, handler.bind(controller));
  Console({ type: "log", message: `ROUTE GET  ${path}` });
}

function bindPost(path: string, handler: any) {
  router.post(path, handler.bind(controller));
  Console({ type: "log", message: `ROUTE POST ${path}` });
}

function bindPatch(path: string, handler: any) {
  router.patch(path, handler.bind(controller));
  Console({ type: "log", message: `ROUTE PATCH ${path}` });
}

/* -------------------------------------------------------------------------- */
/* LIST / BUSCAS (HTTP)                                                       */
/* -------------------------------------------------------------------------- */
/**
 * LISTA paginada (rápida) com filtros e sort
 * GET ?page&limit&q&tab&onlyHasWhatsapp&hideLgpdBlocked&sortKey&sortDir
 */
bindGet("/", controller.buscarClientes);

/**
 * Detalhe por ID
 * GET /:id
 */
bindGet("/:id", controller.buscarClienteId);

/**
 * Detalhe por cod_pes (ERP)
 * GET /cod/:cod
 */
bindGet("/cod/:cod", controller.buscarClienteCodErp);

/* -------------------------------------------------------------------------- */
/* SINCRONIZAÇÃO ERP (HTTP)                                                   */
/* -------------------------------------------------------------------------- */
/**
 * Sincronizar 1 cliente (payload do ERP)
 * POST /sync
 * body: { ...cliente }
 */
bindPost("/sync", async (req: Request, res: Response) => {
  // mantém controller “clean”: aqui só empacota e chama função interna
  const result = await controller.sincronizarErp(req.body);
  return res.status(result.status ? 200 : 400).json(result);
});

/**
 * Sincronizar lista de clientes (payload do ERP)
 * POST /sync-lista
 * body: [ {...cliente}, {...cliente} ]
 */
bindPost("/sync-lista", async (req: Request, res: Response) => {
  const result = await controller.sincronizarListaErp(req.body);
  return res.status(result.status ? 200 : 400).json(result);
});

/* -------------------------------------------------------------------------- */
/* CADASTRO/UPSERT (HTTP)                                                     */
/* -------------------------------------------------------------------------- */
/**
 * Upsert direto (caso você queira expor separado do sync)
 * POST
 * body: { ...cliente }
 */
bindPost("", async (req: Request, res: Response) => {
  const result = await controller.cadastrar(req.body);
  return res.status(result.status ? 200 : 400).json(result);
});

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                      */
/* -------------------------------------------------------------------------- */


bindPost('/whatsapp/atualizar', async (req: Request, res: Response) => controller.vincularWhatsapp(req, res));
export default router;
