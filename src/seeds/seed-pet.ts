// src/seeds/seed-pet.ts
/**
 * Seed PET — popular MongoDB com itens “reais” (ideia/melhoria/resumo/curso/erro-interno)
 * + anexos (documento/interacao) com links públicos.
 *
 * Como usar no server.ts (depois de conectar no Mongo):
 *   import { seedPet } from "./seeds/seed-pet";
 *   await seedPet();
 *
 * Env úteis:
 *   PET_SEED_ENABLED=true            -> habilita seed
 *   PET_SEED_RESET=true              -> apaga coleção Pet antes de inserir
 *   PET_SEED_FORCE=true              -> insere mesmo se já houver dados
 *   PET_SEED_COUNT=48                -> quantidade aproximada de itens
 *   PET_SEED_USERS="id1,id2,id3"     -> lista de userIds reais (Usuario._id) para usar em responsavel
 */

import mongoose from "mongoose";
import Pet, { PetType, PetStatus, PetTipo, PetAnexo } from "../models/Pet";

type SeedOptions = {
  enabled?: boolean;
  reset?: boolean;
  force?: boolean;
  count?: number;
  users?: string[]; // ids reais de Usuario
};

function envBool(v?: string) {
  return String(v || "")
    .trim()
    .toLowerCase() === "true";
}


