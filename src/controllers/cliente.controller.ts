import Console, { ConsoleData } from "../lib/Console";
import Cliente, { ClienteType } from "../models/Cliente";

interface ResponseUauCliente {
  cod_pes?: number;
  nome_pes?: string;
  tipo_pes?: number;
  cpf_pes?: string;
  dtcad_pes?: Date;
  dtnasc_pes?: Date;
  IntExt_pes?: number;
  UsrCad_pes?: string;
  UsrAlt_pes?: string;
  Status_pes?: number;
  Tratamento_pes?: string;
  Email_pes?: string;
  EndWWW_pes?: string;
  Matricula_Pes?: string | null;
  Empreendimento_Pes?: string | null;
  ForCli_Pes?: string | null;
  Aval_Prod_Serv_Pes?: string | null;
  Atd_Entrega_Pes?: string | null;
  AtInat_pes?: number;
  DataAlt_pes?: Date;
  NomeFant_Pes?: string;
  Anexos_pes?: number;
  InscrMunic_pes?: string;
  inscrest_pes?: string;
  Login_pes?: string;
  Senha_pes?: string;
  CNAE_pes?: string | null;
  DataCadPortal_pes?: Date;
  CadastradoPrefeituraGyn_pes?: boolean;
  HabilitadoRiscoSacado_pes?: boolean;
  CEI_Pes?: string | null;
  IntegradoEDI_pes?: string | null;
  BloqueioLgpd_Pes?: number;
  CliDDA_PPes?: string | null;
}

export default class ClienteController {
  /* -------------------------------------------------------------------------- */
  /*  ERP / CADASTRO BÁSICO                                                    */
  /* -------------------------------------------------------------------------- */

