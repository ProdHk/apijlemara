import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import { configDotenv } from "dotenv";

import DbConnection from "./lib/DbConnection";
import routes from "./routes/routes";

import Atendimento, { AtendimentoType, AtendimentoTipo } from "./models/Atendimento";
import Mensagem, { MensagemTypes } from "./models/Mensagem";
import Usuario from "./models/Usuario"; // ajuste o path se estiver diferente

configDotenv();

/* -------------------------------------------------------------------------- */
/*  Seed helpers                                                              */
/* -------------------------------------------------------------------------- */

function envBool(name: string, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function digits(v: string) {
  return String(v || "").replace(/\D+/g, "");
}

function nowMinusMinutes(mins: number) {
  return new Date(Date.now() - mins * 60_000);
}

function makeWamid() {
  // garante único o suficiente pro seed
  // ex: wamid.MOCK_1700000000000_ab12cd
  return `wamid.MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedAtendimentosEMensagens() {
  const SEED_RESET = envBool("SEED_RESET", false);

  if (SEED_RESET) {
    await Promise.all([
      Atendimento.deleteMany({}),
      Mensagem.deleteMany({}),
      // Usuario.deleteMany({}), // opcional: se quiser resetar usuários também
    ]);
    console.log("[seed] Reset collections: Atendimento, Mensagem");
  }

  // 1) Garante alguns usuários (atendentes)
  // Se seu projeto já tem usuários, você pode pular essa parte.
  const atendentesBase = [
    { nome: "Claudia", email: "claudia@mock.local", telefone: "5531991111111", roles: ["ATENDENTE"] },
    { nome: "Jessica", email: "jessica@mock.local", telefone: "5531992222222", roles: ["ATENDENTE"] },
    { nome: "Franklin", email: "franklin@mock.local", telefone: "5531993333333", roles: ["SUPERVISOR"] },
  ];

  const atendentesIds: string[] = [];
  for (const u of atendentesBase) {
    const exists = await Usuario.findOne({ email: u.email }).lean();
    if (exists?._id) {
      atendentesIds.push(String(exists._id));
      continue;
    }
    const created = await Usuario.create({
      nome: u.nome,
      email: u.email,
      senha: "1234", // seed
      telefone: digits(u.telefone),
      roles: u.roles,
      empresa: "JLEMARA",
      instancia: "default",
      ativo: true,
      dataCadastro: new Date(),
      dataEdicao: new Date(),
      dataUltimoAcesso: new Date(),
    } as any);

    atendentesIds.push(String(created._id));
  }

  console.log(`[seed] Atendentes prontos: ${atendentesIds.length}`);

  // 2) Cria atendimentos mock
  // Importante: seu controller ensure usa (numeroWhatsapp + tipo + status ativo) para não duplicar.
  // Aqui vamos criar clientes diferentes e tipos variados.
  const clientes = [
    { clienteId: "C001", clienteNome: "Ana Luiza", clienteRef: "UAU-1001", numeroWhatsapp: "5531996949766" },
    { clienteId: "C002", clienteNome: "Paulo Veríssimo", clienteRef: "UAU-1002", numeroWhatsapp: "5531988887777" },
    { clienteId: "C003", clienteNome: "Douglas Santos", clienteRef: "UAU-1003", numeroWhatsapp: "5531977776666" },
    { clienteId: "C004", clienteNome: "Renata Oliveira", clienteRef: "UAU-1004", numeroWhatsapp: "5531966665555" },
    { clienteId: "C005", clienteNome: "Claudinei Nunes", clienteRef: "UAU-1005", numeroWhatsapp: "5531955554444" },
    { clienteId: "C006", clienteNome: "Antonio Carlos", clienteRef: "UAU-1006", numeroWhatsapp: "5531944443333" },
  ];

  const tipos: AtendimentoTipo[] = ["cobranca", "venda", "outro", "lembrete"];
  const statuses: AtendimentoType["status"][] = [
    "aberto",
    "aguardando-atendente",
    "aguardando-cliente",
  ];

  const createdAtendimentos: any[] = [];

  for (const c of clientes) {
    // 1 ou 2 atendimentos por cliente (tipos diferentes)
    const count = Math.random() > 0.6 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const tipo = choice(tipos);
      const atendente = Math.random() > 0.2 ? choice(atendentesIds) : null;
      const status = choice(statuses);

      // idempotência simples: se já existir atendimento com mesmo clienteId+tipo e ativo, reaproveita
      const exists = await Atendimento.findOne({
        clienteId: c.clienteId,
        tipo,
        status: { $in: ["aberto", "aguardando-cliente", "aguardando-atendente"] },
      }).lean();

      if (exists?._id) {
        createdAtendimentos.push(exists);
        continue;
      }

      const inicio = nowMinusMinutes(60 * (i + 1) + Math.floor(Math.random() * 120));

      const at = await Atendimento.create({
        atendente: atendente ? new (require("mongoose").Types.ObjectId)(atendente) : null,
        status,
        tipo,
        dataInicio: inicio,
        dataAtualizacao: inicio,
        dataFim: null,
        observacao: `Atendimento mock para validação de chat (${tipo}).`,
        mensagens: [],
        anexos: [],
        historico: [
          {
            title: "Atendimento criado",
            content: "Criado via seed para validar a tela de chats.",
            date: inicio,
            user: "system",
          },
        ],
        numeroWhatsapp: digits(c.numeroWhatsapp),
        clienteId: c.clienteId,
        clienteNome: c.clienteNome,
        clienteRef: c.clienteRef,
        dataPrimeiraRespostaAtendente: null,
        dataUltimaMensagemCliente: null,
        dataUltimaMensagemAtendente: null,
        resultadoContato: null,
      } satisfies AtendimentoType);

      createdAtendimentos.push(at.toObject());
    }
  }

  console.log(`[seed] Atendimentos prontos: ${createdAtendimentos.length}`);

  // 3) Cria mensagens para cada atendimento e vincula
  for (const at of createdAtendimentos) {
    const atendimentoId = String(at._id);
    const numeroCliente = String(at.numeroWhatsapp || "");

    // se já tem mensagens, não duplica
    const hasMsg = await Mensagem.findOne({ atendimentoId }).lean();
    if (hasMsg?._id) continue;

    const baseMinutesAgo = Math.floor(Math.random() * 90) + 20;

    const script = [
      { dir: "INBOUND" as const, text: "Olá! Estou com dúvida sobre meu contrato." },
      { dir: "OUTBOUND" as const, text: "Olá! Tudo bem? Vou te ajudar. Qual a sua dúvida?" },
      { dir: "INBOUND" as const, text: "Quero entender os valores e a situação atual." },
      { dir: "OUTBOUND" as const, text: "Perfeito. Vou verificar no sistema e já te retorno." },
    ];

    const msgIds: any[] = [];
    let lastCliente: Date | null = null;
    let lastAtendente: Date | null = null;
    let firstResposta: Date | null = null;

    for (let i = 0; i < script.length; i++) {
      const step = script[i];
      const createdAt = nowMinusMinutes(baseMinutesAgo - i * 3);

      const doc: Partial<MensagemTypes> = {
        atendimentoId,
        wamid: makeWamid(),
        messageId: undefined,
        conversationId: null,
        bizOpaqueCallbackData: null,

        direction: step.dir,
        status: step.dir === "INBOUND" ? "RECEIVED" : "SENT",
        type: "text",

        from: step.dir === "INBOUND" ? numeroCliente : undefined,
        to: step.dir === "OUTBOUND" ? numeroCliente : undefined,

        phoneNumberId: "MOCK_PHONE_NUMBER_ID",
        wabaId: "MOCK_WABA_ID",

        text: { body: step.text, preview_url: true },

        statuses: [
          {
            status: step.dir === "INBOUND" ? "RECEIVED" : "SENT",
            timestamp: createdAt,
            raw: { seed: true },
          },
        ],

        metaTimestamp: createdAt,
        raw: { seed: true },
        createdAt,
        updatedAt: createdAt,
      };

      const saved = await Mensagem.create(doc);
      msgIds.push(saved._id);

      if (step.dir === "INBOUND") {
        lastCliente = createdAt;
      } else {
        lastAtendente = createdAt;
        if (!firstResposta) firstResposta = createdAt;
      }
    }

    // Atualiza atendimento com mensagens e métricas (sem depender de MetaAPI)
    await Atendimento.findByIdAndUpdate(atendimentoId, {
      $set: {
        mensagens: msgIds,
        dataAtualizacao: lastAtendente || lastCliente || new Date(),
        dataUltimaMensagemCliente: lastCliente,
        dataUltimaMensagemAtendente: lastAtendente,
        dataPrimeiraRespostaAtendente: firstResposta,
        // status coerente com última direção (se última foi OUTBOUND => aguardando-cliente)
        status: lastAtendente && (!lastCliente || lastAtendente > lastCliente)
          ? "aguardando-cliente"
          : "aguardando-atendente",
      },
      $push: {
        historico: {
          title: "Seed mensagens",
          content: `Mensagens mock vinculadas (${msgIds.length}).`,
          date: new Date(),
          user: "system",
        },
      },
    });

    console.log(`[seed] Mensagens criadas p/ atendimento ${atendimentoId}: ${msgIds.length}`);
  }

  console.log("[seed] OK ✅ Banco populado com atendimentos e mensagens mock.");
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                      */
/* -------------------------------------------------------------------------- */

async function Main() {
  try {
    const app = express();
    const PORT = process.env.PORT!

    app.use(cors({ origin: "*" }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    await DbConnection();

    // ✅ Seed controlado por ENV
    const SEED_DB = envBool("SEED_DB", false);
    if (SEED_DB) {
      await seedAtendimentosEMensagens();
    } else {
      console.log("[seed] SEED_DB=false (não executado)");
    }

    app.use("/api", routes);

    app.listen(Number(PORT), () => console.log("Server started on port " + PORT));
  } catch (error) {
    console.error(error);
  }
}

Main().catch(console.error);
