import bcrypt from "bcrypt";
import { UsuarioRepository } from "../repositories/UsuarioRepository";
import { IUsuario } from "../interfaces/Iusuario";

export class UsuarioService {

    private repo = new UsuarioRepository();

    async listar() {
        return this.repo.listar();
    }

    async buscarPorId(id: number) {
        const user = await this.repo.buscarPorId(id);

        if (!user) {
            throw new Error("Usuário não encontrado");
        }

        return user;
    }

    async criar(user: IUsuario) {

        const existe = await this.repo.buscarPorEmail(user.email);

        if (existe) {
            throw new Error("Email já cadastrado");
        }

        const senhaHash = await bcrypt.hash(user.senha, 10);

        return this.repo.criar({
            ...user,
            senha: senhaHash
        });
    }

    async atualizar(id: number, user: IUsuario) {

        const existente = await this.repo.buscarPorId(id);

        if (!existente) {
            throw new Error("Usuário não encontrado");
        }

        return this.repo.atualizar(id, user);
    }

    async excluir(id: number) {

        const existente = await this.repo.buscarPorId(id);

        if (!existente) {
            throw new Error("Usuário não encontrado");
        }

        await this.repo.excluir(id);
    }
    async alternarStatus(id: number) {

    const existente = await this.repo.buscarPorId(id);

    if (!existente) {
        throw new Error("Usuário não encontrado");
    }

    return this.repo.alternarStatus(id, !existente.ativo);
}
async listarTecnicos() {
    return this.repo.listarTecnicos();
}
}