  async cadastrar(payload: ResponseUauCliente) {
    if (!payload) {
      Console({ type: "error", message: "Payload vazio." });
      return {
        status: false,
        message: "Payload vazio.",
        data: null,
      };
    }

    const cod = payload.cod_pes;

    if (!cod && cod !== 0) {
      Console({
        type: "error",
        message: "Código (cod_pes) do cliente é obrigatório.",
      });
      return {
        status: false,
        message: "Código (cod_pes) do cliente é obrigatório.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Cadastrando/atualizando cliente ${cod}...`,
      });

      const cliente = await Cliente.findOneAndUpdate(
        { cod_pes: cod },
        { $set: payload },
        { upsert: true, new: true }
      ).lean();

      if (!cliente) {
        Console({
          type: "error",
          message: "Erro ao cadastrar cliente.",
        });
        return {
          status: false,
          message: "Erro ao cadastrar cliente.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Cliente cadastrado com sucesso!",
      });

      return {
        status: true,
        message: "Cliente cadastrado com sucesso!",
        data: {
          ...cliente,
          _id: String(cliente._id),
        } as ClienteType,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao cadastrar cliente." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao cadastrar cliente.",
        data: null,
      };
    }
  }

  async sincronizarErp(payload: ResponseUauCliente) {
    if (!payload) {
      Console({ type: "error", message: "Payload vazio." });
      return {
        status: false,
        message: "Payload vazio.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: "Sincronizando cliente (via cod_pes)...",
      });

      const result = await this.cadastrar(payload);

      if (!result.status || !result.data) {
        return result;
      }

      return {
        status: true,
        message: "Cliente sincronizado com sucesso!",
        data: {
          ...result.data,
          _id: String(result.data._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao sincronizar cliente." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao sincronizar cliente.",
        data: null,
      };
    }
  }

  async sincronizarListaErp(payload: ResponseUauCliente[]) {
    if (!payload || !payload.length) {
      Console({ type: "error", message: "Payload vazio." });
      return {
        status: false,
        message: "Payload vazio.",
        data: null,
      };
    }

    try {
      const total = payload.length;
      let success = 0;
      let fail = 0;

      Console({
        type: "log",
        message: `Sincronizando lista de clientes (${total})...`,
      });

      for (const cli of payload) {
        const cod = cli.cod_pes;

        if (!cod && cod !== 0) {
          Console({
            type: "warn",
            message: "cod_pes vazio, ignorando registro.",
          });
          fail++;
          continue;
        }

        try {
          const result = await this.cadastrar({ ...cli, cod_pes: cod });

          if (!result.status) {
            fail++;
            Console({
              type: "warn",
              message: `Falha ao sincronizar cliente ${cod}: ${result.message}`,
            });
            continue;
          }

          Console({
            type: "success",
            message: `Cliente ${cod} sincronizado com sucesso!`,
          });
          success++;
        } catch (err) {
          fail++;
          Console({
            type: "error",
            message: `Erro ao sincronizar cliente ${cod}.`,
          });
          ConsoleData({ type: "error", data: err });
        }
      }

      const message = `Total de clientes sincronizados: ${success} de ${total}, ${fail} falhas.`;
      Console({ type: "success", message });

      return {
        status: true,
        message,
        data: { total, success, fail },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao sincronizar clientes.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao sincronizar clientes.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  BUSCAS PRINCIPAIS                                                        */
  /* -------------------------------------------------------------------------- */

  async buscarPorId(clienteId: string) {
    if (!clienteId) {
      return {
        status: false,
        message: "ID do cliente não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Buscando cliente por _id ${clienteId}...`,
      });

      const cliente = await Cliente.findById(clienteId).lean();

      if (!cliente) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Cliente encontrado com sucesso!",
      });

      return {
        status: true,
        message: "Cliente encontrado com sucesso!",
        data: {
          ...cliente,
          _id: String(cliente._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar cliente." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar cliente.",
        data: null,
      };
    }
  }

  async buscarPorCodErp(cod_pes: number) {
    if (cod_pes === undefined || cod_pes === null) {
      return {
        status: false,
        message: "cod_pes não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Buscando cliente por cod_pes ${cod_pes}...`,
      });

      const cliente = await Cliente.find({ cod_pes: Number(cod_pes) }).lean() as ClienteType
      console.log(cliente)
      if (!cliente) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Cliente encontrado com sucesso!",
      });

      return {
        status: true,
        message: "Cliente encontrado com sucesso!",
        data: {
          ...cliente,
          _id: String(cliente._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar cliente." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar cliente.",
        data: null,
      };
    }
  }

  async buscarPorCpf(cpf: string) {
    const doc = cpf?.trim();

    if (!doc) {
      return {
        status: false,
        message: "CPF não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Buscando cliente por CPF ${doc}...`,
      });

      const cliente = await Cliente.findOne({ cpf_pes: doc }).lean();

      if (!cliente) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Cliente encontrado com sucesso!",
      });

      return {
        status: true,
        message: "Cliente encontrado com sucesso!",
        data: {
          ...cliente,
          _id: String(cliente._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar cliente por CPF." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar cliente por CPF.",
        data: null,
      };
    }
  }

  async buscarPorEmail(email: string) {
    const mail = email?.trim().toLowerCase();

    if (!mail) {
      return {
        status: false,
        message: "Email não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Buscando cliente por email ${mail}...`,
      });

      const cliente = await Cliente.findOne({ Email_pes: mail }).lean();

      if (!cliente) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Cliente encontrado com sucesso!",
      });

      return {
        status: true,
        message: "Cliente encontrado com sucesso!",
        data: {
          ...cliente,
          _id: String(cliente._id),
        },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao buscar cliente por email.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar cliente por email.",
        data: null,
      };
    }
  }

  async buscarPorWhatsapp(numeroWhatsapp: string) {
    const numero = numeroWhatsapp?.trim();

    if (!numero) {
      return {
        status: false,
        message: "Número de WhatsApp não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Buscando cliente por WhatsApp ${numero}...`,
      });

      const cliente = await Cliente.findOne({ numeroWhatsapp: numero }).lean();

      if (!cliente) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Cliente encontrado com sucesso!",
      });

      return {
        status: true,
        message: "Cliente encontrado com sucesso!",
        data: {
          ...cliente,
          _id: String(cliente._id),
        },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao buscar cliente por WhatsApp.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar cliente por WhatsApp.",
        data: null,
      };
    }
  }

  async buscarPorNomeParcial(nome: string) {
    const termo = nome?.trim();

    if (!termo) {
      return {
        status: false,
        message: "Nome não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Buscando clientes por nome parcial "${termo}"...`,
      });

      const clientes = await Cliente.find({
        nome_pes: { $regex: termo, $options: "i" },
      }).lean();

      if (!clientes.length) {
        Console({
          type: "warn",
          message: "Nenhum cliente encontrado para o nome informado.",
        });
        return {
          status: true,
          message: "Nenhum cliente encontrado para o nome informado.",
          data: [],
        };
      }

      const data = clientes.map((cli) => ({
        ...cli,
        _id: String(cli._id),
      }));

      Console({
        type: "success",
        message: "Clientes encontrados com sucesso!",
      });

      return {
        status: true,
        message: "Clientes encontrados com sucesso!",
        data,
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao buscar clientes por nome.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar clientes por nome.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  LISTAGENS                                                                 */
  /* -------------------------------------------------------------------------- */

  async listarTodos() {
    try {
      Console({ type: "log", message: "Buscando todos os clientes..." });

      const clientes = await Cliente.find().lean();

      if (!clientes.length) {
        Console({
          type: "warn",
          message: "Nenhum cliente encontrado.",
        });
        return {
          status: true,
          message: "Nenhum cliente encontrado.",
          data: [],
        };
      }

      const data = clientes.map((cli) => ({
        ...cli,
        _id: String(cli._id),
      }));

      Console({
        type: "success",
        message: "Clientes encontrados com sucesso!",
      });

      return {
        status: true,
        message: "Clientes encontrados com sucesso!",
        data,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar clientes." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar clientes.",
        data: null,
      };
    }
  }

  async listarAtivos() {
    try {
      Console({ type: "log", message: "Buscando clientes ativos..." });

      // aqui assumimos AtInat_pes = 0 como ativo (ajustar se regra for outra)
      const clientes = await Cliente.find({ AtInat_pes: 0 }).lean();

      if (!clientes.length) {
        Console({
          type: "warn",
          message: "Nenhum cliente ativo encontrado.",
        });
        return {
          status: true,
          message: "Nenhum cliente ativo encontrado.",
          data: [],
        };
      }

      const data = clientes.map((cli) => ({
        ...cli,
        _id: String(cli._id),
      }));

      Console({
        type: "success",
        message: "Clientes ativos encontrados com sucesso!",
      });

      return {
        status: true,
        message: "Clientes ativos encontrados com sucesso!",
        data,
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao buscar clientes ativos.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar clientes ativos.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  ATUALIZAÇÕES PONTUAIS                                                    */
  /* -------------------------------------------------------------------------- */

  async atualizarNumeroWhatsapp(clienteId: string, numeroWhatsapp: string) {
    if (!clienteId) {
      return {
        status: false,
        message: "ID do cliente não fornecido.",
        data: null,
      };
    }

    const numero = numeroWhatsapp?.trim();

    if (!numero) {
      return {
        status: false,
        message: "Número de WhatsApp não fornecido.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Atualizando número de WhatsApp do cliente ${clienteId}...`,
      });

      const updated = await Cliente.findByIdAndUpdate(
        clienteId,
        { $set: { numeroWhatsapp: numero } },
        { new: true }
      ).lean();

      if (!updated) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Número de WhatsApp atualizado com sucesso!",
      });

      return {
        status: true,
        message: "Número de WhatsApp atualizado com sucesso!",
        data: { ...updated, _id: String(updated._id) },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao atualizar número de WhatsApp.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar número de WhatsApp.",
        data: null,
      };
    }
  }

  async atualizarDadosBasicos(
    clienteId: string,
    payload: {
      nome_pes?: string;
      Email_pes?: string;
      cpf_pes?: string;
    }
  ) {
    if (!clienteId) {
      return {
        status: false,
        message: "ID do cliente não fornecido.",
        data: null,
      };
    }

    const { nome_pes, Email_pes, cpf_pes } = payload || {};

    if (!nome_pes && !Email_pes && !cpf_pes) {
      return {
        status: false,
        message: "Nada para atualizar (nome, email ou CPF).",
        data: null,
      };
    }

    const update: any = {};
    if (nome_pes !== undefined) update.nome_pes = nome_pes;
    if (Email_pes !== undefined) update.Email_pes = Email_pes;
    if (cpf_pes !== undefined) update.cpf_pes = cpf_pes;

    try {
      Console({
        type: "log",
        message: `Atualizando dados básicos do cliente ${clienteId}...`,
      });

      const updated = await Cliente.findByIdAndUpdate(
        clienteId,
        { $set: update },
        { new: true }
      ).lean();

      if (!updated) {
        Console({ type: "error", message: "Cliente não encontrado." });
        return {
          status: false,
          message: "Cliente não encontrado.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Dados básicos atualizados com sucesso!",
      });

      return {
        status: true,
        message: "Dados básicos atualizados com sucesso!",
        data: { ...updated, _id: String(updated._id) },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao atualizar dados básicos do cliente.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar dados básicos do cliente.",
        data: null,
      };
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  RELAÇÃO COM ATENDIMENTOS                                                 */
  /* -------------------------------------------------------------------------- */

  /*  async registrarAtendimento(clienteId: string, atendimentoId: string) {
     if (!clienteId) {
       return {
         status: false,
         message: "ID do cliente não fornecido.",
         data: null,
       };
     }

     const atd = atendimentoId?.trim();

     if (!atd) {
       return {
         status: false,
         message: "ID do atendimento não fornecido.",
         data: null,
       };
     }

     try {
       Console({
         type: "log",
         message: `Registrando atendimento ${atd} para cliente ${clienteId}...`,
       });

       const updated = await Cliente.findByIdAndUpdate(
         clienteId,
         { $addToSet: { atendimentos: atd } },
         { new: true }
       ).lean();

       if (!updated) {
         Console({ type: "error", message: "Cliente não encontrado." });
         return {
           status: false,
           message: "Cliente não encontrado.",
           data: null,
         };
       }

       Console({
         type: "success",
         message: "Atendimento registrado com sucesso!",
       });

       return {
         status: true,
         message: "Atendimento registrado com sucesso!",
         data: { ...updated, _id: String(updated._id) },
       };
     } catch (error) {
       Console({
         type: "error",
         message: "Erro ao registrar atendimento.",
       });
       ConsoleData({ type: "error", data: error });
       return {
         status: false,
         message: "Erro ao registrar atendimento.",
         data: null,
       };
     }
   }

   async listarAtendimentos(clienteId: string) {
     if (!clienteId) {
       return {
         status: false,
         message: "ID do cliente não fornecido.",
         data: null,
       };
     }

     try {
       Console({
         type: "log",
         message: `Listando atendimentos do cliente ${clienteId}...`,
       });

       const cliente = await Cliente.findById(clienteId, {
         atendimentos: 1,
       }).lean();

       if (!cliente) {
         Console({ type: "error", message: "Cliente não encontrado." });
         return {
           status: false,
           message: "Cliente não encontrado.",
           data: null,
         };
       }

       const atendimentos = cliente.atendimentos ?? [];

       Console({
         type: "success",
         message: "Atendimentos listados com sucesso!",
       });

       return {
         status: true,
         message: "Atendimentos listados com sucesso!",
         data: atendimentos,
       };
     } catch (error) {
       Console({
         type: "error",
         message: "Erro ao listar atendimentos do cliente.",
       });
       ConsoleData({ type: "error", data: error });
       return {
         status: false,
         message: "Erro ao listar atendimentos do cliente.",
         data: null,
       };
     }
   } */
}
