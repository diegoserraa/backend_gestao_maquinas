import { PrioridadeOS, StatusOS, TipoManutencao, } from "../enums/OsEnums";

export class EnumService {

  listarOSEnums() {
    return {
      status: Object.values(StatusOS),
      tipoManutencao: Object.values(TipoManutencao),
      prioridade: Object.values(PrioridadeOS)
    };
  }
}