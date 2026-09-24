import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { NotificacaoSistemaService } from "./notificacaoSistemaService";
import { IOrdemServico } from "../interfaces/IordemServico";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { ParceiroRepository } from "../repositories/ParceiroRepository";
import { Pagina } from "../utils/paginacao";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "ordem-servico" });

const TRANSICOES: Record<string, string[]> = {
  ABERTA: ["ATRIBUIDA", "CANCELADA"],
  ATRIBUIDA: ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO: ["PAUSADA", "FINALIZADA", "CANCELADA"],
  PAUSADA: ["EM_ANDAMENTO", "CANCELADA"],
};

export class OrdemServicoService {

  private parceiroRepository = new ParceiroRepository();

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

  // só se atribui a um técnico ativo da empresa (não a gestor, operador ou administrador)
  private async validarTecnico(usuarioId: number, empresaId: string) {
    const tecnico = await this.usuarioRepository.buscarPorId(usuarioId, empresaId);
    if (!tecnico || tecnico.role !== "TECNICO") throw new Error("Escolha um técnico da empresa");
    if (tecnico.ativo === false) throw new Error("Este técnico está inativo");
  }

  private validarTransicao(statusAtual: string, statusNovo: string) {

    if (!TRANSICOES[statusAtual]?.includes(statusNovo)) {
      throw new Error(
        `Transição inválida: ${statusAtual} → ${statusNovo}`
      );
    }

  }

  async listar(empresaId: string, pagina: Pagina, apenasDoUsuario: number | null = null) {
    return this.repo.listar(empresaId, pagina, apenasDoUsuario);
  }

  async buscarPorId(id:number, empresaId: string) {
    return this.buscarOuFalhar(id, empresaId);
  }

