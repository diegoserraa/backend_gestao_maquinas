import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";
import { IOrdemServico } from "../interfaces/IordemServico";
import { MaquinaRepository } from "../repositories/MaquinaRepository";

const TRANSICOES: Record<string, string[]> = {
  ABERTA: ["ATRIBUIDA", "CANCELADA"],
  ATRIBUIDA: ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO: ["PAUSADA", "FINALIZADA", "CANCELADA"],
  PAUSADA: ["EM_ANDAMENTO", "CANCELADA"],
};

export class OrdemServicoService {

 constructor(
  private repo: OrdemServicoRepository,
  private usuarioRepository: UsuarioRepository,
  private notificacaoSistemaService: NotificacaoSistemaService,
  private maquinaRepository: MaquinaRepository
) {}

  private async buscarOuFalhar(id: number): Promise<IOrdemServico> {

    const os = await this.repo.buscarPorId(id);

    if (!os) {
      throw new Error("Ordem de serviço não encontrada");
    }

    return os;
  }

  private validarTransicao(statusAtual: string, statusNovo: string) {

    if (!TRANSICOES[statusAtual]?.includes(statusNovo)) {
      throw new Error(
        `Transição inválida: ${statusAtual} → ${statusNovo}`
      );
    }

  }

  async listar() {
    return this.repo.listar();
  }

  async buscarPorId(id:number) {
    return this.buscarOuFalhar(id);
  }

  // Operador abre OS
// Operador abre OS
async criar(dados:IOrdemServico) {

  console.log(
    "📥 Dados recebidos para criar OS:",
    dados
  );

  const ordem =
    await this.repo.criar({
      ...dados,
      status:"ABERTA",
      tipo_manutencao:
        dados.tipo_manutencao ?? "CORRETIVA"
    });

  console.log(
    "✅ OS criada:",
    ordem
  );

  const maquina =
    await this.maquinaRepository.buscarPorId(
      ordem.maquina_id
    );

  const nomeMaquina =
    maquina?.nome ??
    `Máquina ${ordem.maquina_id}`;

  console.log(
    "🏭 Máquina encontrada:",
    nomeMaquina
  );

  const usuarios =
    await this.usuarioRepository
    .buscarGestoresETecnicos();

  console.log(
    "👥 Usuários encontrados para notificar:",
    usuarios
  );

  const gestoresIds =
    usuarios
    .filter(
      usuario => usuario.role === "GESTOR"
    )
    .map(
      usuario => usuario.id
    );

  const tecnicosIds =
    usuarios
    .filter(
      usuario => usuario.role === "TECNICO"
    )
    .map(
      usuario => usuario.id
    );

  console.log(
    "👔 Gestores:",
    gestoresIds
  );

  console.log(
    "🔧 Técnicos:",
    tecnicosIds
  );

  if(
    gestoresIds.length ||
    tecnicosIds.length
  ){

    console.log(
      "🔔 Chamando notificarOSCriada..."
    );

    await this.notificacaoSistemaService
    .notificarOSCriada(
      gestoresIds,
      tecnicosIds,
      nomeMaquina,
      ordem.maquina_id
    );

    console.log(
      "✅ Notificação criada com sucesso"
    );

  }else{

    console.log(
      "⚠️ Nenhum gestor ou técnico encontrado para notificar"
    );

  }

  return ordem;

}


  async atualizar(
    id:number,
    dados:IOrdemServico
  ){

    await this.buscarOuFalhar(id);

    return this.repo.atualizar(id,dados);

  }


  // Técnico assume ou gestor atribui
  async atribuir(
    id:number,
    id_tecnico:number,
    id_atribuido_por:number
  ){

    const os = await this.buscarOuFalhar(id);

    this.validarTransicao(
      os.status,
      "ATRIBUIDA"
    );


    const atualizada =
      await this.repo.patch(id,{
        id_tecnico,
        id_atribuido_por,
        data_atribuicao:new Date().toISOString(),
        status:"ATRIBUIDA"
      });


    if(atualizada){

  const maquina =
    await this.maquinaRepository.buscarPorId(
      os.maquina_id
    );

  const nomeMaquina =
    maquina?.nome ??
    `Máquina ${os.maquina_id}`;

  await this.notificacaoSistemaService.notificarOSTecnicoAtribuida(
    id_tecnico,
    nomeMaquina,
    os.maquina_id
  );

}


    return atualizada;

  }


