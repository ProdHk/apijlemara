// src/routes/usuario.routes.ts
import { Router } from "express";
import Console, { ConsoleData } from "../lib/Console";
import UsuarioController from "../controllers/usuario.controller";

const router = Router();
const usuarioController = UsuarioController; // seu controller exporta "new UsuarioController()"

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
 * POST /api/usuarios/auth
 * body: { email, senha }
 */
router.post("/auth", async (req, res) => {
  Console({ type: "log", message: "POST /api/usuarios/auth" });
  try {
    const { email, senha } = req.body || {};
    const result = await usuarioController.authenticate({ email, senha });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao autenticar usuário");
  }
});

/**
 * GET /api/usuarios/ativos
 */
router.get("/ativos", async (req, res) => {
  Console({ type: "log", message: "GET /api/usuarios/ativos" });
  try {
    const result = await usuarioController.buscarAtivos();
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao buscar usuários ativos");
  }
});

/**
 * GET /api/usuarios/email/:email
 */
router.get("/email/:email", async (req, res) => {
  Console({ type: "log", message: `GET /api/usuarios/email/${req.params.email}` });
  try {
    const { email } = req.params;
    const result = await usuarioController.buscarPorEmail({ email: String(email) });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao buscar usuário por e-mail");
  }
});

/**
 * GET /api/usuarios/:id
 */
router.get("/:id", async (req, res) => {
  Console({ type: "log", message: `GET /api/usuarios/${req.params.id}` });
  try {
    const { id } = req.params;
    const result = await usuarioController.buscarPorId({ userId: String(id) });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao buscar usuário por id");
  }
});

/**
 * POST /api/usuarios
 * body: UsuarioType
 * (upsert por email)
 */
router.post("/", async (req, res) => {
  Console({ type: "log", message: "POST /api/usuarios" });
  try {
    const payload = req.body || {};
    const result = await usuarioController.cadastrar(payload);
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao cadastrar usuário");
  }
});

/**
 * PATCH /api/usuarios/:id
 * body: { name: keyof UsuarioType, value: any }
 * (campos proibidos já são bloqueados no controller)
 */
router.patch("/:id", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/usuarios/${req.params.id}` });
  try {
    const { id } = req.params;
    const { name, value } = req.body || {};
    const result = await usuarioController.editar({
      userId: String(id),
      name,
      value,
    });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao editar usuário");
  }
});

/**
 * PATCH /api/usuarios/:id/senha
 * body: { newPassword: string }
 */
router.patch("/:id/senha", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/usuarios/${req.params.id}/senha` });
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    const result = await usuarioController.editarSenha({
      userId: String(id),
      newPassword,
    });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao atualizar senha");
  }
});

/**
 * PATCH /api/usuarios/:id/roles
 * body: { roles: UsuarioRole[] }
 */
router.patch("/:id/roles", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/usuarios/${req.params.id}/roles` });
  try {
    const { id } = req.params;
    const { roles } = req.body || {};
    const result = await usuarioController.atualizarRoles({
      userId: String(id),
      roles,
    });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao atualizar roles");
  }
});

/**
 * PATCH /api/usuarios/:id/status
 * body: { status: boolean }
 */
router.patch("/:id/status", async (req, res) => {
  Console({ type: "log", message: `PATCH /api/usuarios/${req.params.id}/status` });
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const result = await usuarioController.mudarStatus({
      userId: String(id),
      status: Boolean(status),
    });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao alterar status do usuário");
  }
});

/**
 * GET /api/usuarios/:id/pendencias
 */
router.get("/:id/pendencias", async (req, res) => {
  Console({ type: "log", message: `GET /api/usuarios/${req.params.id}/pendencias` });
  try {
    const { id } = req.params;
    const result = await usuarioController.buscarPendencias(String(id));
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao buscar pendências");
  }
});

/**
 * POST /api/usuarios/:id/pendencias
 * body: PendenciaUsuarioType
 */
router.post("/:id/pendencias", async (req, res) => {
  Console({ type: "log", message: `POST /api/usuarios/${req.params.id}/pendencias` });
  try {
    const { id } = req.params;
    const pendencia = req.body || {};
    const result = await usuarioController.cadastrarPendencia(String(id), pendencia);
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao cadastrar pendência");
  }
});

/**
 * PATCH /api/usuarios/:id/pendencias/:ref
 * body: { status?: PendenciaStatus, observacao?: string }
 */
router.patch("/:id/pendencias/:ref", async (req, res) => {
  Console({
    type: "log",
    message: `PATCH /api/usuarios/${req.params.id}/pendencias/${req.params.ref}`,
  });
  try {
    const { id, ref } = req.params;
    const { status, observacao } = req.body || {};
    const result = await usuarioController.editarPendencia({
      userId: String(id),
      ref: String(ref),
      status,
      observacao,
    });
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao editar pendência");
  }
});

/**
 * DELETE /api/usuarios/:id/pendencias/:ref
 */
router.delete("/:id/pendencias/:ref", async (req, res) => {
  Console({
    type: "log",
    message: `DELETE /api/usuarios/${req.params.id}/pendencias/${req.params.ref}`,
  });
  try {
    const { id, ref } = req.params;
    const result = await usuarioController.removerPendencia(String(id), String(ref));
    return ok(res, result);
  } catch (error) {
    return fail(res, error, "Erro ao remover pendência");
  }
});

const usuarioRoutes = router;
export default usuarioRoutes;
