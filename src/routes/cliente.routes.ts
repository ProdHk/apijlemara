import ClienteController from "../controllers/cliente.controller";
import { Router } from "express";
import Console from "../lib/Console";

const router = Router()
const clienteController = new ClienteController()
/* BUSCAR CLIENTES */
router.get("/", async (req, res) => {
  Console({ type: "log", message: `GET /api/clientes` });
  try {
    const clientes = await clienteController.listarTodos()
    return res.status(200).json(clientes)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar os clientes";
    Console({ type: "error", message });
    return res.status(500).json({ message });
  }
});

/* BUSCAR CLIENTE POR CODIGO ERP */
router.get("/codErp", async (req, res) => {
  Console({ type: "log", message: `GET /api/clientes/codErp` });
  try {
    const { codPes } = req.body
    const cliente = await clienteController.buscarPorCodErp(Number(codPes))
    return res.status(200).json(cliente)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar o cliente";
    Console({ type: "error", message });
    return res.status(500).json({ message });
  }
});



const clienteRoutes = router
export default clienteRoutes
