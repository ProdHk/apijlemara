// src/controllers/cloudinary.controller.ts

import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { configDotenv } from "dotenv";
import Console from "../lib/Console";

configDotenv();

export type CloudinaryUploadResult = {
  public_id: string;        // <-- ID da mídia pra salvar no DB
  secure_url: string;       // URL pública https
  url?: string;       // URL pública https
  resource_type: "image" | "video" | "raw";
  format?: string;
  bytes?: number;
  original_filename?: string;
};

export default class CloudinaryController {
  private static initialized = false;

  private cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  private api_key = process.env.CLOUDINARY_API_KEY;
  private api_secret = process.env.CLOUDINARY_API_SECRET;

  constructor() {
    if (!this.cloud_name || !this.api_key || !this.api_secret) {
      throw new Error(
        "Cloudinary: defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no .env"
      );
    }

    // configura só uma vez (mesmo que instancie o controller várias vezes)
    if (!CloudinaryController.initialized) {
      cloudinary.config({
        cloud_name: this.cloud_name,
        api_key: this.api_key,
        api_secret: this.api_secret,
      });
      CloudinaryController.initialized = true;
    }
  }

  /**
   * Upload público (sempre).
   * Retorna o public_id (ID pra salvar no DB) + secure_url e metadados úteis.
   */
  async uploadFile(filePath: string, folder?: string): Promise<CloudinaryUploadResult | null> {
    Console({ type: "log", message: "Enviando arquivo para Cloudinary..." });

    try {
      const res = (await cloudinary.uploader.upload(filePath, {
        resource_type: "auto",
        folder,
        access_mode: "public",
      })) as UploadApiResponse;

      Console({ type: "success", message: "Arquivo enviado para Cloudinary com sucesso." });

      return {
        public_id: res.public_id,
        secure_url: res.secure_url,
        resource_type: res.resource_type as "image" | "video" | "raw",
        format: res.format,
        bytes: res.bytes,
        original_filename: res.original_filename,
      } as CloudinaryUploadResult;
    } catch (error) {
      Console({
        type: "error",
        message: `Erro ao enviar arquivo para Cloudinary: ${(error as Error).message}`,
      });
      return null;
    }
  }

  /**
   * Busca detalhes do recurso (quando precisar).
   * Observação: pra pegar URL, você normalmente já tem secure_url no retorno do upload.
   */
  async getResource(public_id: string): Promise<UploadApiResponse | null> {
    Console({ type: "log", message: "Buscando recurso na Cloudinary..." });

    try {
      const res = (await cloudinary.api.resource(public_id)) as UploadApiResponse;
      Console({ type: "success", message: "Recurso buscado com sucesso." });
      return res;
    } catch (error) {
      Console({
        type: "error",
        message: `Erro ao buscar recurso na Cloudinary: ${(error as Error).message}`,
      });
      return null;
    }
  }

  /**
   * Deleta arquivo.
   * Dica: se você salvar resource_type no DB junto do public_id, delete fica 100% garantido.
   */
  async deleteFile(
    public_id: string,
    resource_type: "image" | "video" | "raw" = "image"
  ): Promise<{ result: string } | null> {
    Console({ type: "log", message: "Deletando arquivo na Cloudinary..." });

    try {
      const res = await cloudinary.uploader.destroy(public_id, { resource_type });
      Console({ type: "success", message: "Arquivo deletado com sucesso." });
      return res as { result: string };
    } catch (error) {
      Console({
        type: "error",
        message: `Erro ao deletar arquivo na Cloudinary: ${(error as Error).message}`,
      });
      return null;
    }
  }
}