  // Técnico inicia atendimento
  async iniciar(id:number){

    const os = await this.buscarOuFalhar(id);

    this.validarTransicao(
      os.status,
      "EM_ANDAMENTO"
    );


    return this.repo.patch(id,{
      status:"EM_ANDAMENTO",
      data_inicio_atendimento:new Date().toISOString()
    });

  }


  // Técnico finaliza OS
async finalizar(
  id:number,
  resolucao:string,
  valor_gasto?:number
){

  const os =
    await this.buscarOuFalhar(id);

  this.validarTransicao(
    os.status,
    "FINALIZADA"
  );

  if(!resolucao?.trim()){
    throw new Error(
      "Resolução é obrigatória para finalizar"
    );
  }

  if((valor_gasto ?? 0) < 0){
    throw new Error(
      "Valor gasto não pode ser negativo"
    );
  }

  const finalizada =
    await this.repo.patch(id,{
      status:"FINALIZADA",
      resolucao,
      valor_gasto:valor_gasto ?? 0,
      data_resolucao:new Date().toISOString()
    });

  if(finalizada){

    const maquina =
      await this.maquinaRepository.buscarPorId(
        os.maquina_id
      );

    const nomeMaquina =
      maquina?.nome ??
      `Máquina ${os.maquina_id}`;

    console.log(
      "🏁 OS finalizada",
      {
        osId:id,
        solicitante:os.id_solicitante,
        atribuidoPor:os.id_atribuido_por,
        maquina:nomeMaquina
      }
    );

    const destinatarios =
      new Set<number>();

    if(os.id_solicitante){
      destinatarios.add(
        os.id_solicitante
      );
    }

    if(os.id_atribuido_por){
      destinatarios.add(
        os.id_atribuido_por
      );
    }

    console.log(
      "📲 Destinatários:",
      [...destinatarios]
    );

    for(const usuarioId of destinatarios){

      await this.notificacaoSistemaService.notificar(
  usuarioId,
  "Manutenção finalizada",
  `${nomeMaquina} teve sua manutenção concluída.`,
  "OS_FINALIZADA",
  `/machines/${os.maquina_id}`
);

      console.log(
        "✅ Notificação enviada para:",
        usuarioId
      );

    }

  }

  return finalizada;

}

  async cancelar(
    id:number,
    motivo_cancelamento:string
  ){

    const os = await this.buscarOuFalhar(id);

    this.validarTransicao(
      os.status,
      "CANCELADA"
    );


    if(!motivo_cancelamento?.trim()){
      throw new Error(
        "Motivo é obrigatório para cancelar"
      );
    }


    return this.repo.patch(id,{
      status:"CANCELADA",
      motivo_cancelamento,
      data_cancelamento:new Date().toISOString()
    });

  }


  async pausar(
    id:number,
    motivo_cancelamento:string
  ){

    const os = await this.buscarOuFalhar(id);

    this.validarTransicao(
      os.status,
      "PAUSADA"
    );


    return this.repo.patch(id,{
      status:"PAUSADA",
      motivo_cancelamento
    });

  }


  async alterarPrioridade(
    id:number,
    prioridade:string
  ){

    const os = await this.buscarOuFalhar(id);


    if(
      ["FINALIZADA","CANCELADA"]
      .includes(os.status)
    ){
      throw new Error(
        "Não é possível alterar prioridade de OS encerrada"
      );
    }


    return this.repo.patch(id,{
      prioridade
    });

  }
  async excluir(id:number){

  await this.buscarOuFalhar(id);

  await this.repo.excluir(id);

}

}