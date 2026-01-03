import fs from 'fs'
import UauController from "../controllers/uau.controller";
import Console from "../lib/Console";
import ClienteController from 'controllers/cliente.controller';
import { PessoaUauRequest } from 'types/uauTypes';
import { ClienteType, TelefoneClienteType } from 'models/Cliente';


const controller = new UauController();
const clienteController = new ClienteController();
export async function BuscarClientesUau() {
  Console({ type: "log", message: "Buscando clientes no uau" });
  try {
    const clientes = await controller.buscarClientesCadastrados();
    const cadastrarOuAtualizar = await clienteController.sincronizarListaErp(clientes);
    //    fs.writeFileSync('clientes.json', JSON.stringify(clientes.slice(50, 200)));

    // substituir por consulta ao banco e retornar clientes cadastrados
    const fakeList: PessoaUauRequest[] = clientes.slice(50, 200);
    const buffer: ClienteType[] = fakeList.map((cli: PessoaUauRequest) => {
      return {
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
    })

    //const telefones = await BuscarEAtualizarTelefonesUau(buffer)
  } catch (error) {

  }
}


async function BuscarEAtualizarTelefonesUau(list: ClienteType[]) {

  Console({ type: "log", message: "Buscando telefones no uau" });

  try {
    let pessoasETelefones: { codPes: number, telefones: TelefoneClienteType[] }[] = [];

    for (const pessoa of list) {
      type ResponseTelefone = {
        Telefone: string,
        DDD: string,
        Complemento: string,
        Tipo: number,
        Principal: number
      }
      const telefones = await controller.buscarTelefonesCliente(Number(pessoa.codPes)) as ResponseTelefone[]

      for (const tel of telefones as ResponseTelefone[]) {
        if (!tel || !tel.Telefone) continue;
        pessoasETelefones.push({
          codPes: Number(pessoa.codPes),
          telefones: [
            {
              telefone: tel.Telefone,
              ddd: tel.DDD,
              complemento: tel.Complemento,
              tipo: tel.Tipo,
              principal: tel.Principal
            }
          ]
        })
      }

      const atualizados = await clienteController.cadastrarTelefonesEmMassa(pessoasETelefones);

    }
  } catch (error) {

  }
}
