import Console, { ConsoleData } from "lib/Console";
import Obra, {
  FotosType,
  InfoSiteType,
  InfraestruturaType,
  ObraType,
} from "models/Obra";

interface ResponseUauApi {
  Cod_obr?: string;
  Empresa_obr?: number;
  Descr_obr?: string;
  Status_obr?: number;
  Ender_obr?: string;
  Fone_obr?: string;
  Fisc_obr?: string;
  DtIni_obr?: string;
  Dtfim_obr?: string;
  TipoObra_obr?: number;
  EnderEntr_obr?: string;
  CEI_obr?: string | null;
  DataCad_obr?: string;
  DataAlt_obr?: string;
  UsrCad_obr?: string;
}

export default class ObraController {
  async cadastrar(payload: ResponseUauApi) {

    if (!payload) {
      Console({ type: "error", message: "Payload vazio." });
      return {
        status: false,
        message: "Payload vazio.",
        data: null,
      };
    }

    const codObra = payload.Cod_obr?.trim();

    if (!codObra) {
      Console({
        type: "error",
        message: "O código da obra é obrigatório.",
      });
      return {
        status: false,
        message: "O código da obra é obrigatório.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: `Cadastrando/atualizando obra ${codObra}...`,
      });

      const obra = await Obra.findOneAndUpdate(
        { Cod_obr: codObra },
        {
          $set: {
            ...payload,
            Cod_obr: codObra,
          },
        },
        {
          upsert: true,
          new: true,
        }
      ).lean();

      if (!obra) {
        Console({
          type: "error",
          message: "Erro ao cadastrar obra.",
        });
        return {
          status: false,
          message: "Erro ao cadastrar obra.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Obra cadastrada com sucesso!",
      });

      return {
        status: true,
        message: "Obra cadastrada com sucesso!",
        data: {
          ...obra,
          _id: String(obra._id),
        } as ObraType,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao cadastrar obra." });
      ConsoleData({ type: "error", data: error });

      return {
        status: false,
        message: "Erro ao cadastrar obra.",
        data: null,
      };
    }
  }

