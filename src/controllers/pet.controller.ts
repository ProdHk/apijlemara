// src/controllers/pet.controller.ts
import { Request, Response } from "express";
import Pet, { PetAnexo, PetType } from "models/Pet";
import Console, { ConsoleData } from "../lib/Console";
import usuarioController from "./usuario.controller";

type ApiResponse<T> = {
  status: boolean;
  message: string;
  data: T | null;
};

export default class PetController {
  /** ========= Helpers ========= */
  private ok<T>(res: Response, message: string, data: T): Response<ApiResponse<T>> {
    return res.status(200).json({ status: true, message, data });
  }

  private fail(res: Response, httpStatus: number, message: string, data: any = null) {
    return res.status(httpStatus).json({ status: false, message, data });
  }

  private async assimilarUsuarios(userId: string) {
    Console({ type: "log", message: "Assimilando usuarios" });

    if (!userId) {
      Console({ type: "error", message: "UserId não identificado" });
      return null;
    }

    try {
      const { data } = await usuarioController.buscarPorId({ userId });

      return {
        userName: data?.nome ?? null,
        userId: data?._id ? String(data._id) : null,
      };
    } catch (error) {
      Console({ type: "error", message: "Erro ao assimilar usuarios" });
      ConsoleData({ type: "error", data: error });
      return null;
    }
  }

  private async anexarUsuarioNosItens(items: PetType[]) {
    const mapped = items.map(async (i) => {
      const usr = await this.assimilarUsuarios(i.responsavel);

      const base = { ...i, _id: String(i._id) };

      if (!usr?.userName) return base;

      return { ...base, ...usr };
    });

    return Promise.all(mapped);
  }

  private async buscarPorTipo(req: Request, res: Response, tipo: PetType["tipo"]) {
    Console({ type: "log", message: `GET /api/pet/${tipo}` });

    try {
      const result = (await Pet.find({ tipo }).lean()) as PetType[];
      const data = await this.anexarUsuarioNosItens(result);

      return this.ok(res, `${tipo} encontrados com sucesso`, data);
    } catch (error) {
      Console({ type: "error", message: `Erro ao buscar tipo ${tipo}` });
      ConsoleData({ type: "error", data: error });
      return this.fail(res, 500, `Algo de errado aconteceu ao tentar buscar ${tipo}`, error);
    }
  }

  /** ========= GETs ========= */
  async buscarIdeias(req: Request, res: Response) {
    return this.buscarPorTipo(req, res, "ideia");
  }

  async buscarMelhorias(req: Request, res: Response) {
    return this.buscarPorTipo(req, res, "melhoria");
  }

  async buscarResumos(req: Request, res: Response) {
    return this.buscarPorTipo(req, res, "resumo");
  }

  async buscarCursos(req: Request, res: Response) {
    return this.buscarPorTipo(req, res, "curso");
  }

  async buscarErrosInternos(req: Request, res: Response) {
    return this.buscarPorTipo(req, res, "erro-interno");
  }

  // Sugestão: rota GET /api/pet/:id
  async buscarId(req: Request, res: Response) {
    Console({ type: "log", message: "GET /api/pet/:id" });

    try {
      const id = String(req.params.id || req.query.id || "");
      if (!id) return this.fail(res, 400, "Id não enviado");

      const result = (await Pet.findById(id).lean()) as PetType | null;
      if (!result) return this.fail(res, 404, "Não encontrado");

      return this.ok(res, "Encontrado com sucesso", { ...result, _id: String(result._id) });
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar por id" });
      ConsoleData({ type: "error", data: error });
      return this.fail(res, 500, "Algo de errado aconteceu ao tentar buscar", error);
    }
  }

