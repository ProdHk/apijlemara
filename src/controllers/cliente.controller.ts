export default class ClienteController {
  // ERP / cadastro básico
  async cadastrar(payload: any) { }

  async sincronizarErp(payload: any) { }

  async sincronizarListaErp(payload: any[]) { }

  // buscas principais
  async buscarPorId(clienteId: string) { }

  async buscarPorCodErp(cod_pes: number) { }

  async buscarPorCpf(cpf: string) { }

  async buscarPorEmail(email: string) { }

  async buscarPorWhatsapp(numeroWhatsapp: string) { }

  async buscarPorNomeParcial(nome: string) { }

  // listagens
  async listarTodos() { }

  async listarAtivos() { }

  // atualizações pontuais
  async atualizarNumeroWhatsapp(clienteId: string, numeroWhatsapp: string) { }

  async atualizarDadosBasicos(
    clienteId: string,
    payload: {
      nome_pes?: string;
      Email_pes?: string;
      cpf_pes?: string;
    }
  ) { }

  // relação com atendimentos
  async registrarAtendimento(clienteId: string, atendimentoId: string) { }

  async listarAtendimentos(clienteId: string) { }
}
