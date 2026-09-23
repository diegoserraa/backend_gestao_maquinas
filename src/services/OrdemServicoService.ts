import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";
import { IOrdemServico } from "../interfaces/IordemServico";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "ordem-servico" });

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

  private async buscarOuFalhar(id: number, empresaId: string): Promise<IOrdemServico> {

    const os = await this.repo.buscarPorId(id, empresaId);

    if (!os) {
      throw new Error("Ordem de serviço não encontrada");
    }

    return os;
  }

  // Um id vindo do cliente (máquina, técnico...) só vale se for da mesma
  // empresa — senão dá pra "encostar" um registro seu no dado de outra empresa.
  private async validarMaquina(maquinaId: number, empresaId: string) {
    const maquina = await this.maquinaRepository.buscarPorId(maquinaId, empresaId);
    if (!maquina) throw new Error("Máquina não encontrada");
  }

  private async validarUsuario(usuarioId: number | null | undefined, empresaId: string) {
    if (usuarioId == null) return;
    const usuario = await this.usuarioRepository.buscarPorId(usuarioId, empresaId);
    if (!usuario) throw new Error("Usuário não encontrado");
  }

  private validarTransicao(statusAtual: string, statusNovo: string) {

    if (!TRANSICOES[statusAtual]?.includes(statusNovo)) {
      throw new Error(
        `Transição inválida: ${statusAtual} → ${statusNovo}`
      );
    }

  }

  async listar(empresaId: string) {
    return this.repo.listar(empresaId);
  }

  async buscarPorId(id:number, empresaId: string) {
    return this.buscarOuFalhar(id, empresaId);
  }

  // Operador abre OS
// Operador abre OS
async criar(dados:IOrdemServico, empresaId: string) {

  await this.validarMaquina(dados.maquina_id, empresaId);
  await this.validarUsuario(dados.id_solicitante, empresaId);
  await this.validarUsuario(dados.id_tecnico, empresaId);

  const ordem =
    await this.repo.criar({
      ...dados,
      status:"ABERTA",
      data_abertura: new Date().toISOString(),
      tipo_manutencao:
        dados.tipo_manutencao ?? "CORRETIVA"
    }, empresaId);

  log.info({ osId: ordem.id, maquinaId: ordem.maquina_id, empresaId }, "O.S. criada");

  const maquina =
    await this.maquinaRepository.buscarPorId(
      ordem.maquina_id,
      empresaId
    );

  const nomeMaquina =
    maquina?.nome ??
    `Máquina ${ordem.maquina_id}`;

  const usuarios =
    await this.usuarioRepository
    .buscarGestoresETecnicos(empresaId);

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

  if(
    gestoresIds.length ||
    tecnicosIds.length
  ){

    await this.notificacaoSistemaService
    .notificarOSCriada(
      gestoresIds,
      tecnicosIds,
      nomeMaquina,
      ordem.id || 0
    );

    log.info(
      { osId: ordem.id, gestores: gestoresIds.length, tecnicos: tecnicosIds.length },
      "notificação de O.S. criada enviada"
    );

  }else{

    log.warn({ osId: ordem.id, empresaId }, "nenhum gestor ou técnico pra notificar sobre a O.S.");

  }

  return ordem;

}


  async atualizar(
    id:number,
    dados:IOrdemServico,
    empresaId: string
  ){

    await this.buscarOuFalhar(id, empresaId);

    return this.repo.atualizar(id,dados, empresaId);

  }


  // Técnico assume ou gestor atribui
  async atribuir(
    id:number,
    id_tecnico:number,
    id_atribuido_por:number,
    empresaId: string
  ){

    const os = await this.buscarOuFalhar(id, empresaId);

    await this.validarUsuario(id_tecnico, empresaId);

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
      }, empresaId);


    if(atualizada){

  const maquina =
    await this.maquinaRepository.buscarPorId(
      os.maquina_id,
      empresaId
    );

  const nomeMaquina =
    maquina?.nome ??
    `Máquina ${os.maquina_id}`;

  await this.notificacaoSistemaService.notificarOSTecnicoAtribuida(
    id_tecnico,
    nomeMaquina,
    os.id || 0
  );

}


    return atualizada;

  }


  // Técnico inicia atendimento
  async iniciar(id:number, empresaId: string){

    const os = await this.buscarOuFalhar(id, empresaId);

    this.validarTransicao(
      os.status,
      "EM_ANDAMENTO"
    );


    return this.repo.patch(id,{
      status:"EM_ANDAMENTO",
      data_inicio_atendimento:new Date().toISOString()
    }, empresaId);

  }


  // Técnico finaliza OS
