// src/controllers/UauController.ts
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import Console from "../lib/Console";
import { PessoaUauRequest } from "types/uauTypes";

/* -------------------------------------------------------------------------- */
/* Types (mínimos, sem inflar)                                                */
/* -------------------------------------------------------------------------- */

type UauTableResponse<T> =
  | T
  | T[]
  | Array<Record<string, any>>; // UAU às vezes devolve estruturas bem soltas

type PessoaUAU = {
  cod_pes: number;
  nome_pes: string;
  tipo_pes: number;
  cpf_pes: string;
  dtcad_pes: string;
  dtnasc_pes: string;
  IntExt_pes: number;
  UsrCad_pes: string;
  UsrAlt_pes: string;
  Status_pes: number;
  Tratamento_pes: string;
  Email_pes: string;
  EndWWW_pes: string;
  Matricula_Pes: string | null;
  Empreendimento_Pes: string | null;
  ForCli_Pes: string | null;
  Aval_Prod_Serv_Pes: string | null;
  Atd_Entrega_Pes: string | null;
  AtInat_pes: number;
  DataAlt_pes: string;
  NomeFant_Pes: string;
  Anexos_pes: number;
  InscrMunic_pes: string;
  inscrest_pes: string;
  Login_pes: string;
  Senha_pes: string;
  CNAE_pes: string | null;
  DataCadPortal_pes: string;
  CadastradoPrefeituraGyn_pes: boolean;
  HabilitadoRiscoSacado_pes: boolean;
  CEI_Pes: string | null;
  IntegradoEDI_pes: string | null;
  BloqueioLgpd_Pes: number;
};

type TelefoneUAU = { Telefone: string; DDD: string; Complemento: string; Tipo: number };

type UnidadePessoaUAU = {
  Empresa: number;
  DescricaoEmpresa: string;
  Obra: string;
  DescricaoObra: string;
  Venda: number;
  Produto: number;
  DescricaoProduto: string;
  Identificador: string;
};

type BoletoClienteUAU = {
  dataEmissao: string;
  valorDocumento: number;
  codBanco: number;
  seuNumero: number;
  dataVencimento: string;
  localPgto: string;
  linhaDigitavel: string;
  dataGeracao: string;
  agCodCedente: string;
  nossoNumero: string;
  instrucao: string;
  carteira: string;
  campoLivre: string;
  nomeBanco: string;
  descricaoEmpresa: string;
  descricaoObra: string;
  codEmpresa: number;
  obraParcela: string;
  numeroVenda: number;
  dataEnvioPorEmail: string | null;
  dataReenvioPorEmail: string | null;
  boletoEnviado: string;
};

type BoletoReimpressaoUAU = {
  DataEmis_Bol: string;
  ValDoc_Bol: number;
  Banco_Bol: number;
  SeuNum_Bol: number;
  DataVenc_bol: string;
  LocalPgto_Bol: string;
  LinhaDigitavel_Bol: string;
  DataGera_Bol: string;
  AgCodCed_Bol: string;
  DataGera_Bol1: string;
  NossoNum_Bol: string;
  Instrucao_Bol: string;
  Carteira_Bol: string;
  CampoLivre_Bol: string;
  Nome_banco: string;
  Desc_emp: string;
  Descr_obr: string;
  Empresa_rea: number;
  ObraPrc_Rea: string;
  NumVendPrc_Rea: number;
  DataEnvioPorEmail_bol: string | null;
  DataReenvioPorEmail_bol: string | null;
  BoletoEnviado: string;
};

