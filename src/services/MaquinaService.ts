import { IMaquina } from "../interfaces/Imaquina";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { supabase } from "../config/supabase";
import QRCode from "qrcode";

export class MaquinaService {

    private repository = new MaquinaRepository();

    async listar() {
        return this.repository.listar();
    }

    async buscarPorId(id: number) {
        const maquina = await this.repository.buscarPorId(id);

        if (!maquina) {
            throw new Error("Máquina não encontrada");
        }

        return maquina;
    }

    // 🔥 AGORA COM IMAGEM
  async criar(maquina: IMaquina, file?: Express.Multer.File) {

    // 1. cria máquina primeiro no banco
    const maquinaCriada = await this.repository.criar(maquina);

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
            imagemUrl
        );
    }

    // 3. gera QR Code
    const urlMaquina =
        `${process.env.FRONTEND_URL}/maquinas/${maquinaCriada.id}`;

    const qrCodeBase64 =
        await QRCode.toDataURL(urlMaquina);

    await this.repository.atualizarQrCode(
        maquinaCriada.id!,
        qrCodeBase64
    );

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
    file?: Express.Multer.File
) {
    const existente =
        await this.repository.buscarPorId(id);

    if (!existente) {
        throw new Error("Máquina não encontrada");
    }

    // 1. atualiza dados básicos
    const atualizada =
        await this.repository.atualizar(id, maquina);

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
            imagemUrl
        );
    }

    return {
        ...atualizada,
        imagem_url: imagemUrl
    };
}

    async excluir(id: number) {

        const existente =
            await this.repository.buscarPorId(id);

        if (!existente) {
            throw new Error("Máquina não encontrada");
        }

        await this.repository.excluir(id);
    }

    async alternarStatus(id: number) {

        const existente =
            await this.repository.buscarPorId(id);

        if (!existente) {
            throw new Error("Máquina não encontrada");
        }

        const novoStatus =
            existente.status === "ativa"
                ? "inativa"
                : "ativa";

        return this.repository.alternarStatus(id, novoStatus);
    }

    async listarOsPorMaquina(maquinaId: number) {

        const maquina =
            await this.repository.buscarPorId(maquinaId);

        if (!maquina) {
            throw new Error("Máquina não encontrada");
        }

        return this.repository.listarOsPorMaquina(maquinaId);
    }
}