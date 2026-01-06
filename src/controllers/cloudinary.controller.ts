import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { configDotenv } from "dotenv";
import fs from "fs";
import Console from "../lib/Console";

configDotenv();

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type CloudinaryResourceType = "image" | "video" | "raw";

export type CloudinaryUploadResult = {
  public_id: string;
  secure_url: string;
  url?: string;
  resource_type: CloudinaryResourceType;
  format?: string;
  bytes?: number;
  original_filename?: string;
};

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

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

    if (!CloudinaryController.initialized) {
      cloudinary.config({
        cloud_name: this.cloud_name,
        api_key: this.api_key,
        api_secret: this.api_secret,
      });
      CloudinaryController.initialized = true;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                  */
  /* ------------------------------------------------------------------------ */

  private normalizeResult(res: UploadApiResponse): CloudinaryUploadResult {
    return {
      public_id: res.public_id,
      secure_url: res.secure_url,
      resource_type: res.resource_type as CloudinaryResourceType,
      format: res.format,
      bytes: res.bytes,
      original_filename: res.original_filename,
    };
  }

  private safeUnlink(path?: string) {
    if (!path) return;
    try {
      if (fs.existsSync(path)) fs.unlinkSync(path);
    } catch {
      // silêncio proposital
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Uploads                                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Upload via caminho do arquivo NO SERVIDOR
   * (uso interno / jobs / WhatsApp / automações)
   */
  async uploadFile(
    filePath: string,
    folder?: string
  ): Promise<CloudinaryUploadResult | null> {
    Console({ type: "log", message: "Cloudinary upload (filePath)" });

    try {
      const res = (await cloudinary.uploader.upload(filePath, {
        resource_type: "auto",
        folder,
        access_mode: "public",
      })) as UploadApiResponse;

      Console({ type: "success", message: "Upload realizado com sucesso." });
      return this.normalizeResult(res);
    } catch (error) {
      Console({
        type: "error",
        message: `Cloudinary upload error: ${(error as Error).message}`,
      });
      return null;
    }
  }

  /**
   * ✅ NOVO
   * Upload via multipart (multer)
   * Usado pelo front-end
   */
  async uploadMultipart(
    file: Express.Multer.File,
    folder?: string
  ): Promise<CloudinaryUploadResult | null> {
    Console({ type: "log", message: "Cloudinary upload (multipart)" });

    if (!file?.path) {
      Console({ type: "error", message: "Arquivo multipart inválido." });
      return null;
    }

    try {
      const res = (await cloudinary.uploader.upload(file.path, {
        resource_type: "auto",
        folder,
        access_mode: "public",
      })) as UploadApiResponse;

      Console({ type: "success", message: "Upload multipart realizado." });

      return this.normalizeResult(res);
    } catch (error) {
      Console({
        type: "error",
        message: `Erro upload multipart: ${(error as Error).message}`,
      });
      return null;
    } finally {
      // limpa arquivo temporário SEMPRE
      this.safeUnlink(file.path);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Resource / Delete                                                        */
  /* ------------------------------------------------------------------------ */

  async getResource(public_id: string): Promise<UploadApiResponse | null> {
    Console({ type: "log", message: "Buscando recurso Cloudinary" });

    try {
      const res = (await cloudinary.api.resource(public_id)) as UploadApiResponse;
      return res;
    } catch (error) {
      Console({
        type: "error",
        message: `Erro ao buscar recurso: ${(error as Error).message}`,
      });
      return null;
    }
  }

  async deleteFile(
    public_id: string,
    resource_type: CloudinaryResourceType = "image"
  ): Promise<{ result: string } | null> {
    Console({ type: "log", message: "Deletando recurso Cloudinary" });

    try {
      const res = await cloudinary.uploader.destroy(public_id, { resource_type });
      return res as { result: string };
    } catch (error) {
      Console({
        type: "error",
        message: `Erro ao deletar recurso: ${(error as Error).message}`,
      });
      return null;
    }
  }
}
