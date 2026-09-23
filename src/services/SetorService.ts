import { SetorRepository } from "../repositories/SetorRepository";
import { ISetor } from "../interfaces/Isetor";

export class SetorService {

    private repository = new SetorRepository();

    async listar(empresaId: string) {
        return this.repository.listar(empresaId);
    }

    async buscarPorId(id: number, empresaId: string) {
        const setor = await this.repository.buscarPorId(id, empresaId);

        if (!setor) {
            throw new Error("Setor não encontrado");
        }

        return setor;
    }

    async criar(setor: ISetor, empresaId: string) {
        return this.repository.criar(setor, empresaId);
    }

    async atualizar(id: number, setor: ISetor, empresaId: string) {

        const existente = await this.repository.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Setor não encontrado");
        }

        return this.repository.atualizar(id, setor, empresaId);
    }

    async excluir(id: number, empresaId: string) {

        const existente = await this.repository.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Setor não encontrado");
        }

        await this.repository.excluir(id, empresaId);
    }
}