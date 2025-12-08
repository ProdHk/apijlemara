import Console, { ConsoleData } from "lib/Console";
import Obra, { ObraType } from "models/Obra";

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
            Console({ type: "log", message: `Cadastrando/atualizando obra ${codObra}...` });

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
                Console({ type: "error", message: "Erro ao cadastrar obra." });
                return {
                    status: false,
                    message: "Erro ao cadastrar obra.",
                    data: null,
                };
            }

            Console({ type: "success", message: "Obra cadastrada com sucesso!" });

            return {
                status: true,
                message: "Obra cadastrada com sucesso!",
                data: {
                    ...obra,
                    _id: String(obra._id),
                },
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
    async buscarPorId(obraId: String) {
        if (!obraId) {
            return {
                status: false,
                message: "ID da obra nao fornecido.",
                data: null,
            };
        }
        try {
            Console({ type: "log", message: `Buscando obra ${obraId}...` });
            const obra = await Obra.findById(obraId).lean();

            if (!obra) {
                Console({ type: "error", message: "Obra nao encontrada." });
                return {
                    status: false,
                    message: "Obra nao encontrada.",
                    data: null,
                };
            }

            Console({ type: "success", message: "Obra encontrada com sucesso!" });

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
    async buscarPorCodigoErp(codErp: String) {
        if (!codErp) {
            return {
                status: false,
                message: "Codigo da obra nao fornecido.",
                data: null,
            };
        }
        try {
            Console({ type: "log", message: `Buscando obra ${codErp}...` });
            const obra = await Obra.findOne({ Cod_obr: codErp }).lean();

            if (!obra) {
                Console({ type: "error", message: "Obra nao encontrada." });
                return {
                    status: false,
                    message: "Obra nao encontrada.",
                    data: null,
                };
            }

            Console({ type: "success", message: "Obra encontrada com sucesso!" });

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
            Console({ type: "log", message: `Buscando obras publicas...` });
            const obras = await Obra.find({ publico: true }).lean();

            if (!obras) {
                Console({ type: "error", message: "Obras nao encontradas." });
                return {
                    status: false,
                    message: "Obras nao encontradas.",
                    data: null,
                };
            }

            Console({ type: "success", message: "Obras encontradas com sucesso!" });

            return {
                status: true,
                message: "Obras encontradas com sucesso!",
                data: obras,
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
    async listarTodas() {
        try {
            Console({ type: "log", message: `Buscando obras...` });
            const obras = await Obra.find().lean();

            if (!obras) {
                Console({ type: "error", message: "Obras nao encontradas." });
                return {
                    status: false,
                    message: "Obras nao encontradas.",
                    data: null,
                };
            }

            Console({ type: "success", message: "Obras encontradas com sucesso!" });

            return {
                status: true,
                message: "Obras encontradas com sucesso!",
                data: obras,
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

    listarPublicas() { }
    listarAtivas() { }
    listarParaSite() { }
    listarParaPortalCorretores() { }

    atualizarInfraestrutura() { }
    atualizarInfoSite() { }
    atualizarLocalizacao() { } // lat, lng, linkMaps

    adicionarFoto() { }
    atualizarFoto() { }
    removerFoto() { }
    reordenarFotos() { }

    sincronizarUmaDaErp() { }
    sincronizarListaDaErp() { }

    buscarResumoParaAtendimento() { }

    listarComUnidadesDisponiveis() { }
}