async finalizar(
  id: number,
  resolucao: string,
  empresaId: string,
  valor_gasto?: number,
  id_parceiro?: number,
  valor_parceiro?: number
) {

  const os =
    await this.buscarOuFalhar(id, empresaId);

  this.validarTransicao(
    os.status,
    "FINALIZADA"
  );

  if (!resolucao?.trim()) {
    throw new Error(
      "Resolução é obrigatória para finalizar"
    );
  }

  if ((valor_gasto ?? 0) < 0) {
    throw new Error(
      "Valor gasto não pode ser negativo"
    );
  }

  const dataResolucao = new Date();

  const finalizada =
    await this.repo.patch(id, {
      status: "FINALIZADA",
      resolucao,
      valor_gasto: valor_gasto ?? 0,
      id_parceiro: id_parceiro ?? null,
      valor_parceiro: valor_parceiro ?? 0,
      data_resolucao: dataResolucao.toISOString()
    }, empresaId);

  if (finalizada) {

    const maquina =
      await this.maquinaRepository.buscarPorId(
        os.maquina_id,
        empresaId
      );

    // ==========================
    // PREVENTIVA FINALIZADA
    // ==========================
    if (
      os.tipo_manutencao === "PREVENTIVA" &&
      maquina
    ) {
      const hoje = new Date();
      const proximaManutencao =
        new Date(dataResolucao);

      proximaManutencao.setDate(
        proximaManutencao.getDate() +
        maquina.intervalo_manutencao_dias
      );

      await this.maquinaRepository.registrarPreventiva(
  maquina.id!,
  hoje,
  proximaManutencao,
  empresaId
);

      log.info(
        { maquinaId: maquina.id, ultima: dataResolucao, proxima: proximaManutencao },
        "datas de manutenção preventiva atualizadas"
      );
    }

    const nomeMaquina =
      maquina?.nome ??
      `Máquina ${os.maquina_id}`;

    log.info(
      { osId: id, solicitante: os.id_solicitante, atribuidoPor: os.id_atribuido_por, maquina: nomeMaquina },
      "O.S. finalizada"
    );

    const destinatarios =
      new Set<number>();

    if (os.id_solicitante) {
      destinatarios.add(
        os.id_solicitante
      );
    }

    if (os.id_atribuido_por) {
      destinatarios.add(
        os.id_atribuido_por
      );
    }

    for (const usuarioId of destinatarios) {

      await this.notificacaoSistemaService.notificar(
        usuarioId,
        "Manutenção finalizada",
        `${nomeMaquina} teve sua manutenção concluída.`,
        "OS_FINALIZADA",
        `/ordens-servico/${os.id || 0}`
      );
    }
  }

  return finalizada;
}

  async cancelar(
    id:number,
    motivo_cancelamento:string,
    empresaId: string
  ){

    const os = await this.buscarOuFalhar(id, empresaId);

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
    }, empresaId);

  }
async indicadoresPorMaquina(
  maquinaId: number,
  empresaId: string
) {
  return this.repo.indicadoresPorMaquina(maquinaId, empresaId);
}

  async pausar(
    id:number,
    motivo_cancelamento:string,
    empresaId: string
  ){

    const os = await this.buscarOuFalhar(id, empresaId);

    this.validarTransicao(
      os.status,
      "PAUSADA"
    );


    return this.repo.patch(id,{
      status:"PAUSADA",
      motivo_cancelamento
    }, empresaId);

  }


  async alterarPrioridade(
    id:number,
    prioridade:string,
    empresaId: string
  ){

    const os = await this.buscarOuFalhar(id, empresaId);


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
    }, empresaId);

  }
  async excluir(id:number, empresaId: string){

  await this.buscarOuFalhar(id, empresaId);

  await this.repo.excluir(id, empresaId);

}

}