  async buscarPorUsuario(req: Request, res: Response) {
    Console({ type: "log", message: "GET /api/pet/buscar/usuario" });

    try {
      const userId = String(req.body?.userId || req.query?.userId || "");
      if (!userId) return this.fail(res, 400, "UserId não enviado");

      const result = (await Pet.find({ responsavel: userId }).lean()) as PetType[];
      const response = result.map((i) => ({ ...i, _id: String(i._id) }));

      return this.ok(res, "Encontrado com sucesso", response);
    } catch (error) {
      Console({ type: "error", message: "Erro ao buscar por usuario" });
      ConsoleData({ type: "error", data: error });
      return this.fail(res, 500, "Algo de errado aconteceu ao tentar buscar", error);
    }
  }

  /** ========= POSTs ========= */
  async pontuar(req: Request, res: Response) {
    Console({ type: "log", message: "POST /api/pet/pontuar" });

    try {
      const { id, pontuacao, status, petImplantacao } = req.body;

      if (!id || pontuacao === undefined || !status || !petImplantacao) {
        return this.fail(res, 400, "Itens necessários não enviados");
      }

      const updatedItem = await Pet.findByIdAndUpdate(
        id,
        { pontuacao, status, petImplantacao },
        { new: true }
      ).lean();

      if (!updatedItem) return this.fail(res, 404, "Item não encontrado");

      return this.ok(res, "Pontuado com sucesso", { ...updatedItem, _id: String(updatedItem._id) });
    } catch (error) {
      Console({ type: "error", message: "Erro ao pontuar" });
      ConsoleData({ type: "error", data: error });
      return this.fail(res, 500, "Algo de errado aconteceu ao tentar pontuar", error);
    }
  }

  async cadastrar(req: Request, res: Response) {
    Console({ type: "log", message: "POST /api/pet/cadastrar" });

    try {
      const item = req.body as PetType;

      // ✅ corrigido (antes estava invertido)
      if (!item || !item.responsavel) {
        return this.fail(res, 400, "Item e/ou responsável não enviados");
      }

      const responsavel = await this.assimilarUsuarios(item.responsavel);

      Console({
        type: "log",
        message: `Cadastrando ${item.tipo ?? "pet"} do usuario ${responsavel?.userName ?? item.responsavel}`,
      });

      const newItem = (await Pet.create(item)) as PetType;

      return this.ok(res, "Cadastrado com sucesso", { ...newItem, _id: String(newItem._id) });
    } catch (error) {
      Console({ type: "error", message: "Erro ao cadastrar" });
      ConsoleData({ type: "error", data: error });
      return this.fail(res, 500, "Algo de errado aconteceu ao tentar cadastrar", error);
    }
  }

  async adicionarAnexo(req: Request, res: Response) {
    Console({ type: "log", message: "POST /api/pet/adicionar/anexo" });

    try {
      // ✅ payload simples e claro
      const { itemId, anexo } = req.body as { itemId: string; anexo: PetAnexo };

      if (!itemId) return this.fail(res, 400, "itemId não enviado");
      if (!anexo) return this.fail(res, 400, "anexo não enviado");
      if (!anexo.tipo || !anexo.titulo || !anexo.descricao || !anexo.responsavel) {
        return this.fail(res, 400, "Campos obrigatórios do anexo não enviados");
      }

      Console({
        type: "log",
        message: `Adicionando anexo tipo ${anexo.tipo} do usuario ${anexo.responsavel}`,
      });

      // ✅ campo correto: "anexos"
      const updated = await Pet.findByIdAndUpdate(
        itemId,
        { $push: { anexos: anexo } },
        { new: true }
      ).lean();

      if (!updated) return this.fail(res, 404, "Item não encontrado");

      return this.ok(res, "Anexo adicionado com sucesso", { ...updated, _id: String(updated._id) });
    } catch (error) {
      Console({ type: "error", message: "Erro ao adicionar anexo" });
      ConsoleData({ type: "error", data: error });
      return this.fail(res, 500, "Algo de errado aconteceu ao tentar adicionar anexo", error);
    }
  }
}