type UnidadeEspelhoUAU = {
  Empresa_unid: number;
  Prod_unid: number;
  NumPer_unid: number;
  Obra_unid: string;
  Qtde_unid: number;
  Vendido_unid: number;
  Codigo_Unid: string;
  PorcentPr_Unid: number;
  C1_unid: string;
  C2_unid: string;
  C3_unid: string;
  C4_unid: string;
  C5_unid: string | "null";
  C6_unid: string | "null";
  C7_unid: string | "null";
  C8_unid: string | "null";
  C9_unid: string | "null";
  C10_unid: string | "null";
  C11_unid: string | "null";
  C12_unid: string | "null";
  C13_unid: string | "null";
  C14_unid: string | "null";
  C15_unid: string | "null";
  C16_unid: string | "null";
  C17_unid: string | "null";
  C18_unid: string | "null";
  C19_unid: string | "null";
  C20_unid: string | "null";
  C21_unid: string | "null";
  C22_unid: string | "null";
  C23_unid: string | "null";
  C24_unid: string | "null";
  C25_unid: string | "null";
  C26_unid: string | "null";
  C27_unid: string | "null";
  C28_unid: string | "null";
  C29_unid: string | "null";
  C30_unid: string | "null";
  C31_unid: string | "null";
  C32_unid: string | "null";
  C33_unid: string | "null";
  C34_unid: string | "null";
  C35_unid: string | "null";
  C36_unid: string | "null";
  C37_unid: string | "null";
  C38_unid: string | "null";
  C39_unid: string | "null";
  C40_unid: string | "null";
  C41_unid: string | "null";
  C42_unid: string | "null";
  C43_unid: string | "null";
  C44_unid: string | "null";
  C45_unid: string | "null";
  anexos_unid: number;
  Identificador_unid: string;
  UsrCad_unid: string;
  DataCad_unid: string;
  ValPreco_unid: number;
  FracaoIdeal_unid: string | "null";
  NumObe_unid: string | "null";
  ObjEspelhoTop_unid: string | "null";
  ObjEspelhoLeft_unid: string | "null";
  PorcentComissao_unid: string | "null";
  CodTipProd_unid: string | "null";
  NumCategStatus_unid: number;
  FracaoIdealDecimal_unid: string | "null";
  DataEntregaChaves_unid: string | "null";
  DataReconhecimentoReceitaMapa_unid: string | "null";
  UnidadeVendidaDacao_unid: string | "null";
  Num_Ven: string | "null";
};

type UnidadePorChaveUAU = {
  empresaPersonalizacao: number;
  produtoPersonalizacao: number;
  numeroPersonalizacao: number;
  obraPersonalizacao: string;
  quantidadePersonalizacao: number;
  Vendido: number;
  codigoPersonalizacao: string | null;
  porcentagemPersonalizacao: number;
  campoPersonalizado1: string;
  campoPersonalizado2: string;
  campoPersonalizado3: string;
  campoPersonalizado4: string;
  campoPersonalizado5: string;
  campoPersonalizado6: string;
  campoPersonalizado7: string;
  campoPersonalizado8: string | null;
  campoPersonalizado9: string | null;
  campoPersonalizado10: string | null;
  campoPersonalizado11: string | null;
  campoPersonalizado12: string | null;
  campoPersonalizado13: string | null;
  campoPersonalizado14: string | null;
  campoPersonalizado15: string | null;
  campoPersonalizado16: string | null;
  campoPersonalizado17: string | null;
  campoPersonalizado18: string | null;
  campoPersonalizado19: string | null;
  campoPersonalizado20: string | null;
  campoPersonalizado21: string | null;
  campoPersonalizado22: string | null;
  campoPersonalizado23: string | null;
  campoPersonalizado24: string | null;
  campoPersonalizado25: string | null;
  campoPersonalizado26: string | null;
  campoPersonalizado27: string | null;
  campoPersonalizado28: string | null;
  campoPersonalizado29: string | null;
  campoPersonalizado30: string | null;
  campoPersonalizado31: string | null;
  campoPersonalizado32: string | null;
  campoPersonalizado33: string | null;
  campoPersonalizado34: string | null;
  campoPersonalizado35: string | null;
  campoPersonalizado36: string | null;
  campoPersonalizado37: string | null;
  campoPersonalizado38: string | null;
  campoPersonalizado39: string | null;
  campoPersonalizado40: string | null;
  campoPersonalizado41: string | null;
  campoPersonalizado42: string | null;
  campoPersonalizado43: string | null;
  campoPersonalizado44: string | null;
  campoPersonalizado45: string | null;
  Anexos: number;
  Identificador: string;
  usuarioCadastrou: string;
  dataCadastro: string;
  valorPreco: number | null;
  fracaoIdeal: number;
  numeroObjeto: number;
  objetoEspelhoTop: number | null;
  objetoEspelhoLeft: number | null;
  porcentagemComissao: number | null;
  codigoTipoProduto: number | null;
  numeroCategoriaStatus: number | null;
  dataEntregaChaves: string | null;
};

