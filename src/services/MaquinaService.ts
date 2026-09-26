import { IMaquina } from "../interfaces/Imaquina";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { SetorRepository } from "../repositories/SetorRepository";
import { Pagina } from "../utils/paginacao";
import { supabase } from "../config/supabase";
import QRCode from "qrcode";
import { baseDoFront, enderecoDeTeste, urlDaMaquina } from "../utils/urlFront";
import { ErroHttp, invalido, naoEncontrado } from "../utils/erros";
import { logger } from "../config/logger";

/** Teto por pedido: uma folha A4 de etiquetas tem dezenas; centenas já é trabalho para separar por setor. */
export const LIMITE_ETIQUETAS = 500;

export class MaquinaService {

    private repository = new MaquinaRepository();
    private setorRepository = new SetorRepository();

    private async validarSetor(setorId: number | undefined, empresaId: string) {
        if (setorId == null) return;
        const setor = await this.setorRepository.buscarPorId(Number(setorId), empresaId);
        if (!setor) throw new Error("Setor não encontrado");
    }

    /**
     * Etiquetas para imprimir e colar nas máquinas. O QR é gerado AGORA, a partir do endereço configurado
     * (FRONTEND_URL), e não reaproveitado do cadastro: se o endereço mudar, a próxima impressão já sai certa.
     * Só máquinas da própria empresa.
     */
    async gerarEtiquetas(empresaId: string, filtro: { ids?: number[]; setorId?: number }) {
        const base = baseDoFront();

        if (!base) {
            throw new ErroHttp(503, "O endereço do sistema (FRONTEND_URL) não está configurado no servidor.");
        }

        const maquinas = await this.repository.listarParaEtiquetas(empresaId, filtro, LIMITE_ETIQUETAS + 1);

        if (maquinas.length > LIMITE_ETIQUETAS) {
            throw invalido(`Muitas máquinas de uma vez (máximo ${LIMITE_ETIQUETAS}). Filtre por setor.`);
        }

        if (filtro.ids && maquinas.length === 0) throw naoEncontrado("Máquina não encontrada");

        const itens = await Promise.all(
            maquinas.map(async (m) => {
                const url = urlDaMaquina(base, m.id);

                return {
                    id: m.id,
                    nome: m.nome,
                    setor: m.setor,
                    url,
                    // correção de erro alta: continua lendo com sujeira e desgaste
                    qr: await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 1, width: 400 }),
                };
            })
        );

        return {
            base_url: base,
            endereco_de_teste: enderecoDeTeste(base),
            empresa: maquinas[0]?.empresa ?? null,
            itens,
        };
    }

    async listar(empresaId: string, pagina: Pagina) {
        return this.repository.listar(empresaId, pagina);
    }

    async buscarPorId(id: number, empresaId: string) {
        const maquina = await this.repository.buscarPorId(id, empresaId);

        if (!maquina) {
            throw new Error("Máquina não encontrada");
        }

        return maquina;
    }

    // 🔥 AGORA COM IMAGEM
  async criar(maquina: IMaquina, empresaId: string, file?: Express.Multer.File) {

    await this.validarSetor(maquina.setor_id, empresaId);

     // 1. calcula próxima manutenção
    if (
        maquina.ultima_manutencao &&
        maquina.intervalo_manutencao_dias
    ) {
        maquina.proxima_manutencao =
            this.calcularProximaManutencao(
                maquina.ultima_manutencao,
                maquina.intervalo_manutencao_dias
            );
    }

    // 1. cria máquina primeiro no banco
    const maquinaCriada = await this.repository.criar(maquina, empresaId);

    let imagemUrl: string | null = null;

    // 2. se tiver imagem, sobe no Supabase Storage
    if (file) {

        // ✔ pega extensão correta (png, jpg, webp etc)
        const ext = file.mimetype.split("/")[1];

        // ✔ NUNCA colocar "machines/" aqui (bucket já é machines)
        const fileName = `${maquinaCriada.id}-${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from("machines")
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (error) {
            throw new Error("Erro ao enviar imagem da máquina");
        }

        const { data } = supabase.storage
            .from("machines")
            .getPublicUrl(fileName);

        imagemUrl = data.publicUrl;

        // salva no banco
        await this.repository.atualizarImagem(
            maquinaCriada.id!,
            imagemUrl,
            empresaId
        );
    }

    // 3. gera QR Code (sem endereço configurado não grava um QR quebrado; a impressão gera o QR na hora)
    const baseFront = baseDoFront();
    let qrCodeBase64: string | undefined;

    if (baseFront) {
        qrCodeBase64 = await QRCode.toDataURL(urlDaMaquina(baseFront, maquinaCriada.id!));

        await this.repository.atualizarQrCode(
            maquinaCriada.id!,
            qrCodeBase64,
            empresaId
        );
    } else {
        logger.warn({ maquinaId: maquinaCriada.id }, "FRONTEND_URL não configurada: QR Code não gravado no cadastro");
    }

    // 4. retorno final
    return {
        ...maquinaCriada,
        imagem_url: imagemUrl,
        qr_code: qrCodeBase64
    };
}

   async atualizar(
    id: number,
    maquina: IMaquina,
    empresaId: string,
    file?: Express.Multer.File
) {
    const existente =
        await this.repository.buscarPorId(id, empresaId);

    if (!existente) {
        throw new Error("Máquina não encontrada");
    }

    await this.validarSetor(maquina.setor_id, empresaId);

      // 1. recalcula próxima manutenção
    const ultimaManutencao =
        maquina.ultima_manutencao ??
        existente.ultima_manutencao;


    const intervalo =
        maquina.intervalo_manutencao_dias ??
        existente.intervalo_manutencao_dias;


    if (
        ultimaManutencao &&
        intervalo
    ) {

        maquina.proxima_manutencao =
            this.calcularProximaManutencao(
                ultimaManutencao,
                intervalo
            );
    }

    // 1. atualiza dados básicos
    const atualizada =
        await this.repository.atualizar(id, maquina, empresaId);

    let imagemUrl = existente.imagem_url;

    // 2. se veio nova imagem, faz upload
    if (file) {

        const ext = file.mimetype.split("/")[1];

        const fileName =
            `${id}-${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from("machines")
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
            });

        if (error) {
            throw new Error("Erro ao enviar imagem da máquina");
        }

        const { data } = supabase.storage
            .from("machines")
            .getPublicUrl(fileName);

        imagemUrl = data.publicUrl;

        await this.repository.atualizarImagem(
            id,
            imagemUrl,
            empresaId
        );
    }

    return {
        ...atualizada,
        imagem_url: imagemUrl
    };
}

    async excluir(id: number, empresaId: string) {

        const existente =
            await this.repository.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Máquina não encontrada");
        }

        await this.repository.excluir(id, empresaId);
    }

    async alternarStatus(id: number, empresaId: string) {

        const existente =
            await this.repository.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Máquina não encontrada");
        }

        const novoStatus =
            existente.status === "ativa"
                ? "inativa"
                : "ativa";

        return this.repository.alternarStatus(id, novoStatus, empresaId);
    }

    async listarOsPorMaquina(maquinaId: number, empresaId: string, apenasDoUsuario: number | null = null) {

        const maquina =
            await this.repository.buscarPorId(maquinaId, empresaId);

        if (!maquina) {
            throw new Error("Máquina não encontrada");
        }

        return this.repository.listarOsPorMaquina(maquinaId, empresaId, apenasDoUsuario);
    }
    private calcularProximaManutencao(
    ultimaManutencao: string | Date,
    intervaloDias: number | string
) {
    const intervalo = parseInt(
        String(intervaloDias),
        10
    );

    if (isNaN(intervalo)) {
        throw new Error(
            `Intervalo inválido: ${intervaloDias}`
        );
    }

    const data = new Date(ultimaManutencao);

    data.setDate(
        data.getDate() + intervalo
    );

    return data;
}
}