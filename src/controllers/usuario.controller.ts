// src/controllers/Usuario.controller.ts
import Console, { ConsoleData } from "../lib/Console";
import Usuario, {
  LogPendenciaType,
  PendenciaStatus,
  PendenciaUsuarioType,
  UsuarioRole,
  UsuarioType,
} from "../models/Usuario";

class UsuarioController {
  /* -------------------------------------------------------------------------- */
  /*  AUTENTICAÇÃO                                                              */
  /* -------------------------------------------------------------------------- */

  async authenticate({ email, senha }: { email: string; senha: string }) {
    if (!email || !senha) {
      Console({ type: "error", message: "Email ou senha não fornecidos." });
      return {
        status: false,
        message: "Email ou senha não fornecidos.",
        data: null,
      };
    }

    Console({ type: "log", message: "Autenticando usuário..." });

    try {
      const usuario = await Usuario.findOne({ email }).lean();

      if (!usuario) {
        Console({ type: "error", message: "Usuário não encontrado." });
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      if (!usuario.ativo) {
        Console({ type: "error", message: "Usuário inativo." });
        return {
          status: false,
          message: "Usuário inativo.",
          data: null,
        };
      }

      if (usuario.senha !== senha) {
        Console({ type: "error", message: "Senha incorreta." });
        return {
          status: false,
          message: "Senha incorreta.",
          data: null,
        };
      }

      const atualizado = await Usuario.findByIdAndUpdate(
        usuario._id,
        {
          $set: {
            dataUltimoAcesso: new Date(),
            dataEdicao: new Date(),
          },
        },
        { new: true }
      ).lean();

      const safeUser = atualizado ?? usuario;

      Console({ type: "success", message: "Usuário autenticado com sucesso!" });

      return {
        status: true,
        message: "Usuário autenticado com sucesso!",
        data: { ...safeUser, _id: String(safeUser?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao autenticar usuário." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao autenticar usuário.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  BUSCAS                                                                    */
  /* -------------------------------------------------------------------------- */

  async buscarPorEmail({ email }: { email: string }) {
    if (!email) {
      Console({ type: "error", message: "Email não fornecido." });
      return {
        status: false,
        message: "Email não fornecido.",
        data: null,
      };
    }

    try {
      const usr = await Usuario.findOne({ email }).lean();

      if (!usr) {
        Console({ type: "error", message: "Usuário não encontrado." });
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      return {
        status: true,
        message: "Usuário encontrado com sucesso!",
        data: { ...usr, _id: String(usr?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar usuário." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar usuário.",
        data: null,
      };
    }
  }

  async buscarPorId({ userId }: { userId: string }) {
    if (!userId) {
      Console({ type: "error", message: "userId não fornecido." });
      return {
        status: false,
        message: "userId não fornecido.",
        data: null,
      };
    }

    try {
      const usr = await Usuario.findById(userId).lean();

      if (!usr) {
        Console({ type: "error", message: "Usuário não encontrado." });
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      return {
        status: true,
        message: "Usuário encontrado com sucesso!",
        data: { ...usr, _id: String(usr?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar usuário." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar usuário.",
        data: null,
      };
    }
  }

  async buscarAtivos() {
    try {
      const usuarios = (await Usuario.find({ ativo: true }).lean()) as UsuarioType[];

      if (!usuarios.length) {
        Console({
          type: "error",
          message: "Nenhum usuário ativo encontrado.",
        });
        return {
          status: false,
          message: "Nenhum usuário ativo encontrado.",
          data: [],
        };
      }

      const result = usuarios.map((usr) => ({
        ...usr,
        _id: String(usr?._id),
        senha: "****",
      }));

      return {
        status: true,
        message: "Usuários ativos encontrados com sucesso!",
        data: result,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar usuários." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar usuários.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  CADASTRO / EDIÇÃO                                                         */
  /* -------------------------------------------------------------------------- */

  async cadastrar(payload: UsuarioType) {
    if (!payload.email || !payload.senha) {
      Console({
        type: "error",
        message: "Email ou senha não fornecidos.",
      });
      return {
        status: false,
        message: "Email ou senha não fornecidos.",
        data: null,
      };
    }

    Console({ type: "log", message: "Criando/atualizando usuário..." });

    try {
      const result = await Usuario.findOneAndUpdate(
        { email: payload.email },
        {
          $set: {
            ...payload,
            dataEdicao: new Date(),
            dataCadastro: payload.dataCadastro ?? new Date(),
          },
        },
        { upsert: true, new: true }
      ).lean();

      if (!result) {
        Console({
          type: "error",
          message: "Não foi possível criar/atualizar o usuário.",
        });
        return {
          status: false,
          message: "Não foi possível criar/atualizar o usuário.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Usuário criado/atualizado com sucesso!",
      });

      return {
        status: true,
        message: "Usuário criado/atualizado com sucesso!",
        data: { ...result, _id: String(result?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao criar/atualizar usuário." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao criar/atualizar usuário.",
        data: null,
      };
    }
  }

  async editar({
    userId,
    name,
    value,
  }: {
    userId: string;
    name: keyof UsuarioType;
    value: any;
  }) {
    if (!userId || !name) {
      Console({
        type: "error",
        message: "userId ou campo não fornecido.",
      });
      return {
        status: false,
        message: "userId ou campo não fornecido.",
        data: null,
      };
    }

    const camposProibidos: (keyof UsuarioType)[] = [
      "_id",
      "senha",
      "roles",
      "pendencias",
      "dataCadastro",
      "dataEdicao",
      "dataUltimoAcesso",
    ];

    if (camposProibidos.includes(name)) {
      Console({
        type: "error",
        message: `O campo "${String(
          name
        )}" não pode ser atualizado por este método.`,
      });
      return {
        status: false,
        message: `O campo "${String(
          name
        )}" não pode ser atualizado por este método.`,
        data: null,
      };
    }

    try {
      const usuario = await Usuario.findByIdAndUpdate(
        userId,
        { $set: { [name]: value, dataEdicao: new Date() } },
        { new: true }
      ).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      return {
        status: true,
        message: "Usuário atualizado com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao editar usuário." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao editar usuário.",
        data: null,
      };
    }
  }

  async editarSenha({
    newPassword,
    userId,
  }: {
    newPassword: string;
    userId: string;
  }) {
    if (!userId) {
      Console({
        type: "error",
        message: "ID do usuário não fornecido.",
      });
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }

    if (!newPassword) {
      Console({
        type: "error",
        message: "Informe a nova senha.",
      });
      return {
        status: false,
        message: "Informe a nova senha.",
        data: null,
      };
    }

    Console({
      type: "log",
      message: "Iniciando atualização de senha do usuário...",
    });

    try {
      const usuario = await Usuario.findByIdAndUpdate(
        userId,
        {
          $set: {
            senha: newPassword, // depois: bcrypt.hash
            dataEdicao: new Date(),
          },
        },
        { new: true }
      ).lean();

      if (!usuario) {
        Console({
          type: "error",
          message: "Não foi possível atualizar o usuário.",
        });
        return {
          status: false,
          message: "Não foi possível atualizar o usuário.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Senha atualizada com sucesso!",
      });

      return {
        status: true,
        message: "Senha atualizada com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao atualizar senha." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar senha.",
        data: null,
      };
    }
  }

  async atualizarRoles({
    userId,
    roles,
  }: {
    userId: string;
    roles: UsuarioRole[];
  }) {
    if (!userId) {
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }
    if (!roles || !roles.length) {
      return {
        status: false,
        message: "Informe pelo menos uma role.",
        data: null,
      };
    }

    Console({ type: "log", message: "Atualizando roles do usuário..." });

    try {
      const usuario = await Usuario.findByIdAndUpdate(
        userId,
        { $set: { roles, dataEdicao: new Date() } },
        { new: true }
      ).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Roles atualizadas com sucesso!",
      });

      return {
        status: true,
        message: "Roles atualizadas com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao atualizar roles." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar roles.",
        data: null,
      };
    }
  }

  async mudarStatus({
    userId,
    status,
  }: {
    userId: string;
    status: boolean;
  }) {
    if (!userId) {
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }

    Console({
      type: "log",
      message: `Alterando status do usuário para ${status ? "ativo" : "inativo"
        }...`,
    });

    try {
      const usuario = await Usuario.findByIdAndUpdate(
        userId,
        { $set: { ativo: status, dataEdicao: new Date() } },
        { new: true }
      ).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Status do usuário atualizado com sucesso!",
      });

      return {
        status: true,
        message: "Status do usuário atualizado com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao alterar status do usuário.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao alterar status do usuário.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  PENDÊNCIAS                                                                */
  /* -------------------------------------------------------------------------- */

  async buscarPendencias(userId: string) {
    if (!userId) {
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }

    Console({ type: "log", message: "Buscando pendências do usuário..." });

    try {
      const usuario = await Usuario.findById(userId, { pendencias: 1 }).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      const pendencias = usuario.pendencias ?? [];

      Console({
        type: "success",
        message: "Pendências encontradas com sucesso!",
      });

      return {
        status: true,
        message: "Pendências encontradas com sucesso!",
        data: pendencias,
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao buscar pendências do usuário.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar pendências do usuário.",
        data: null,
      };
    }
  }

  async cadastrarPendencia(userId: string, pendencia: PendenciaUsuarioType) {
    if (!userId) {
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }

    if (!pendencia) {
      return {
        status: false,
        message: "Pendência não fornecida.",
        data: null,
      };
    }

    if (!pendencia.titulo) {
      return {
        status: false,
        message: "Título não fornecido.",
        data: null,
      };
    }

    if (!pendencia.descricao) {
      return {
        status: false,
        message: "Descrição não fornecida.",
        data: null,
      };
    }

    if (!pendencia.dataLimite) {
      return {
        status: false,
        message: "Data limite não fornecida.",
        data: null,
      };
    }

    if (!pendencia.ref) {
      return {
        status: false,
        message: "Ref da pendência não fornecida.",
        data: null,
      };
    }

    if (
      pendencia.status &&
      !["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"].includes(pendencia.status)
    ) {
      return {
        status: false,
        message: "Status inválido.",
        data: null,
      };
    }

    const novaPendencia: PendenciaUsuarioType = {
      ...pendencia,
      data: pendencia.data ?? new Date(),
      log: pendencia.log ?? [],
      status: pendencia.status ?? "PENDENTE",
    };

    Console({ type: "log", message: "Cadastrando pendência do usuário..." });

    try {
      const usuario = await Usuario.findByIdAndUpdate(
        userId,
        {
          $push: { pendencias: novaPendencia },
          $set: { dataEdicao: new Date() },
        },
        { new: true }
      ).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Pendência cadastrada com sucesso!",
      });

      return {
        status: true,
        message: "Pendência cadastrada com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao cadastrar pendência do usuário.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao cadastrar pendência do usuário.",
        data: null,
      };
    }
  }

  async editarPendencia({
    userId,
    ref,
    status,
    observacao,
  }: {
    userId: string;
    ref: string;
    status?: PendenciaStatus;
    observacao?: string;
  }) {
    if (!userId) {
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }

    if (!ref) {
      return {
        status: false,
        message: "Ref da pendência não fornecida.",
        data: null,
      };
    }

    if (!status && !observacao) {
      return {
        status: false,
        message: "Nada para atualizar (status/observacao).",
        data: null,
      };
    }

    if (
      status &&
      !["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"].includes(status)
    ) {
      return {
        status: false,
        message: "Status inválido.",
        data: null,
      };
    }

    Console({ type: "log", message: "Editando pendência do usuário..." });

    const update: any = {};
    if (status) {
      update["pendencias.$.status"] = status;
    }

    const updateQuery: any = {
      $set: {
        ...update,
        dataEdicao: new Date(),
      },
    };

    if (observacao) {
      const logItem: LogPendenciaType = {
        status: status ?? "PENDENTE",
        data: new Date(),
        observacao,
      };
      updateQuery.$push = { "pendencias.$.log": logItem };
    }

    try {
      const usuario = await Usuario.findOneAndUpdate(
        { _id: userId, "pendencias.ref": ref },
        updateQuery,
        { new: true }
      ).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário ou pendência não encontrados.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Pendência editada com sucesso!",
      });

      return {
        status: true,
        message: "Pendência editada com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao editar pendência do usuário.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao editar pendência do usuário.",
        data: null,
      };
    }
  }

  async removerPendencia(userId: string, ref: string) {
    if (!userId) {
      return {
        status: false,
        message: "ID do usuário não fornecido.",
        data: null,
      };
    }

    if (!ref) {
      return {
        status: false,
        message: "Ref da pendência não fornecida.",
        data: null,
      };
    }

    Console({ type: "log", message: "Removendo pendência do usuário..." });

    try {
      const usuario = await Usuario.findByIdAndUpdate(
        userId,
        {
          $pull: { pendencias: { ref } },
          $set: { dataEdicao: new Date() },
        },
        { new: true }
      ).lean();

      if (!usuario) {
        return {
          status: false,
          message: "Usuário não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Pendência removida com sucesso!",
      });

      return {
        status: true,
        message: "Pendência removida com sucesso!",
        data: { ...usuario, _id: String(usuario?._id), senha: "****" },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao remover pendência do usuário.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao remover pendência do usuário.",
        data: null,
      };
    }
  }
}

export default new UsuarioController();