  async sincronizarErp({
    obraId,
    payload,
  }: {
    obraId?: string;
    payload: ResponseUauApi;
  }) {
    if (!payload) {
      Console({ type: "error", message: "Payload vazio." });
      return {
        status: false,
        message: "Payload vazio.",
        data: null,
      };
    }

    try {
      if (obraId) {
        Console({
          type: "log",
          message: `Sincronizando obra (por _id) ${obraId}...`,
        });

        const obra = await Obra.findByIdAndUpdate(
          obraId,
          { $set: payload },
          { new: true }
        ).lean();

        if (!obra) {
          Console({
            type: "error",
            message: "Obra não encontrada.",
          });
          return {
            status: false,
            message: "Obra não encontrada.",
            data: null,
          };
        }

        Console({
          type: "success",
          message: "Obra sincronizada com sucesso!",
        });

        return {
          status: true,
          message: "Obra sincronizada com sucesso!",
          data: { ...obra, _id: String(obra._id) },
        };
      }

      // sem obraId → segue o fluxo padrão de cadastro/sync por Cod_obr
      Console({
        type: "log",
        message: "Sincronizando obra (sem _id, via Cod_obr)...",
      });

      const result = await this.cadastrar(payload);

      if (!result.status || !result.data) {
        return result;
      }

      return {
        status: true,
        message: "Obra sincronizada com sucesso!",
        data: {
          ...result.data,
          _id: String(result.data._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao sincronizar obra." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao sincronizar obra.",
        data: null,
      };
    }
  }

  async sincronizarListaErp(payload: ResponseUauApi[]) {
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
        message: `Sincronizando lista de obras (${total})...`,
      });

      for (const obr of payload) {
        const cod = obr.Cod_obr?.trim();

        if (!cod) {
          Console({
            type: "warn",
            message: "Código da obra vazio, ignorando registro.",
          });
          fail++;
          continue;
        }

        try {
          const result = await this.cadastrar({
            ...obr,
            Cod_obr: cod,
          });

          if (!result.status) {
            fail++;
            Console({
              type: "warn",
              message: `Falha ao sincronizar obra ${cod}: ${result.message}`,
            });
            continue;
          }

          Console({
            type: "success",
            message: `Obra ${cod} sincronizada com sucesso!`,
          });
          success++;
        } catch (err) {
          fail++;
          Console({
            type: "error",
            message: `Erro ao sincronizar obra ${cod}.`,
          });
          ConsoleData({ type: "error", data: err });
        }
      }

      const message = `Total de obras sincronizadas: ${success} de ${total}, ${fail} falhas.`;
      Console({ type: "success", message });

      return {
        status: true,
        message,
        data: { total, success, fail },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao sincronizar obras.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao sincronizar obras.",
        data: null,
      };
    }
  }

  async buscarPorId(obraId: string) {
    if (!obraId) {
      return {
        status: false,
        message: "ID da obra não fornecido.",
        data: null,
      };
    }
    try {
      Console({ type: "log", message: `Buscando obra ${obraId}...` });

      const obra = await Obra.findById(obraId).lean();

      if (!obra) {
        Console({ type: "error", message: "Obra não encontrada." });
        return {
          status: false,
          message: "Obra não encontrada.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Obra encontrada com sucesso!",
      });

      return {
        status: true,
        message: "Obra encontrado com sucesso!",
        data: {
          ...obra,
          _id: String(obra._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar obra." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar obra.",
        data: null,
      };
    }
  }

  async buscarPorCodigoErp(codErp: string) {
    const codigo = codErp?.trim();

    if (!codigo) {
      return {
        status: false,
        message: "Código da obra não fornecido.",
        data: null,
      };
    }
    try {
      Console({
        type: "log",
        message: `Buscando obra (Cod_obr) ${codigo}...`,
      });

      const obra = await Obra.findOne({ Cod_obr: codigo }).lean();

      if (!obra) {
        Console({ type: "error", message: "Obra não encontrada." });
        return {
          status: false,
          message: "Obra não encontrada.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Obra encontrada com sucesso!",
      });

      return {
        status: true,
        message: "Obra encontrada com sucesso!",
        data: {
          ...obra,
          _id: String(obra._id),
        },
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar obra." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar obra.",
        data: null,
      };
    }
  }

  async buscarPublicasSite() {
    try {
      Console({ type: "log", message: "Buscando obras públicas..." });
      const obras = await Obra.find({ publico: true }).lean();

      if (!obras.length) {
        Console({
          type: "warn",
          message: "Nenhuma obra pública encontrada.",
        });
        return {
          status: true,
          message: "Nenhuma obra pública encontrada.",
          data: [],
        };
      }

      Console({
        type: "success",
        message: "Obras públicas encontradas com sucesso!",
      });

      const data = obras.map((obra) => ({
        ...obra,
        _id: String(obra._id),
      }));

      return {
        status: true,
        message: "Obras públicas encontradas com sucesso!",
        data,
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao buscar obras públicas.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar obras públicas.",
        data: null,
      };
    }
  }

  async listarTodas() {
    try {
      Console({ type: "log", message: "Buscando todas as obras..." });
      const obras = await Obra.find().lean();

      if (!obras.length) {
        Console({
          type: "warn",
          message: "Nenhuma obra encontrada.",
        });
        return {
          status: true,
          message: "Nenhuma obra encontrada.",
          data: [],
        };
      }

      Console({
        type: "success",
        message: "Obras encontradas com sucesso!",
      });

      const data = obras.map((obra) => ({
        ...obra,
        _id: String(obra._id),
      }));

      return {
        status: true,
        message: "Obras encontradas com sucesso!",
        data,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar obras." });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao buscar obras.",
        data: null,
      };
    }
  }

  async atualizarInfraestrutura(
    payload: InfraestruturaType,
    obraId: string
  ) {
    if (!obraId) {
      Console({
        type: "error",
        message: "ID da obra não fornecido.",
      });
      return {
        status: false,
        message: "ID da obra não fornecido.",
        data: null,
      };
    }
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
        message: "Atualizando infraestrutura da obra...",
      });

      const updated = await Obra.findByIdAndUpdate(
        obraId,
        { $set: { infraestrutura: payload } },
        { new: true }
      ).lean();

      if (!updated) {
        Console({
          type: "error",
          message: "Obra não encontrada.",
        });
        return {
          status: false,
          message: "Obra não encontrada.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Infraestrutura atualizada com sucesso!",
      });

      return {
        status: true,
        message: "Infraestrutura atualizada com sucesso!",
        data: { ...updated, _id: String(updated._id) },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao atualizar infraestrutura.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar infraestrutura.",
        data: null,
      };
    }
  }

  async atualizarInfoSite(obraId: string, payload: InfoSiteType) {
    if (!obraId) {
      Console({
        type: "error",
        message: "ID da obra não fornecido.",
      });
      return {
        status: false,
        message: "ID da obra não fornecido.",
        data: null,
      };
    }
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
        message: "Atualizando infoSite da obra...",
      });

      const updated = await Obra.findByIdAndUpdate(
        obraId,
        { $set: { infoSite: payload } },
        { new: true }
      ).lean();

      if (!updated) {
        Console({
          type: "error",
          message: "Obra não encontrada.",
        });
        return {
          status: false,
          message: "Obra não encontrada.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "InfoSite atualizada com sucesso!",
      });

      return {
        status: true,
        message: "InfoSite atualizada com sucesso!",
        data: { ...updated, _id: String(updated._id) },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao atualizar infoSite.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar infoSite.",
        data: null,
      };
    }
  }

  async atualizarLocalizacao(
    obraId: string,
    lat: string,
    lng: string,
    linkMaps?: string
  ) {
    if (!obraId) {
      Console({
        type: "error",
        message: "ID da obra não fornecido.",
      });
      return {
        status: false,
        message: "ID da obra não fornecido.",
        data: null,
      };
    }

    if (!lat || !lng) {
      Console({
        type: "error",
        message: "Latitude e longitude são obrigatórias.",
      });
      return {
        status: false,
        message: "Latitude e longitude são obrigatórias.",
        data: null,
      };
    }

    try {
      Console({
        type: "log",
        message: "Atualizando localização da obra...",
      });

      const payload = {
        lat,
        lng,
        linkMaps: linkMaps ?? "",
      };

      const updated = await Obra.findByIdAndUpdate(
        obraId,
        { $set: payload },
        { new: true }
      ).lean();

      if (!updated) {
        Console({
          type: "error",
          message: "Obra não encontrada.",
        });
        return {
          status: false,
          message: "Obra não encontrada.",
          data: null,
        };
      }

      Console({
        type: "success",
        message: "Localização atualizada com sucesso!",
      });

      return {
        status: true,
        message: "Localização atualizada com sucesso!",
        data: { ...updated, _id: String(updated._id) },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao atualizar localização.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao atualizar localização.",
        data: null,
      };
    }
  }

  async adicionarFotos(obraId: string, fotos: FotosType[]) {
    if (!obraId) {
      Console({
        type: "error",
        message: "ID da obra não fornecido.",
      });
      return {
        status: false,
        message: "ID da obra não fornecido.",
        data: null,
      };
    }

    if (!Array.isArray(fotos) || !fotos.length) {
      Console({
        type: "error",
        message: "Nenhuma foto válida enviada.",
      });
      return {
        status: false,
        message: "Nenhuma foto válida enviada.",
        data: null,
      };
    }

    Console({
      type: "log",
      message: `Adicionando ${fotos.length} fotos na obra ${obraId}...`,
    });

    try {
      const updated = await Obra.findByIdAndUpdate(
        obraId,
        {
          // evita duplicação por objeto idêntico
          $addToSet: { fotos: { $each: fotos } },
        },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) {
        Console({
          type: "error",
          message: "Obra não encontrada para adicionar fotos.",
        });
        return {
          status: false,
          message: "Obra não encontrada para adicionar fotos.",
          data: null,
        };
      }

      const totalFotos = Array.isArray(updated.fotos)
        ? updated.fotos.length
        : 0;

      Console({
        type: "success",
        message: `Fotos adicionadas na obra ${obraId}. Total agora: ${totalFotos}.`,
      });

      return {
        status: true,
        message: "Fotos adicionadas com sucesso!",
        data: {
          ...updated,
          _id: String(updated._id),
          totalFotos,
        },
      };
    } catch (error) {
      Console({
        type: "error",
        message: "Erro ao adicionar fotos na obra.",
      });
      ConsoleData({ type: "error", data: error });
      return {
        status: false,
        message: "Erro ao adicionar fotos na obra.",
        data: null,
      };
    }
  }

  async listarComUnidadesDisponiveis() {
    Console({
      type: "log",
      message: "Buscando obras com unidades disponíveis (TODO)...",
    });

    // quando tiver o model Unidade, a ideia é:
    // - fazer aggregate ou lookup ligando Obra <- Unidade
    // - filtrar unidades com status "DISPONÍVEL"
    // - retornar uma lista de obras com contagem de unidades disponíveis
    return {
      status: false,
      message:
        "Funcionalidade ainda não implementada. Aguardar integração com model Unidade.",
      data: null,
    };
  }
}
