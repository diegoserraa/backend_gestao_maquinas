import { SetorRepository } from "../repositories/SetorRepository";
import { ISetor } from "../interfaces/Isetor";

export class SetorService {

    private repository = new SetorRepository();

    async listar() {
        return this.repository.listar();
    }

    async buscarPorId(id: number) {
        const setor = await this.repository.buscarPorId(id);

        if (!setor) {
            throw new Error("Setor não encontrado");
        }

        return setor;
    }

    async criar(setor: ISetor) {
        return this.repository.criar(setor);
    }

    async atualizar(id: number, setor: ISetor) {

        const existente = await this.repository.buscarPorId(id);

        if (!existente) {
            throw new Error("Setor não encontrado");
        }

        return this.repository.atualizar(id, setor);
    }

    async excluir(id: number) {

        const existente = await this.repository.buscarPorId(id);

        if (!existente) {
            throw new Error("Setor não encontrado");
        }

        await this.repository.excluir(id);
    }
}