type ObraUAU = {
  cod_obr: string;
  Fisc_obr: string;
  descr_obr: string;
  ender_obr: string;
  setor_obr: string;
  cid_obr: string;
  uf_obr: string;
  cep_obr: string;
  dtini_obr: string;
  dtfim_obr: string;
  status_obr: number;
  fone_obr: string;
  fax_obr: string;
  CodGrupo_obr: string;
  TipoObra_obr: number;
  FiscRec_obr: string;
  enderEntr_obr: string;
  setorEntr_obr: string;
  cidEntr_obr: string;
  ufEntr_obr: string;
  cepEntr_obr: string;
  TipoOC_obr: number;
  EmpPaga_obr: string | "null";
  EmpFatura_obr: string | "null";
  CodObrNet_obr: string;
  CodCentroCustoNet_obr: string;
  CodEnderEntregaNet_obr: string;
  CodRegiaoNet_obr: string;
  DataCad_obr: string;
  UsrCad_obr: string;
  DataAlt_obr: string;
  UsrAlt_obr: string;
  Anexos_obr: number;
  CarenciaAtraso_obr: number;
  Multa_obr: number;
  Juros_obr: number;
  JurosContrato_obr: number;
  CorrecaoAtr_obr: number;
  TipoUtilFis_Obr: number;
  TipoUtilFin_Obr: number;
  FoneEntr_obr: string;
  FaxEntr_obr: string;
  MesReplanejar_obr: string | "null";
  ContaPlc_obr: string | "null";
  ContaBanco_obr: string | "null";
  NumeroBanco_obr: string | "null";
  Carteira_obr: string | "null";
  LotacaoFolha_obr: string;
  CEI_obr: string;
  NumCid_obr: string | "null";
  NumCidEntr_obr: string | "null";
  PorcTolEntrega_obr: number;
  ContaBancoPg_obr: string | "null";
  NumeroBancoPg_obr: string | "null";
  Empresa_obr: number;
  NumeroBancoAdm_obr: string | "null";
  ContaBancoAdm_obr: string | "null";
  CarteiraAdm_obr: string | "null";
  ValidaFeriado_Obr: number;
  NumSet_obr: string | "null";
  NumContEmpree_obr: string | "null";
  NumEmpree_obr: string | "null";
  ReajusteAnual_obr: number;
  DataLancamento_obr: string | "null";
  NumCreci_obr: number;
  TipoCreci_obr: string;
  FimAnuncio_obr: string;
  DiaUtil_Obr: boolean;
  EmpresaIntermediadora_Obr: string | "null";
  EmpSet_obr: string | "null";
  CustoDesembolso_Obr: boolean;
  DDDFone_Obr: string;
  DDDFoneEntr_Obr: string;
  DDDFax_Obr: string;
  DDDFaxEnt_Obr: string;
  BoletoDetalhado_obr: boolean;
  PorcTxAdm_Obr: number;
  FecharMesAutomatico_obr: boolean;
  TipoCaucaoTxAdm_Obr: boolean;
  CaucaoTxAdm_Obr: number;
  ImpostosTxAdm_Obr: number;
  NumPcbObra_obr: number;
  NumPcbAdm_obr: number;
  NumPcbAvulso_obr: number;
  AtInat_obr: boolean;
  TipoTxAdm_Obr: boolean;
  ApropriarCustoDtPgto_Obr: boolean;
  ProcessoPago_Obr: boolean;
  NumeroBancoBI_obr: string | "null";
  ContaBi_obr: string | "null";
  PorcTotPrecoUnit_Obr: number;
  ApontSiAplic_obr: boolean;
  ControlaEstornoPL_obr: boolean;
  FiscFolha_obr: string;
  ParcCustaAdm_obr: boolean;
  ConvenioBancoPg_obr: string | "null";
  controlaValorLimite_obr: boolean;
  PorcInadimp_obr: number;
  ControleSolicitacao_obr: boolean;
  ObraTipoDepart_Obr: boolean;
  CodGrupoContabil_obr: string | "null";
  ControlaServExterno_obr: number;
  MaxParcelamento_obr: number;
  ModalidadesCartao_obr: string;
  fiscControleFin_obr: string;
  CodPesObra_obr: number;
  PorcTotPrecoUnitReducao_Obr: number;
  NumPcbAvulsoPIX_obr: string | "null";
};


/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v || !String(v).trim()) throw new Error(`Variável de ambiente ausente: ${key}`);
  return String(v).trim();
}

/** Remove “linha header” padrão da UAU: [0]=header, [1..]=dados */
function stripHeaderRow<T>(arr: any): T[] {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= 1) return [];
  return arr.slice(1) as T[];
}

