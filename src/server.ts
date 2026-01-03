import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import { configDotenv } from "dotenv";

import DbConnection from "./lib/DbConnection";
import routes from "./routes/routes";

import Atendimento, { AtendimentoType, AtendimentoTipo } from "./models/Atendimento";
import Mensagem, { MensagemTypes } from "./models/Mensagem";
import Usuario from "./models/Usuario"; // ajuste o path se estiver diferente
import { BuscarClientesUau } from "./workers/uauWorker";

configDotenv();

async function Main() {
  try {
    const app = express();
    const PORT = process.env.PORT!

    app.use(cors({ origin: "*" }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    await DbConnection();
    app.use("/api", routes);
    // await BuscarClientesUau()
    app.listen(Number(PORT), () => console.log("Server started on port " + PORT));
  } catch (error) {
    console.error(error);
  }
}

Main().catch(console.error);
