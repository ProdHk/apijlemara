// controllers/ClienteController.ts
import { Request, Response } from "express";
import Console, { ConsoleData } from "../lib/Console";
import Cliente, { ClienteType, TelefoneClienteType } from "../models/Cliente";
import { PessoaUauRequest } from '../types/uauTypes'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type ResponseType<T = any> = {
  status: boolean;
  message: string;
  data: T;
};

function ok<T>(res: Response, payload: ResponseType<T>) {
  return res.status(200).json(payload);
}

function fail(res: Response, error: unknown, fallback = "Erro interno") {
  const message = error instanceof Error ? error.message : fallback;
  Console({ type: "error", message });
  ConsoleData({ type: "error", data: error });
  return res.status(500).json({ status: false, message, data: null });
}

function onlyDigits(v: any) {
  return String(v ?? "").replace(/\D+/g, "");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toBool(v: any) {
  return String(v ?? "false") === "true";
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 12;

const LIST_PROJECTION = {
  cod_pes: 1,
  nome_pes: 1,
  tipo_pes: 1,
  cpf_pes: 1,
  Email_pes: 1,
  numeroWhatsapp: 1,
  Status_pes: 1,
  BloqueioLgpd_Pes: 1,
  dtcad_pes: 1,
  DataAlt_pes: 1,
  Empreendimento_Pes: 1,
  Matricula_Pes: 1,
  UsrCad_pes: 1,
  UsrAlt_pes: 1,
  atendimentos: 1,
  updatedAt: 1,
  createdAt: 1,
} as const;

/**
 * Sort seguro (whitelist)
 * - ordenação padrão: DataAlt_pes desc
 */
const SORT_FIELDS: Record<string, string> = {
  nome: "nome",            // ou "nome_pes" se padronizar depois
  codigo: "codPes",
  status: "Status_pes",
  cadastro: "createdAt",
  alteracao: "updatedAt",
  updatedAt: "updatedAt",
  createdAt: "createdAt",
};


type ListQuery = {
  page: number;
  limit: number;
  q: string;
  tab: "todos" | "ativos" | "bloqueados";
  onlyHasWhatsapp: boolean;
  hideLgpdBlocked: boolean;
  sortKey: keyof typeof SORT_FIELDS | "atendimentos" | string;
  sortDir: "asc" | "desc";
};

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class ClienteController {
  /* -------------------------------------------------------------------------- */
  /* ERP / CADASTRO BÁSICO                                                     */
  /* -------------------------------------------------------------------------- */



  async sincronizarErp(payload: any) {
    if (!payload) {
      Console({ type: "error", message: "Payload vazio." });
      return { status: false, message: "Payload vazio.", data: null };
    }

    try {
      Console({ type: "log", message: "Sincronizando cliente (via cod_pes)..." });
      const result = await this.cadastrar(payload);
      if (!result.status) return result;

      return {
        status: true,
        message: "Cliente sincronizado com sucesso!",
        data: { ...result.data, _id: String(result?.data?._id) },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao sincronizar cliente." });
      ConsoleData({ type: "error", data: error });
      return { status: false, message: "Erro ao sincronizar cliente.", data: null };
    }
  }


  /* -------------------------------------------------------------------------- */
  /* BUSCAS (HTTP)                                                             */
  /* -------------------------------------------------------------------------- */

  /**
   * GET /api/cliente
   * Query:
   *  - page, limit
   *  - q
   *  - tab: todos | ativos | bloqueados
   *  - onlyHasWhatsapp=true|false
   *  - hideLgpdBlocked=true|false
   *  - sortKey: nome|codigo|status|cadastro|alteracao|updatedAt|createdAt
   *  - sortDir: asc|desc
   *
   * Objetivo: rápido e previsível
   * - projection fixa (LIST_PROJECTION)
   * - paginação sempre
   * - filtros simples
   * - busca: números -> igualdade (cpf/whats/cod); texto -> prefix (^) para não virar fullscan pesado
   */
  async buscarClientes(req: Request, res: Response) {
    const startedAt = Date.now();
    Console({ type: "log", message: "GET /api/cliente (list)" });

    try {
      const query: ListQuery = {
        page: clampInt(req.query.page, 1, 999999, 1),
        limit: clampInt(req.query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
        q: String(req.query.q ?? ""),
        tab: (String(req.query.tab ?? "todos") as any) ?? "todos",
        onlyHasWhatsapp: toBool(req.query.onlyHasWhatsapp),
        hideLgpdBlocked: toBool(req.query.hideLgpdBlocked),
        sortKey: String(req.query.sortKey ?? "alteracao"),
        sortDir: (String(req.query.sortDir ?? "desc") === "asc" ? "asc" : "desc"),
      };

      const skip = (query.page - 1) * query.limit;

      const filter: any = {};

      // tabs
      if (query.tab === "ativos") filter.Status_pes = 1;
      if (query.tab === "bloqueados") filter.Status_pes = 2;

      // switches
      if (query.onlyHasWhatsapp) {
        filter.numeroWhatsapp = { $exists: true, $ne: null };
      }

      if (query.hideLgpdBlocked) {
        // se BloqueioLgpd_Pes for 1/true como bloqueio
        filter.BloqueioLgpd_Pes = { $ne: 1 };
      }

      function escapeRegex(input: string) {
        return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      function normalizeQ(q: string) {
        return q.trim().replace(/\s+/g, " ");
      }

      function isProbablyEmail(q: string) {
        return q.includes("@") && q.includes(".");
      }



      // search
      const qRaw = normalizeQ(query.q || "");
      if (qRaw) {
        const digits = onlyDigits(qRaw);

        // EMAIL
        if (isProbablyEmail(qRaw)) {
          const safe = escapeRegex(qRaw.toLowerCase());
          filter.$or = [
            { email: { $regex: safe, $options: "i" } },
            { Email_pes: { $regex: safe, $options: "i" } },
          ];
        }
        // NUMÉRICOS (cpf/cnpj/whats/código)
        else if (digits.length >= 3) {
          const cod = Number(digits);

          const or: any[] = [
            { cpfCnpj: digits },
            { cpf_pes: digits },
            { numeroWhatsapp: digits },
          ];

          if (!Number.isNaN(cod)) {
            or.push({ codPes: cod });
            or.push({ cod_pes: cod });
          }

          if (digits.length >= 6) {
            const rx = escapeRegex(digits);
            or.push({ cpfCnpj: { $regex: rx } });
            or.push({ cpf_pes: { $regex: rx } });
            or.push({ numeroWhatsapp: { $regex: rx } });
          }

          filter.$or = or;
        }
        // TEXTO (nome)
        else {
          if (qRaw.length >= 2) {
            const safe = escapeRegex(qRaw);

            // contains, case-insensitive
            filter.$or = [
              { nome: { $regex: safe, $options: "i" } },
              { nome_pes: { $regex: safe, $options: "i" } },
            ];
          }
        }
      }


      // sort seguro
      const sortField = SORT_FIELDS[query.sortKey] ?? SORT_FIELDS.alteracao;
      const sortDir = query.sortDir === "asc" ? 1 : -1;

      // fallback para "atendimentos" sem agregação:
      // - mantém DataAlt_pes (previsível e rápido)
      const sort: any = {};
      sort[sortField] = sortDir;

      // Dica anti-delay: hint opcional (só se você tiver os índices)
      // const hint = query.tab !== "todos" ? { Status_pes: 1, DataAlt_pes: -1 } : { DataAlt_pes: -1 };

      const [total, items] = await Promise.all([
        Cliente.countDocuments(filter),
        Cliente.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(query.limit)
          .lean(),
      ]);

      const ms = Date.now() - startedAt;

      return ok(res, {
        status: true,
        message: "Clientes encontrados",
        data: {
          items,
          total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
          tookMs: ms, // útil pra você medir no front/back
        },
      });
    } catch (error) {
      return fail(res, error, "Erro ao listar clientes");
    }
  }

  /**
   * GET /api/cliente/:id
   * (sem POST pra buscar id — evita overhead e fica padrão REST)
   */
  async buscarClienteId(req: Request, res: Response) {
    Console({ type: "log", message: "GET /api/cliente/:id" });

    try {
      const id = String(req.params.id ?? "").trim();
      if (!id) {
        return ok(res, { status: false, message: "ID do cliente não informado.", data: null });
      }

      const cliente = await Cliente.findById(id).lean();

      if (!cliente) {
        return ok(res, { status: false, message: "Cliente não encontrado.", data: null });
      }

      return ok(res, {
        status: true,
        message: "Cliente encontrado",
        data: { ...cliente, _id: String(cliente._id) },
      });
    } catch (error) {
      return fail(res, error, "Erro ao buscar cliente por id");
    }
  }

  /**
   * GET /api/cliente/cod/:cod
   * (sem POST, retorna 1 item com findOne)
   */
  async buscarClienteCodErp(req: Request, res: Response) {
    Console({ type: "log", message: "GET /api/cliente/cod/:cod" });

    try {
      const codStr = String(req.params.cod ?? "").trim();
      const cod = Number(codStr);

      if (!codStr || Number.isNaN(cod)) {
        return ok(res, { status: false, message: "cod_pes inválido.", data: null });
      }

      const cliente = await Cliente.findOne({ cod_pes: cod }).lean();

      if (!cliente) {
        return ok(res, { status: false, message: "Cliente não encontrado.", data: null });
      }

      return ok(res, {
        status: true,
        message: "Cliente encontrado",
        data: { ...cliente, _id: String(cliente._id) },
      });
    } catch (error) {
      return fail(res, error, "Erro ao buscar cliente por cod_pes");
    }
  }
  async vincularWhatsapp(req: Request, res: Response) {
    Console({ type: "log", message: "POST /api/cliente/whatsapp/atualizar" });

    try {
      const { whatsapp, id } = req.body;

      if (!whatsapp || !id) {
        return ok(res, { status: false, message: "Dados inválidos.", data: null });
      }

      const cliente = await Cliente.findOne({ _id: id }).lean();

      if (!cliente) {
        return ok(res, { status: false, message: "Cliente não encontrado.", data: null });
      }

      await Cliente.findOneAndUpdate({ _id: id }, { $set: { numeroWhatsapp: whatsapp } });

      return ok(res, {
        status: true,
        message: "Cliente atualizado",
        data: { ...cliente, _id: String(cliente._id) },
      });
    } catch (error) {
      return fail(res, error, "Erro ao vincular whatsapp");

    }
  }

























  /* REFATORADO */


  async cadastrar(payload: ClienteType) {

    if (!payload) {
      Console({ type: "error", message: "Payload vazio." });
      return { status: false, message: "Payload vazio.", data: null };
    }

    const cod = payload.codPes;

    if (cod === undefined || cod === null) {
      Console({ type: "error", message: "Código (cod_pes) do cliente é obrigatório." });
      return { status: false, message: "Código (cod_pes) do cliente é obrigatório.", data: null };
    }

    try {
      Console({ type: "log", message: `Cadastrando/atualizando cliente ${cod}...` });

      const cliente = await Cliente.findOneAndUpdate(
        { codPes: cod },
        { $set: payload },
        { upsert: true, new: true }
      ).lean();

      if (!cliente) {
        return { status: false, message: "Erro ao cadastrar cliente.", data: null };
      }

      return {
        status: true,
        message: "Cliente cadastrado com sucesso!",
        data: { ...cliente, _id: String(cliente._id) } as ClienteType,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao cadastrar cliente." });
      ConsoleData({ type: "error", data: error });
      return { status: false, message: "Erro ao cadastrar cliente.", data: null };
    }
  }

  async cadastrarTelefonesEmMassa(payload: any) {
    Console({ type: "log", message: "Cadastrando telefones em massa..." });

    try {
      let total = payload.length, success = 0, fail = 0;

      for (const item of payload) {
        await Cliente.findOneAndUpdate({ codPes: item.codPes }, { $addToSet: { telefones: item.telefones } }).catch(() => {
          fail++;
        })

        success++;

      }
    } catch (error) {

    }
  }


  async sincronizarListaErp(payload: PessoaUauRequest[]) {

    if (!payload || !payload.length) {
      Console({ type: "error", message: "Payload vazio." });
      return { status: false, message: "Payload vazio.", data: null };
    }

    try {
      const total = payload.length;
      let success = 0;
      let failCount = 0;

      Console({ type: "log", message: `Sincronizando lista de clientes (${total})...` });

      for (const cli of payload as PessoaUauRequest[]) {
        const codPes = Number(cli?.CodigoPessoa);

        if (codPes === undefined || codPes === null) {
          Console({ type: "warn", message: "cod_pes vazio, ignorando registro." });
          failCount++;
          continue;
        }

        try {

          const buffer: ClienteType = {
            codPes: cli.CodigoPessoa,
            nome: cli.NomePessoa,
            tipo: cli.TipoPessoa,
            cpfCnpj: cli.CpfPessoa,
            dataNascimento: new Date(String(cli.DataNascimentoPessoa)),
            dataCadastro: new Date(String(cli.DataCadastroPessoa)),
            status: cli.StatusPessoa,
            email: cli.EmailPessoa,
            dataAlteracao: new Date(String(cli.DataAlteracaoPessoa)),
            nomeFantasia: cli.NomeFantasia,
            anexos: cli.AnexosPessoa,
            login: cli.LoginPessoa,
            senha: cli.SenhaLoginPessoa,
          }

          const result = await this.cadastrar(buffer);


          if (!result.status) {
            failCount++;
            Console({ type: "warn", message: `Falha ao sincronizar cliente ${cli.CodigoPessoa}: ${result.message}` });
            continue;
          }
          success++;
        } catch (err) {
          failCount++;
          Console({ type: "error", message: `Erro ao sincronizar cliente ${cli.CodigoPessoa}.` });
          ConsoleData({ type: "error", data: err });
        }
      }

      const message = `Total de clientes sincronizados: ${success} de ${total}, ${failCount} falhas.`;

      Console({ type: "success", message });

      return { status: true, message, data: { total, success, fail: failCount } };
    } catch (error) {
      Console({ type: "error", message: "Erro ao sincronizar clientes." });
      ConsoleData({ type: "error", data: error });
      return { status: false, message: "Erro ao sincronizar clientes.", data: null };
    }
  }

}