/** Pega “primeiro item útil” de uma tabela UAU */
function firstDataRow<T>(arr: any): T | null {
  const rows = stripHeaderRow<T>(arr);
  return rows.length ? rows[0] : null;
}

function isAuthPath(url?: string) {
  return String(url ?? "").includes("/Autenticador/AutenticarUsuario");
}

function formatAxiosError(err: unknown) {
  const e = err as AxiosError<any>;
  const status = e?.response?.status;
  const data = e?.response?.data;
  const message = e?.message || "Erro desconhecido";
  return { status, message, data };
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class UauController {
  public readonly uauapi: AxiosInstance;

  private token: string | null = null;
  private tokenPromise: Promise<string> | null = null;

  private readonly baseURL: string;
  private readonly integrationToken: string;
  private readonly login: string;
  private readonly password: string;

  constructor() {
    this.baseURL = this.getUrlBase();
    this.integrationToken = envOrThrow("UAU_API_TOKEN");
    this.login = envOrThrow("UAU_USER_LOGIN");
    this.password = envOrThrow("UAU_USER_PASSWORD");

    this.uauapi = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-INTEGRATION-Authorization": this.integrationToken,
      },
      timeout: 60_000,
    });

    // injeta Authorization (token da UAU) em TODAS as próximas requests (exceto autenticação)
    this.uauapi.interceptors.request.use(async (config) => {
      if (isAuthPath(config.url)) return config;
      if (config.headers?.Authorization) return config;

      const token = await this.getToken();
      config.headers = config.headers ?? {};
      config.headers.Authorization = token; // se precisar Bearer, troque aqui
      return config;
    });

    // em 401/403, zera token para próxima request reautenticar
    this.uauapi.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = (err as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          this.token = null;
          this.tokenPromise = null;
        }
        throw err;
      }
    );
  }

  private getUrlBase(): string {
    const raw = process.env.UAU_API_URL_BASE || process.env.UAU_API_IP;
    if (!raw || !raw.trim()) {
      throw new Error("URL base da UAU ausente. Defina UAU_API_URL_BASE (ou UAU_API_IP) no .env");
    }
    let base = raw.trim();
    if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
    return base.replace(/\/+$/, "");
  }

  /** Evita “tempestade” de login com tokenPromise */
  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    if (this.tokenPromise) return this.tokenPromise;

    this.tokenPromise = (async () => {
      const body = { Login: this.login, Senha: this.password, UsuarioUAUSite: "ICD" };

      try {
        // IMPORTANTE: aqui usamos this.uauapi mesmo, mas o interceptor ignora esse path (sem loop)
        const { data } = await this.uauapi.post("/Autenticador/AutenticarUsuario", body);
        const t = this.normalizeToken(data);
        this.token = t;
        return t;
      } catch (err) {
        const info = formatAxiosError(err);
        Console({ type: "error", message: `UAU auth error (${info.status}): ${info.message}` });
        // se quiser ver o body em dev:
        // console.log("UAU auth error body:", info.data);
        throw err;
      } finally {
        this.tokenPromise = null;
      }
    })();

    return this.tokenPromise;
  }

  private normalizeToken(data: any): string {
    const token =
      (typeof data === "string" && data) ||
      data?.Token ||
      data?.token ||
      data?.access_token ||
      data?.data?.Token ||
      data?.data?.token;

    if (!token) throw new Error("Token não encontrado no response da UAU.");
    return String(token);
  }

  /** wrapper simples: log + erro padronizado */
  private async post<T = any>(path: string, body?: any, config?: AxiosRequestConfig) {
    try {
      return await this.uauapi.post<T>(path, body ?? {}, config);
    } catch (err) {
      const info = formatAxiosError(err);
      Console({ type: "error", message: `UAU POST ${path} (${info.status}): ${info.message}` });
      // console.log("UAU error body:", info.data);
      throw err;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* CLIENTES                                                                 */
  /* ------------------------------------------------------------------------ */


  async buscarClientesCadastrados(): Promise<PessoaUauRequest[]> {
    Console({ type: "log", message: `Buscando clientes` });
    console.time("tempo busca")
    const path = "/Pessoas/ConsultarPessoasPorCondicao";
    const body = { condicaoConsultarPessoa: "nome_pes LIKE '%%'" };

    const { data } = await this.post<any>(path, body);


    const pessoasTable = data
    console.log(pessoasTable)
    console.timeEnd("tempo busca")
    return pessoasTable;
  }
  async buscarClientePorCpf(cpfCnpj: string): Promise<PessoaUAU> {
    Console({ type: "log", message: `Buscando cliente cpf/cnpj ${cpfCnpj}` });

    const path = "/Pessoas/ConsultarPessoasPorCPFCNPJ";
    const body = { cpf_cnpj: cpfCnpj, status: 2 };

    const { data } = await this.post<any>(path, body);

    /**
     * Seu código antigo fazia: data[0].Pessoas[1]
     * Isso é frágil: se vier vazio ou mudar a posição, quebra silencioso.
     * Aqui: pegamos a primeira “linha útil” de Pessoas.
     */
    const pessoasTable = data?.[0]?.Pessoas;
    const pessoa = firstDataRow<PessoaUAU>(pessoasTable);

    if (!pessoa) {
      throw new Error(`Nenhum cliente encontrado para ${cpfCnpj}`);
    }

    return pessoa;
  }

  async buscarClientesComVenda(): Promise<Array<{ Cod_pes: number; Nome_pes: string; NomeFant_Pes: string }>> {
    Console({ type: "log", message: "Buscando clientes com venda" });

    const path = "/Pessoas/ConsultarPessoasComVenda";
    const { data } = await this.post<any>(path);

    const pessoas = stripHeaderRow<{ Cod_pes: number; Nome_pes: string; NomeFant_Pes: string }>(
      data?.[0]?.Pessoas
    );

    return pessoas;
  }

  async buscarClientePorCodPes(codPes: number): Promise<any> {
    Console({ type: "log", message: `Buscando cliente codigo ${codPes}` });

    const path = "/Pessoas/ConsultarPessoaPorChave";
    const body = { codigo_pessoa: codPes };

    const { data } = await this.post<any>(path, body);

    // seu antigo: data[0].MyTable[1]
    const row = firstDataRow<any>(data?.[0]?.MyTable);
    if (!row) throw new Error(`Cliente não encontrado para codPes ${codPes}`);
    return row;
  }

  async buscarTelefonesCliente(codPes: number): Promise<TelefoneUAU[]> {
    Console({ type: "log", message: `Buscando telefones cliente ${codPes}` });

    const path = "/Pessoas/ConsultarTelefones";
    const body = { numero: codPes };

    const { data } = await this.post<UauTableResponse<TelefoneUAU[]>>(path, body);

    // aqui parece que a UAU já retorna array simples
    const result = Array.isArray(data) ? (data as TelefoneUAU[]) : [];
    return result;
  }

  async buscarUnidadesCliente(codPes: number): Promise<UnidadePessoaUAU[]> {
    Console({ type: "log", message: `Buscando unidades cliente ${codPes}` });

    const path = "/Pessoas/ConsultarUnidades";
    const body = { CodigoPessoa: codPes };

    const { data } = await this.post<UauTableResponse<UnidadePessoaUAU[]>>(path, body);

    const result = Array.isArray(data) ? (data as UnidadePessoaUAU[]) : [];
    return result;
  }

  /* ------------------------------------------------------------------------ */
  /* ANEXOS                                                                    */
  /* ------------------------------------------------------------------------ */

  async buscarDiretoriosAnexos(): Promise<any> {
    Console({ type: "log", message: "Buscando diretorios anexos" });
    const { data } = await this.post<any>("/Anexo/ListarDiretorios", {});
    return data;
  }

  async buscarChavesAnexos(): Promise<any> {
    Console({ type: "log", message: "Buscando chaves para anexos" });
    const { data } = await this.post<any>("/Anexo/ConsultarChavesComentario", {});
    return data;
  }

  /* ------------------------------------------------------------------------ */
  /* BOLETOS                                                                   */
  /* ------------------------------------------------------------------------ */

  async buscarBoletosGeradosCliente(codPes: number): Promise<BoletoClienteUAU[]> {
    Console({ type: "log", message: `Buscando boletos do cliente ${codPes}` });

    const path = "/BoletoServices/ConsultarBoletosDoCliente";
    const body = {
      codPessoa: codPes,
      naoMostraBoletoVencido: false,
      usuario: this.login,
      tipo_usuario: 0,
    };

    const { data } = await this.post<UauTableResponse<BoletoClienteUAU[]>>(path, body);
    return Array.isArray(data) ? (data as BoletoClienteUAU[]) : [];
  }

  async buscarBoletosReimpressaoCliente(obra: string, numVenda: number): Promise<BoletoReimpressaoUAU[]> {
    Console({ type: "log", message: `Buscando boletos reimpressão: obra=${obra} venda=${numVenda}` });

    const path = "/BoletoServices/ConsultarBoletosReimpressao";
    const body = {
      empresa: 1,
      obra,
      num_venda: numVenda,
      naomostraboleto_vencido: false,
      mostrarApenasUltimoBoleto: false,
    };

    const { data } = await this.post<any>(path, body);

    // bug no seu código: slice(1, length++) (isso é um erro de lógica)
    const table = data?.[0]?.BoletosReimpressao;
    return stripHeaderRow<BoletoReimpressaoUAU>(table);
  }

  /* ------------------------------------------------------------------------ */
  /* UNIDADES                                                                  */
  /* ------------------------------------------------------------------------ */

  async buscarTodasAsUnidades(): Promise<UnidadeEspelhoUAU[]> {
    Console({ type: "log", message: "Buscando unidades cadastradas" });

    const path = "/Espelho/BuscaUnidadesDeAcordoComWhere";
    const body = { where: "WHERE NumPer_unid LIKE '%%'", retorna_venda: true };

    const { data } = await this.post<any>(path, body);

    const table = data?.[0]?.MyTable;
    return stripHeaderRow<UnidadeEspelhoUAU>(table);
  }

  async buscarUnidadePorChave(produto: number, numPerson: number): Promise<UnidadePorChaveUAU> {
    Console({ type: "log", message: `Buscando unidade por chave produto=${produto} numPerson=${numPerson}` });

    const path = "/Espelho/ConsultarUnidadePerPorChave";
    const body = { codigoEmpresa: 1, codigoProduto: produto, numeroPersonalizacao: numPerson };

    const { data } = await this.post<UnidadePorChaveUAU>(path, body);
    return data;
  }

  async alterarStatusUnidade(
    produto: number,
    numPerson: number,
    novoStatus: number,
    motivoAlteracao: string,
    categoriaStatusPersonalizacao: number
  ): Promise<boolean> {
    Console({ type: "log", message: `Alterando status unidade produto=${produto} numPerson=${numPerson}` });

    const path = "/Espelho/AlterarStatusUnidade";
    const body = {
      codigoEmpresa: 1,
      codigoProduto: produto,
      numeroPersonalizacao: numPerson,
      novoStatusUnidade: novoStatus,
      motivoAlteracao,
      categoriaStatusPersonalizacao,
    };

    const res = await this.post(path, body);
    return res.status === 200;
  }

  async alterarCamposCustomizadosUnidade(
    obra: string,
    produto: number,
    numPerson: number,
    campoCustom: string,
    campoCustomValor: string
  ): Promise<any> {
    Console({ type: "log", message: `Atualizando campos customizados obra=${obra} produto=${produto} numPerson=${numPerson}` });

    const path = "/Espelho/AtualizarCamposCustomizados";
    const body = {
      campos_custom: {
        ListChavesUnid: [{ Empresa: 1, Obra: obra, Produto: produto, CodPerson: numPerson }],
        ListValoresUnid: [{ CampoCustom: campoCustom, CampoCustomValor: campoCustomValor }],
      },
    };

    const { data } = await this.post<any>(path, body);
    return data;
  }

  /* ------------------------------------------------------------------------ */
  /* OBRAS                                                                     */
  /* ------------------------------------------------------------------------ */

  async buscarObrasCadastradas(): Promise<any> {
    Console({ type: "log", message: "Buscando obras ativas" });
    const { data } = await this.post<any>("/Obras/ObterObrasAtivas", {});
    return data;
  }

  async buscarObra(obra: string): Promise<ObraUAU> {
    Console({ type: "log", message: `Buscando obra ${obra}` });

    const path = "/Obras/ConsultarObraPorChave";
    const body = { empresa: 1, obra };

    const { data } = await this.post<any>(path, body);

    // seu antigo: data[1]
    // geralmente: [0]=header, [1]=linha; mas às vezes vem como array direto
    const row = Array.isArray(data) ? (data[1] ?? data?.[0]) : data;
    if (!row) throw new Error(`Obra não encontrada para chave ${obra}`);

    return row as ObraUAU;
  }
}
