// src/routes/routes.ts
import { Router } from "express";

import clienteRoutes from "./cliente.routes";
import usuarioRoutes from "./usuario.routes";
import unidadeRoutes from "./unidade.routes";

import metaWebhookRoutes from "./metawebhook.routes";
import mensagemRoutes from "./mensagem.routes";
import cloudinaryRoutes from "./cloudinary.routes";

import atendimentoRoutes from "./atendimento.routes";
import petRoutes from "./pet.routes";
import metaRoutes from "./meta.routes";
import disparoRoutes from "./disparo.routes";
import disparoItemRoutes from "./disparoItem.routes";

const routes = Router();

// domínio / cadastros
routes.use("/cliente", clienteRoutes);
routes.use("/usuario", usuarioRoutes);
routes.use("/unidade", unidadeRoutes);

// core whatsapp
routes.use("/metawebhook", metaWebhookRoutes);
routes.use("/mensagem", mensagemRoutes);
routes.use("/cloudinary", cloudinaryRoutes);

// core atendimento
routes.use("/atendimento", atendimentoRoutes);



// core programa de excelencia no trbalho
routes.use("/pet", petRoutes);


// meta
routes.use("/meta", metaRoutes);

routes.use("/disparos", disparoRoutes);
routes.use("/disparo-items", disparoItemRoutes);
export default routes;
