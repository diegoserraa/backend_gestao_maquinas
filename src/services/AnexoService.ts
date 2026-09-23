import { supabase } from "../config/supabase";
import { AnexoRepository } from "../repositories/AnexoRepository";
import { MaquinaRepository } from "../repositories/MaquinaRepository";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";

export class AnexoService {
    private repository = new AnexoRepository();
    private maquinaRepository = new MaquinaRepository();
    private ordemServicoRepository = new OrdemServicoRepository();

    // o anexo só pode apontar pra máquina/O.S. da mesma empresa
    private async validarAlvo(
        dados: { maquina_id?: number; ordem_servico_id?: number },
        empresaId: string
    ) {
        if (dados.maquina_id != null) {
            const m = await this.maquinaRepository.buscarPorId(Number(dados.maquina_id), empresaId);
            if (!m) throw new Error("Máquina não encontrada");
        }

        if (dados.ordem_servico_id != null) {
            const os = await this.ordemServicoRepository.buscarPorId(Number(dados.ordem_servico_id), empresaId);
            if (!os) throw new Error("Ordem de serviço não encontrada");
        }
    }

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

    async buscarPorId(id: number, empresaId: string) {
        const anexo = await this.repository.buscarPorId(id, empresaId);

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
        file: Express.Multer.File,
        empresaId: string
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

        await this.validarAlvo(dados, empresaId);

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
        }, empresaId);
    }

    async listarPorMaquina(maquinaId: number, empresaId: string) {
        return this.repository.listarPorMaquina(maquinaId, empresaId);
    }

    async listarPorOS(osId: number, empresaId: string) {
        return this.repository.listarPorOS(osId, empresaId);
    }

    async excluir(id: number, empresaId: string) {
        const anexo = await this.repository.buscarPorId(id, empresaId);

        if (!anexo) {
            throw new Error("Anexo não encontrado");
        }

        const { error } = await supabase.storage
            .from("attachments")
            .remove([anexo.caminho_arquivo]);

        if (error) {
            throw new Error("Erro ao remover arquivo do bucket");
        }

        await this.repository.excluir(id, empresaId);
    }
}