  // Operador abre OS
// Operador abre OS
async criar(dados:IOrdemServico, empresaId: string) {

  await this.validarMaquina(dados.maquina_id, empresaId);
  await this.validarUsuario(dados.id_solicitante, empresaId);
  if (dados.id_tecnico != null) await this.validarTecnico(dados.id_tecnico, empresaId);

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


  // Técnico assume ou gestor atribui
  async atribuir(
    id:number,
    id_tecnico:number,
    id_atribuido_por:number,
    empresaId: string
  ){

    const os = await this.buscarOuFalhar(id, empresaId);

    await this.validarTecnico(id_tecnico, empresaId);

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


  // Gestor marca a O.S. como executada por parceiro externo: não existe
  // técnico de verdade, então id_tecnico fica vazio e ninguém é notificado.
  async atribuirExterno(
    id:number,
    id_atribuido_por:number,
    empresaId: string
  ){

    const os = await this.buscarOuFalhar(id, empresaId);

    this.validarTransicao(
      os.status,
      "ATRIBUIDA"
    );

    log.info({ osId: id, atribuidoPor: id_atribuido_por, empresaId }, "O.S. marcada como execução externa");

    // O parceiro externo já está executando: a O.S. vai direto para "em andamento" (o gestor não "inicia"
    // atendimento; ele só define o executor externo e, no fim, finaliza com o parceiro e o custo).
    const agora = new Date().toISOString();

    return this.repo.patch(id,{
      execucao_externa:true,
      id_tecnico:null,
      id_atribuido_por,
      data_atribuicao:agora,
      data_inicio_atendimento:agora,
      status:"EM_ANDAMENTO"
    }, empresaId);

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

  // parceiro só faz sentido (e é obrigatório) em O.S. de execução externa
  if (os.execucao_externa) {

    if (!id_parceiro) {
      throw new Error(
        "Informe o parceiro que executou a O.S. externa"
      );
    }

    const parceiro =
      await this.parceiroRepository.buscarPorId(
        id_parceiro,
        empresaId
      );

    if (!parceiro) {
      throw new Error("Parceiro não encontrado");
    }

  } else if (id_parceiro || valor_parceiro) {
    throw new Error(
      "Parceiro só pode ser informado em O.S. de execução externa"
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

    const agora = new Date();

    // cancelada durante uma pausa: a pausa termina agora (o tempo pausado fica registrado)
    const encerrandoPausa = os.status === "PAUSADA";
    const segundosPausa = encerrandoPausa ? await this.repo.segundosDaPausaEmCurso(id, empresaId) : 0;

    const cancelada = await this.repo.patch(id,{
      status:"CANCELADA",
      motivo_cancelamento,
      data_cancelamento:agora.toISOString(),
      ...(encerrandoPausa
        ? {
            tempo_pausado_segundos: (os.tempo_pausado_segundos ?? 0) + segundosPausa,
            pausada_em: null,
            motivo_pausa: null,
          }
        : {})
    }, empresaId);

    if (encerrandoPausa) await this.repo.fecharPausa(id, empresaId, null, agora.toISOString());

    return cancelada;

  }
  // Pausar o atendimento: exige o motivo; o tempo parado deixa de contar como tempo de reparo
  async pausar(
    id: number,
    motivo: string,
    usuarioId: number,
    empresaId: string
  ) {
    const os = await this.buscarOuFalhar(id, empresaId);

    this.validarTransicao(os.status, "PAUSADA");

    const motivoLimpo = motivo?.trim();
    if (!motivoLimpo) throw new Error("Informe o motivo da pausa");

    const agora = new Date().toISOString();

    const pausada = await this.repo.patchSeStatus(id, empresaId, "EM_ANDAMENTO", {
      status: "PAUSADA",
      pausada_em: agora,
      motivo_pausa: motivoLimpo,
    });

    // outra requisição pausou/encerrou a O.S. no meio do caminho
    if (!pausada) throw new Error("Transição inválida: a O.S. não está mais em andamento");

    await this.repo.abrirPausa(id, empresaId, motivoLimpo, usuarioId, agora);

    log.info({ osId: id, por: usuarioId, empresaId }, "O.S. pausada");

    await this.avisarPausa(os, usuarioId, empresaId, "pausada", motivoLimpo);

    return pausada;
  }

  // Retomar depois da pausa: soma o tempo parado e volta a "em andamento"
  async retomar(
    id: number,
    usuarioId: number,
    empresaId: string
  ) {
    const os = await this.buscarOuFalhar(id, empresaId);

    if (os.status !== "PAUSADA") {
      throw new Error(`Transição inválida: ${os.status} → EM_ANDAMENTO (a O.S. não está pausada)`);
    }

    const agora = new Date();
    const segundosPausa = await this.repo.segundosDaPausaEmCurso(id, empresaId);

    const retomada = await this.repo.patchSeStatus(id, empresaId, "PAUSADA", {
      status: "EM_ANDAMENTO",
      tempo_pausado_segundos: (os.tempo_pausado_segundos ?? 0) + segundosPausa,
      pausada_em: null,
      motivo_pausa: null,
    });

    if (!retomada) throw new Error("Transição inválida: a O.S. não está mais pausada");

    await this.repo.fecharPausa(id, empresaId, usuarioId, agora.toISOString());

    log.info({ osId: id, por: usuarioId, empresaId }, "O.S. retomada");

    await this.avisarPausa(os, usuarioId, empresaId, "retomada");

    return retomada;
  }

  // Histórico de pausas (para a linha do tempo e a tela de detalhes)
  async listarPausas(id: number, empresaId: string) {
    await this.buscarOuFalhar(id, empresaId);
    return this.repo.listarPausas(id, empresaId);
  }

  // quem abriu e quem atribuiu a O.S. é avisado (menos quem fez a ação); falha de aviso não derruba a ação
  private async avisarPausa(
    os: IOrdemServico,
    autorId: number,
    empresaId: string,
    acao: "pausada" | "retomada",
    motivo?: string
  ) {
    try {
      const maquina = await this.maquinaRepository.buscarPorId(os.maquina_id, empresaId);
      const nomeMaquina = maquina?.nome ?? `Máquina ${os.maquina_id}`;

      const destinatarios = new Set<number>();
      if (os.id_solicitante) destinatarios.add(os.id_solicitante);
      if (os.id_atribuido_por) destinatarios.add(os.id_atribuido_por);
      destinatarios.delete(autorId);

      for (const usuarioId of destinatarios) {
        await this.notificacaoSistemaService.notificar(
          usuarioId,
          acao === "pausada" ? "Manutenção pausada" : "Manutenção retomada",
          acao === "pausada"
            ? `A manutenção de ${nomeMaquina} foi pausada. Motivo: ${motivo}`
            : `A manutenção de ${nomeMaquina} foi retomada.`,
          acao === "pausada" ? "OS_PAUSADA" : "OS_RETOMADA",
          `/ordens-servico/${os.id || 0}`
        );
      }
    } catch (erro) {
      log.warn({ err: erro, osId: os.id }, "não foi possível avisar sobre a pausa/retomada");
    }
  }

async indicadoresPorMaquina(
  maquinaId: number,
  empresaId: string
) {
  return this.repo.indicadoresPorMaquina(maquinaId, empresaId);
}

}
