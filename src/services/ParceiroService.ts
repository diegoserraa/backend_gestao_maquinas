import { IParceiro } from "../interfaces/Iparceiros";
import { ParceiroRepository } from "../repositories/ParceiroRepository";

export class ParceiroService {

    private repository = new ParceiroRepository();

    async listar(empresaId: string) {
        return this.repository.listar(empresaId);
    }

    async buscarPorId(id: number, empresaId: string) {

        const parceiro = await this.repository.buscarPorId(id, empresaId);

        if (!parceiro) {
            throw new Error("Parceiro não encontrado");
        }

        return parceiro;
    }

    async criar(parceiro: IParceiro, empresaId: string) {
    if (parceiro.cnpj) {
    const existente =
        await this.repository.buscarPorCnpj(parceiro.cnpj, empresaId);

    if (existente) {
        throw new Error("Já existe um parceiro com este CNPJ.");
    }

    return this.repository.criar(parceiro, empresaId);
}
}

    async atualizar(
        id: number,
        parceiro: IParceiro,
        empresaId: string
    ) {

        const existente =
            await this.repository.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Parceiro não encontrado");
        }

        return this.repository.atualizar(
            id,
            parceiro,
            empresaId
        );
    }

    async excluir(id: number, empresaId: string) {

        const existente =
            await this.repository.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Parceiro não encontrado");
        }

        await this.repository.excluir(id, empresaId);
    }
}