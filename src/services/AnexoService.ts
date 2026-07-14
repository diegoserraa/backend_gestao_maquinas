import { supabase } from "../config/supabase";
import { AnexoRepository } from "../repositories/AnexoRepository";

export class AnexoService {
    private repository = new AnexoRepository();

    private montarPasta(origem: string, dados: any) {
        switch (origem) {
            case "MAQUINA":
                return `maquina/${dados.maquina_id}`;

            case "OS_ABERTURA":
                return `os-abertura/${dados.ordem_servico_id}`;

            case "OS_FECHAMENTO":
                return `os-fechamento/${dados.ordem_servico_id}`;

            default:
                throw new Error("Origem inválida");
        }
    }

    async buscarPorId(id: number) {
        const anexo = await this.repository.buscarPorId(id);

        if (!anexo) {
            throw new Error("Anexo não encontrado");
        }

        return anexo;
    }

    async upload(
        dados: {
            maquina_id?: number;
            ordem_servico_id?: number;
            origem: "MAQUINA" | "OS_ABERTURA" | "OS_FECHAMENTO";
        },
        file: Express.Multer.File
    ) {
        const permitidos = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",

            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ];

        if (!permitidos.includes(file.mimetype)) {
            throw new Error("Tipo de arquivo não permitido");
        }

        const ext = file.originalname.split(".").pop();

        const fileName = `${Date.now()}-${Math.random()
            .toString(36)
            .substring(2)}.${ext}`;

        const pasta = this.montarPasta(dados.origem, dados);

        const filePath = `${pasta}/${fileName}`;

        const { error } = await supabase.storage
            .from("attachments")
            .upload(filePath, file.buffer, {
                contentType: file.mimetype
            });

        if (error) {
            throw new Error("Erro ao enviar arquivo");
        }

        const { data } = supabase.storage
            .from("attachments")
            .getPublicUrl(filePath);

        return this.repository.criar({
            maquina_id: dados.maquina_id ?? null,
            ordem_servico_id: dados.ordem_servico_id ?? null,

            nome_arquivo: file.originalname,
            caminho_arquivo: filePath,
            url_arquivo: data.publicUrl,
            tipo_arquivo: file.mimetype,

            origem: dados.origem
        });
    }

    async listarPorMaquina(maquinaId: number) {
        return this.repository.listarPorMaquina(maquinaId);
    }

    async listarPorOS(osId: number) {
        return this.repository.listarPorOS(osId);
    }

    async excluir(id: number) {
        const anexo = await this.repository.buscarPorId(id);

        if (!anexo) {
            throw new Error("Anexo não encontrado");
        }

        const { error } = await supabase.storage
            .from("attachments")
            .remove([anexo.caminho_arquivo]);

        if (error) {
            throw new Error("Erro ao remover arquivo do bucket");
        }

        await this.repository.excluir(id);
    }
}