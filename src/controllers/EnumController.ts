import { Request, Response } from "express";
import { EnumService } from "../services/EnumService";

export class EnumController {

  private service = new EnumService();

  listarOS = async (req: Request, res: Response) => {
    const enums = this.service.listarOSEnums();
    return res.json(enums);
  };
}