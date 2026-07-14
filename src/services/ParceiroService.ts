import { IParceiro } from "../interfaces/Iparceiros";
import { ParceiroRepository } from "../repositories/ParceiroRepository";

export class ParceiroService {

    private repository = new ParceiroRepository();

    async listar() {
        return this.repository.listar();
    }

    async buscarPorId(id: number) {

        const parceiro = await this.repository.buscarPorId(id);

        if (!parceiro) {
            throw new Error("Parceiro não encontrado");
        }

        return parceiro;
    }

    async criar(parceiro: IParceiro) {
    if (parceiro.cnpj) {
    const existente =
        await this.repository.buscarPorCnpj(parceiro.cnpj);

    if (existente) {
        throw new Error("Já existe um parceiro com este CNPJ.");
    }

    return this.repository.criar(parceiro);
}
}

    async atualizar(
        id: number,
        parceiro: IParceiro
    ) {

        const existente =
            await this.repository.buscarPorId(id);

        if (!existente) {
            throw new Error("Parceiro não encontrado");
        }

        return this.repository.atualizar(
            id,
            parceiro
        );
    }

    async excluir(id: number) {

        const existente =
            await this.repository.buscarPorId(id);

        if (!existente) {
            throw new Error("Parceiro não encontrado");
        }

        await this.repository.excluir(id);
    }
}