function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function isoDaysAgo(days: number) {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

function makeAnexoDocumento(responsavel: string, titulo: string, descricao: string, link: string): PetAnexo {
  return {
    tipo: "documento",
    titulo,
    descricao,
    responsavel,
    link,
  };
}

function makeAnexoInteracao(responsavel: string, titulo: string, descricao: string): PetAnexo {
  return {
    tipo: "interacao",
    titulo,
    descricao,
    responsavel,
  };
}

/**
 * Links públicos (estáveis e “reais”) — sem depender de scrape.
 * Se quiser, substitua por links internos (Drive/Notion) depois.
 */
const WEB_LINKS = {
  whatsappBusiness: "https://www.whatsapp.com/business/",
  metaBusiness: "https://www.facebook.com/business/",
  nodeDocs: "https://nodejs.org/en/docs",
  express: "https://expressjs.com/",
  mongoose: "https://mongoosejs.com/docs/guide.html",
  mongodbIndexes: "https://www.mongodb.com/docs/manual/indexes/",
  tailwind: "https://tailwindcss.com/docs",
  shadcn: "https://ui.shadcn.com/",
  nextAppRouter: "https://nextjs.org/docs/app",
  owaspTop10: "https://owasp.org/www-project-top-ten/",
  httpStatus: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status",
  webhooks: "https://developer.mozilla.org/en-US/docs/Web/API/Webhooks_API",
  cron: "https://en.wikipedia.org/wiki/Cron",
  retries: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/",
};

type Template = {
  tipo: PetTipo;
  titulo: string;
  subTitulo: string;
  descricao: string;
  conclusao: string;
  docLinks: Array<{ titulo: string; descricao: string; link: string }>;
  interacoes: Array<{ titulo: string; descricao: string }>;
};

const TEMPLATES: Template[] = [
  // IDEIA
  {
    tipo: "ideia",
    titulo: "Ranking de PET por impacto (Admin)",
    subTitulo: "Consolidar score e sinais de ação na home do admin",
    descricao:
      "Criar uma visão com ranking por usuário e por tipo, destacando itens para implantação, não pontuados e com maior volume de interações. Objetivo: orientar a tomada de decisão diária.",
    conclusao:
      "Aprovar o modelo de score e gerar relatórios exportáveis (CSV) para acompanhamento no BI.",
    docLinks: [
      { titulo: "Next.js App Router", descricao: "Estratégias de layout e data-fetching", link: WEB_LINKS.nextAppRouter },
      { titulo: "shadcn/ui", descricao: "Padrões de UI para cards e navegação", link: WEB_LINKS.shadcn },
    ],
    interacoes: [
      { titulo: "Discussão", descricao: "Definir pesos do score (implantação, pontuação, recência, anexos)." },
      { titulo: "Decisão", descricao: "Separar 3 modos: Quadro, Ranking, Por tipo." },
    ],
  },

  // MELHORIA
  {
    tipo: "melhoria",
    titulo: "Fila de implantação com checklist (PET)",
    subTitulo: "Padronizar execução e reduzir retrabalho",
    descricao:
      "Implementar uma fila de implantação com checklist por item (apto, responsáveis, concluído), histórico de alterações e anexos de evidência.",
    conclusao:
      "Após implantação, exigir evidência (doc/link) e fechar automaticamente com registro de conclusão.",
    docLinks: [
      { titulo: "MongoDB Indexes", descricao: "Indexar status/tipo/responsável para performance", link: WEB_LINKS.mongodbIndexes },
      { titulo: "Mongoose Guide", descricao: "Boas práticas de schema e subdocs", link: WEB_LINKS.mongoose },
    ],
    interacoes: [
      { titulo: "Ajuste", descricao: "Adicionar validação de payload no controller e padronizar erros." },
      { titulo: "Ação", descricao: "Criar endpoint dedicado /pet/fila?status=aguardando-implantacao." },
    ],
  },

  // RESUMO
  {
    tipo: "resumo",
    titulo: "Resumo: padrões de retry/backoff para integrações",
    subTitulo: "Evitar falhas intermitentes nas integrações externas",
    descricao:
      "Documentar padrões de timeouts, retries com jitter e circuit breaker para chamadas em APIs externas (ex.: ERP/UAU, provedores WhatsApp).",
    conclusao:
      "Aplicar padrão nas rotas críticas e registrar métricas de erro por endpoint.",
    docLinks: [
      { titulo: "Timeouts & Retries", descricao: "Backoff com jitter (artigo técnico)", link: WEB_LINKS.retries },
      { titulo: "HTTP Status", descricao: "Tratamento por categoria de status", link: WEB_LINKS.httpStatus },
    ],
    interacoes: [
      { titulo: "Observação", descricao: "Falhas 502/504 devem ativar backoff exponencial." },
      { titulo: "Padrão", descricao: "Registrar correlationId e tempo de resposta." },
    ],
  },

  // CURSO
  {
    tipo: "curso",
    titulo: "Microtreinamento: UI premium com tokens (Tailwind + shadcn)",
    subTitulo: "Ensinar padrões internos para telas administrativas",
    descricao:
      "Criar guia prático de UI/UX: grids, cards, hierarquia, tipografia, ações rápidas, estados vazios e acessibilidade. Manter tokens de marca (verde/laranja) e tema dark/light.",
    conclusao:
      "Padronizar componentes e acelerar entregas com consistência visual.",
    docLinks: [
      { titulo: "Tailwind CSS", descricao: "Boas práticas de layout e responsividade", link: WEB_LINKS.tailwind },
      { titulo: "shadcn/ui", descricao: "Componentes base e composição", link: WEB_LINKS.shadcn },
    ],
    interacoes: [
      { titulo: "Exercício", descricao: "Refatorar uma tela copiando apenas a disposição, não o design final." },
      { titulo: "Checklist", descricao: "Sempre ter: estado loading, empty state, erro e fallback." },
    ],
  },

  // ERRO INTERNO
  {
    tipo: "erro-interno",
    titulo: "Bug: loop infinito ao buscar dados no admin",
    subTitulo: "Dependências instáveis em hooks (useEffect/useCallback)",
    descricao:
      "Algumas telas entram em re-render contínuo por usar objetos inteiros como dependência (ex.: controller/hook retorna objeto novo a cada render).",
    conclusao:
      "Desestruturar funções do hook e usar somente referências estáveis nas deps. Evitar setState dentro de memoizações.",
    docLinks: [
      { titulo: "Express", descricao: "Padrões de controllers e responses", link: WEB_LINKS.express },
      { titulo: "Node.js Docs", descricao: "Boas práticas gerais", link: WEB_LINKS.nodeDocs },
    ],
    interacoes: [
      { titulo: "Correção", descricao: "Trocar deps: [pet] -> [buscarIdeias, buscarMelhorias,...]." },
      { titulo: "Ação", descricao: "Criar mocks locais para manter UI funcional sem seed." },
    ],
  },
];

function buildPetItem(opts: {
  responsavel: string;
  template: Template;
  status: PetStatus;
  pontuacao: number;
  createdAtISO?: string;
  updatedAtISO?: string;
  implantacao?: { apto?: boolean; concluido?: boolean; responsaveis?: string[] };
}) {
  const { responsavel, template, status, pontuacao } = opts;

  const anexos: PetAnexo[] = [
    ...template.docLinks.map((d) =>
      makeAnexoDocumento(responsavel, d.titulo, d.descricao, d.link)
    ),
    ...template.interacoes.map((i) => makeAnexoInteracao(responsavel, i.titulo, i.descricao)),
  ];

  // Em itens “reais”, é comum ter também uma interação do admin (outro usuário)
  // Se houver múltiplos usuários, escolhemos um “revisor” diferente
  // (o chamador pode empurrar mais anexos depois, via endpoint).
  return {
    responsavel,
    tipo: template.tipo,
    status,

    titulo: template.titulo,
    subTitulo: template.subTitulo,
    descricao: template.descricao,
    descricao2: "",
    conclusao: template.conclusao,

    anexos,

    pontuacao,

    petImplantacao: {
      apto: Boolean(opts.implantacao?.apto ?? (status === "aceito" || status === "aguardando-implantacao")),
      concluido: Boolean(opts.implantacao?.concluido ?? false),
      responsaveis: opts.implantacao?.responsaveis ?? (status === "aguardando-implantacao" ? [responsavel] : []),
    },

    // createdAt/updatedAt são gerenciados por timestamps do mongoose.
    // (se você quiser forçar datas, teria que inserir via collection direto ou desabilitar timestamps)
  } satisfies Omit<PetType, "_id">;
}

function defaultUsersFromEnv(): string[] {
  const raw = String(process.env.PET_SEED_USERS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fallbackUsers(): string[] {
  // Se não existir Usuario real, ainda dá pra inserir.
  // Depois você troca os responsaveis pra ids reais.
  return ["seed-user-claudia", "seed-user-jessica", "seed-user-franklin", "seed-user-rodrigo", "seed-user-adriana"];
}

function decideStatus(tipo: PetTipo) {
  // “Realista”: erros tendem a ir para aceito/implantação, cursos/resumos para publicado, ideias ficam em rascunho/aceito
  const roll = Math.random();

  if (tipo === "erro-interno") {
    if (roll < 0.40) return "aguardando-implantacao" as const;
    if (roll < 0.70) return "aceito" as const;
    if (roll < 0.90) return "publicado" as const;
    return "rascunho" as const;
  }

  if (tipo === "curso" || tipo === "resumo") {
    if (roll < 0.55) return "publicado" as const;
    if (roll < 0.80) return "aceito" as const;
    if (roll < 0.92) return "rascunho" as const;
    return "rejeitado" as const;
  }

  // ideia/melhoria
  if (roll < 0.30) return "rascunho" as const;
  if (roll < 0.60) return "aceito" as const;
  if (roll < 0.78) return "aguardando-implantacao" as const;
  if (roll < 0.92) return "publicado" as const;
  return "rejeitado" as const;
}

function decidePontuacao(status: PetStatus) {
  // “Realista”: não pontuados ainda existem, especialmente em rascunho/publicado
  if (status === "rascunho") return Math.random() < 0.65 ? 0 : Math.floor(Math.random() * 6) + 1;
  if (status === "publicado") return Math.random() < 0.45 ? 0 : Math.floor(Math.random() * 7) + 1;
  if (status === "rejeitado") return Math.floor(Math.random() * 6) + 1;
  if (status === "aceito") return Math.floor(Math.random() * 8) + 3;
  if (status === "aguardando-implantacao") return Math.floor(Math.random() * 10) + 6;
  return 0;
}

export async function seedPet(options: SeedOptions = {}) {
  const enabled = true


  const reset = options.reset ?? envBool(process.env.PET_SEED_RESET);
  const force = options.force ?? envBool(process.env.PET_SEED_FORCE);
  const count = 60

  const envUsers = options.users ?? defaultUsersFromEnv();
  const users = envUsers.length ? envUsers : fallbackUsers();

  if (reset) {
    await Pet.deleteMany({});
  } else if (!force) {
    const existing = await Pet.countDocuments({});
    if (existing > 0) {
      return { inserted: 0, skipped: true, reason: `já existem ${existing} itens (use PET_SEED_FORCE=true ou PET_SEED_RESET=true)` };
    }
  }

  // Gera itens variando tipos e status com densidade “real”
  const docs: Array<Omit<PetType, "_id">> = [];
  const daysWindow = 40;

  for (let i = 0; i < count; i++) {
    const template = pick(TEMPLATES);
    const responsavel = pick(users);

    const status = decideStatus(template.tipo);
    const pontuacao = decidePontuacao(status);

    const implantacao =
      status === "aguardando-implantacao"
        ? { apto: true, concluido: false, responsaveis: [responsavel] }
        : status === "aceito"
          ? { apto: true, concluido: false, responsaveis: [] }
          : { apto: false, concluido: false, responsaveis: [] };

    const base = buildPetItem({
      responsavel,
      template,
      status,
      pontuacao,
      implantacao,
    });

    // “Realismo” extra: variar subtítulo/descrição2 e anexos
    const ageDays = clamp(Math.floor(Math.random() * daysWindow) + 1, 1, daysWindow);

    // interação “time” (simula andamento)
    const extraInteracoes = Math.random() < 0.55 ? Math.floor(Math.random() * 3) : 0;
    for (let k = 0; k < extraInteracoes; k++) {
      base.anexos.push(
        makeAnexoInteracao(
          responsavel,
          "Atualização",
          `Movimentação registrada • ${fmtHumanAgo(ageDays)} • Ajuste de escopo/descrição.`
        )
      );
    }

    // doc extra eventual
    if (Math.random() < 0.25) {
      base.anexos.push(
        makeAnexoDocumento(
          responsavel,
          "Referência técnica",
          "Material de apoio adicional para embasar decisão.",
          pick([
            WEB_LINKS.owaspTop10,
            WEB_LINKS.webhooks,
            WEB_LINKS.cron,
            WEB_LINKS.metaBusiness,
            WEB_LINKS.whatsappBusiness,
          ])
        )
      );
    }

    // “descrição2” em parte dos itens
    if (Math.random() < 0.45) {
      base.descricao2 =
        "Notas adicionais: critérios de aceite, risco, dependências e impacto operacional.";
    }

    // OBS: createdAt/updatedAt são do mongoose timestamps.
    // Se você quiser “datas espalhadas”, o jeito correto é:
    // - inserir normalmente
    // - depois rodar updateMany com $set { createdAt, updatedAt } via collection (bypass)
    // Aqui mantemos simples e consistente.

    docs.push(base);
  }

  const insertedDocs = await Pet.insertMany(docs, { ordered: false });

  return { inserted: insertedDocs.length, skipped: false };
}

function fmtHumanAgo(days: number) {
  if (days <= 1) return "hoje";
  if (days === 2) return "ontem";
  return `há ${days} dias`;
}

/**
 * Execução direta (opcional):
 *   ts-node src/seeds/seed-pet.ts
 *
 * Requer MONGODB_URI no env.
 */
if (require.main === module) {
  (async () => {
    const uri = String(process.env.MONGODB_URI || "").trim();
    if (!uri) {
      // eslint-disable-next-line no-console
      console.error("MONGODB_URI não definido.");
      process.exit(1);
    }

    await mongoose.connect(uri);

    const result = await seedPet({
      enabled: true,
      reset: envBool(process.env.PET_SEED_RESET),
      force: envBool(process.env.PET_SEED_FORCE),
      count: 60,
    });

    // eslint-disable-next-line no-console
    console.log("[seed-pet]", result);

    await mongoose.disconnect();
    process.exit(0);
  })().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[seed-pet] erro:", e);
    process.exit(1);
  });
}
