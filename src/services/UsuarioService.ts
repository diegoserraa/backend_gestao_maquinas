import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { IUsuario } from "../interfaces/Iusuario";

export class UsuarioService {

    private repo = new UsuarioRepository();

    async listar(empresaId: string) {
        return this.repo.listar(empresaId);
    }

    async buscarPorId(id: number, empresaId: string) {
        const user = await this.repo.buscarPorId(id, empresaId);

        if (!user) {
            throw new Error("Usuário não encontrado");
        }

        return user;
    }

    async criar(user: IUsuario, empresaId: string) {

        const existe = await this.repo.buscarPorEmail(user.email);

        if (existe) {
            throw new Error("Email já cadastrado");
        }

        const senhaHash = await bcrypt.hash(user.senha, 10);

        return this.repo.criar({
            ...user,
            senha: senhaHash,
            empresa_id: empresaId
        });
    }

    async atualizar(id: number, user: IUsuario, empresaId: string) {

        const existente = await this.repo.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Usuário não encontrado");
        }

        return this.repo.atualizar(id, user, empresaId);
    }

    async excluir(id: number, empresaId: string) {

        const existente = await this.repo.buscarPorId(id, empresaId);

        if (!existente) {
            throw new Error("Usuário não encontrado");
        }

        await this.repo.excluir(id, empresaId);
    }
    async alternarStatus(id: number, empresaId: string) {

    const existente = await this.repo.buscarPorId(id, empresaId);

    if (!existente) {
        throw new Error("Usuário não encontrado");
    }

    return this.repo.alternarStatus(id, !existente.ativo, empresaId);
}
async listarTecnicos(empresaId: string) {
    return this.repo.listarTecnicos(empresaId);
}
}