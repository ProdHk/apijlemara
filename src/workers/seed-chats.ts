// src/scripts/seed-chats.ts
// ETL/Seeder para popular Atendimentos + Mensagens com contexto realista
// Uso sugerido (exemplo):
//   node dist/scripts/seed-chats.js
// ou com ts-node:
//   npx ts-node src/scripts/seed-chats.ts

import mongoose, { Types } from "mongoose";
import AtendimentoController from "../controllers/atendimento.controller";
import MensagemModel, { MensagemTipo, MensagemMainStatus, MensagemDirection } from "../models/Mensagem";
import Atendimento from "../models/Atendimento";
import Console, { ConsoleData } from "../lib/Console";
import { configDotenv } from "dotenv";
configDotenv();
/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function now() {
  return new Date();
}

function minutesAgo(min: number) {
  return new Date(Date.now() - min * 60_000);
}

function digits(v: string) {
  return String(v).replace(/\D+/g, "");
}

function randPick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqWamid(seed: string) {
  // wamid precisa ser único por schema (unique: true)
  return `wamid.SEED_${seed}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function statusChain(direction: MensagemDirection): MensagemMainStatus[] {
  // inbound geralmente RECEIVED; outbound pode ir SENT -> DELIVERED -> READ
  if (direction === "INBOUND") return ["RECEIVED"];
  return ["SENT", "DELIVERED", "READ"];
}

function buildTextMessage(params: {
  atendimentoId: Types.ObjectId;
  direction: MensagemDirection;
  phoneNumberId: string;
  wabaId: string;
  fromOrTo: string; // cliente
  body: string;
  ts: Date;
}) {
  const isOutbound = params.direction === "OUTBOUND";
  const wamid = uniqWamid(params.atendimentoId.toString().slice(-6));

  return {
    atendimentoId: params.atendimentoId,
    wamid,
    messageId: wamid,
    conversationId: null,
    bizOpaqueCallbackData: null,

    direction: params.direction,
    status: isOutbound ? "SENT" : "RECEIVED",
    type: "text" as MensagemTipo,

    to: isOutbound ? digits(params.fromOrTo) : undefined,
    from: !isOutbound ? digits(params.fromOrTo) : undefined,

    phoneNumberId: params.phoneNumberId,
    wabaId: params.wabaId,

    text: { body: params.body, preview_url: true },

    media: {},
    interactive: {},
    template: { components: [] },
    context: {},
    location: {},
    contacts: [],
    reaction: {},
    errors: [],

    statuses: statusChain(params.direction).map((s, i) => ({
      status: s,
      timestamp: new Date(params.ts.getTime() + i * 20_000),
      raw: { seed: true },
    })),

    metaTimestamp: params.ts,
    raw: { seed: true },

    createdAt: params.ts,
    updatedAt: params.ts,
  };
}

/* -------------------------------------------------------------------------- */
/*  Cenários (contexto realista)                                               */
/* -------------------------------------------------------------------------- */

type Scenario = {
  tipo: "cobranca" | "venda" | "compra" | "lembrete" | "outro";
  observacao?: string;
  script: Array<{ dir: MensagemDirection; text: string }>;
};

const SCENARIOS: Scenario[] = [
  {
    tipo: "cobranca",
    observacao: "Negociação de atraso + envio de 2ª via e proposta de desconto.",
    script: [
      { dir: "INBOUND", text: "Oi! Estou com parcelas em atraso. Dá pra negociar?" },
      { dir: "OUTBOUND", text: "Olá! Consigo sim 😊 Me confirma CPF ou número do contrato?" },
      { dir: "INBOUND", text: "Contrato 31311129. Quero saber quanto fica pra regularizar." },
      { dir: "OUTBOUND", text: "Perfeito. Vou simular as opções e te envio já já." },
      { dir: "OUTBOUND", text: "Opção 1: entrada + parcelamento. Opção 2: quitação com desconto. Qual prefere?" },
      { dir: "INBOUND", text: "Prefiro quitação com desconto. Pode mandar o valor?" },
      { dir: "OUTBOUND", text: "Fechado. Vou gerar o boleto e te mando o link/2ª via assim que emitir." },
    ],
  },
  {
    tipo: "venda",
    observacao: "Lead de lote: dúvidas sobre bairro, infraestrutura e condições.",
    script: [
      { dir: "INBOUND", text: "Olá! Vi um lote no Estrela do Sul. Tem água e luz?" },
      { dir: "OUTBOUND", text: "Olá! Tem sim 😊 Água COPASA e luz CEMIG nas áreas atendidas. Quer metragem/quadra?" },
      { dir: "INBOUND", text: "Queria algo com rua asfaltada. Vocês têm?" },
      { dir: "OUTBOUND", text: "Temos opções com rua asfaltada e outras em rua terra. Posso te enviar 2 sugestões." },
      { dir: "INBOUND", text: "Pode mandar valores à vista e financiado?" },
      { dir: "OUTBOUND", text: "Claro. Me diz a faixa de investimento e se prefere entrada menor ou parcela menor." },
    ],
  },
  {
    tipo: "compra",
    observacao: "Compra/Escritura: envio de documentos e orientações de pagamento.",
    script: [
      { dir: "INBOUND", text: "Bom dia! Já assinei a escritura. Como faço o pagamento agora?" },
      { dir: "OUTBOUND", text: "Bom dia! ✅ Vou te orientar. Assim que pagar, me envia o comprovante por gentileza." },
      { dir: "INBOUND", text: "Posso pagar hoje à tarde. Envio aqui no WhatsApp." },
      { dir: "OUTBOUND", text: "Perfeito. Assim que receber, encaminho para o setor responsável finalizar o processo." },
    ],
  },
  {
    tipo: "lembrete",
    observacao: "Lembrete amigável de vencimento + confirmação de recebimento.",
    script: [
      { dir: "OUTBOUND", text: "Oi! Passando pra lembrar do vencimento de hoje 😊 Posso te mandar a 2ª via?" },
      { dir: "INBOUND", text: "Pode sim, por favor." },
      { dir: "OUTBOUND", text: "Claro! Já estou gerando e te envio em seguida." },
      { dir: "OUTBOUND", text: "Enviei ✅ Qualquer dúvida estou por aqui." },
    ],
  },
  {
    tipo: "outro",
    observacao: "Atendimento geral: dúvidas de contrato e situação atual.",
    script: [
      { dir: "INBOUND", text: "Olá! Estou com dúvida sobre meu contrato." },
      { dir: "OUTBOUND", text: "Olá! Tudo bem? Vou te ajudar. Qual a sua dúvida?" },
      { dir: "INBOUND", text: "Quero entender os valores e a situação atual." },
      { dir: "OUTBOUND", text: "Perfeito. Vou verificar no sistema e já te retorno." },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Seeder                                                                     */
/* -------------------------------------------------------------------------- */

export async function seedChats(params?: {
  mongoUri: string;
  totalAtendimentos?: number; // quantos atendimentos criar
  mensagensPorAtendimento?: { min: number; max: number };
  clearBefore?: boolean; // limpar seed anterior (opcional)
}) {
  const mongoUri = process.env.MONGODB_URI!;
  if (!mongoUri) throw new Error("MONGODB_URI/MONGO_URI não definido.");

  const totalAtendimentos = params?.totalAtendimentos ?? 12;
  const range = params?.mensagensPorAtendimento ?? { min: 6, max: 18 };

  // IDs meta (mock)
  const phoneNumberId = "MOCK_PHONE_NUMBER_ID";
  const wabaId = "MOCK_WABA_ID";

  await mongoose.connect(mongoUri);
  Console({ type: "success", message: "Mongo conectado (seed-chats)." });

  try {
    if (params?.clearBefore) {
      // limpa apenas seeds (pela marca raw.seed)
      await MensagemModel.deleteMany({ "raw.seed": true });
      // limpa atendimentos que ficaram sem histórico/seed (opcional: aqui é agressivo, então fazemos leve)
      // Se você quiser, pode apagar atendimentos sem mensagens:
      // await Atendimento.deleteMany({ mensagens: { $size: 0 } });
      Console({ type: "log", message: "Seeds anteriores removidos (Mensagens raw.seed=true)." });
    }

    const atendimentoCtrl = new AtendimentoController();

    const createdAtendimentos: any[] = [];

    for (let i = 0; i < totalAtendimentos; i++) {
      const scenario = randPick(SCENARIOS);

      // telefone cliente fictício (Brasil)
      const clientePhone = digits(`55 31 9${randInt(1000, 9999)}${randInt(1000, 9999)}`);

      // dados cliente
      const clienteId = `CLI_${randInt(10000, 99999)}`;
      const clienteNome = randPick([
        "Ana Paula",
        "Bruno Souza",
        "Carla Mendes",
        "Diego Rocha",
        "Elisete Santos",
        "Felipe Lima",
        "Gisele Andrade",
        "Hugo Ferreira",
        "Ivana Costa",
        "João Pedro",
      ]);

      // garante atendimento sem duplicidade
      const at = await atendimentoCtrl.ensure({
        numeroWhatsapp: clientePhone,
        tipo: scenario.tipo,
        atendente: null,
        clienteId,
        clienteNome,
        clienteRef: null,
        observacao: scenario.observacao,
      });

      if (!at?._id) continue;

      const atendimentoId = new Types.ObjectId(String(at._id));

      // monta um roteiro (pega o cenário e pode estender)
      const baseScript = scenario.script.slice();
      const desiredCount = randInt(range.min, range.max);

      // estende com variações simples
      const fillersInbound = [
        "Entendi.",
        "Pode sim.",
        "Obrigado!",
        "Qual o prazo?",
        "Tem desconto mesmo?",
        "Posso pagar via Pix?",
      ];
      const fillersOutbound = [
        "Certo! Vou verificar 😊",
        "Te mando em seguida ✅",
        "Perfeito, só um instante.",
        "Vou gerar e já retorno.",
        "Consegue confirmar seu CPF, por favor?",
      ];

      while (baseScript.length < desiredCount) {
        const lastDir = baseScript[baseScript.length - 1]?.dir ?? "INBOUND";
        const nextDir: MensagemDirection = lastDir === "INBOUND" ? "OUTBOUND" : "INBOUND";
        baseScript.push({
          dir: nextDir,
          text: nextDir === "INBOUND" ? randPick(fillersInbound) : randPick(fillersOutbound),
        });
      }

      // timestamps escalonados (conversa “real”)
      // começa entre 1h e 7 dias atrás
      let cursor = minutesAgo(randInt(60, 60 * 24 * 7));

      // cria mensagens no banco + anexa no atendimento
      for (let j = 0; j < baseScript.length; j++) {
        cursor = new Date(cursor.getTime() + randInt(1, 8) * 60_000); // +1..8min

        const item = baseScript[j];
        const doc = buildTextMessage({
          atendimentoId,
          direction: item.dir,
          phoneNumberId,
          wabaId,
          fromOrTo: clientePhone,
          body: item.text,
          ts: cursor,
        });

        const created = await MensagemModel.create(doc);

        // anexa no atendimento + atualiza métricas/status
        await atendimentoCtrl.anexarMensagem({
          atendimentoId: String(atendimentoId),
          mensagemId: String(created._id),
          meta: {
            direction: item.dir,
            ts: cursor,
            actor: item.dir === "OUTBOUND" ? "atendente-seed" : "cliente-seed",
          },
        });
      }

      // atualiza observação e dataAtualizacao final do atendimento (opcional)
      await Atendimento.findByIdAndUpdate(atendimentoId, {
        $set: { dataAtualizacao: cursor },
      });

      createdAtendimentos.push({ ...at, _id: String(at._id) });
    }

    Console({
      type: "success",
      message: `Seed concluído. Atendimentos criados/atualizados: ${createdAtendimentos.length}`,
    });

    return {
      status: true,
      message: "Seed concluído.",
      data: { totalAtendimentos: createdAtendimentos.length, atendimentos: createdAtendimentos },
    };
  } catch (error) {
    Console({ type: "error", message: "Erro no seed-chats." });
    ConsoleData({ type: "error", data: error });
    return { status: false, message: "Erro no seed-chats.", data: null };
  } finally {
    await mongoose.disconnect();
    Console({ type: "log", message: "Mongo desconectado (seed-chats)." });
  }
}

/* -------------------------------------------------------------------------- */
/*  Execução direta                                                            */
/* -------------------------------------------------------------------------- */

if (require.main === module) {
  seedChats({
    mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || "",
    totalAtendimentos: Number(process.env.SEED_ATENDIMENTOS || 12),
    mensagensPorAtendimento: {
      min: Number(process.env.SEED_MSG_MIN || 6),
      max: Number(process.env.SEED_MSG_MAX || 18),
    },
    clearBefore: String(process.env.SEED_CLEAR || "").toLowerCase() === "true",
  })
    .then((r) => {
      if (!r.status) process.exitCode = 1;
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exitCode = 1;
    });
}
