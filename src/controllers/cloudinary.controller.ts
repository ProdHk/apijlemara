// src/controllers/cloudinary.controller.ts
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { configDotenv } from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import Console from "../lib/Console";

configDotenv();

const execFileAsync = promisify(execFile);

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
export type CloudinaryUploadOptions = {
  resource_type?: "image" | "video" | "raw" | "auto";
  folder?: string;
  public_id?: string;
  overwrite?: boolean;
};
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

  private safeUnlink(p?: string) {
    if (!p) return;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // silêncio proposital
    }
  }

  private tmpFile(ext: string) {
    const name = `voice_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
    return path.join(os.tmpdir(), name);
  }

  private async ffprobeAudioInfo(filePath: string): Promise<{
    formatName: string;
    codecName: string;
  }> {
    // ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -show_entries format=format_name -of json input
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name",
      "-show_entries",
      "format=format_name",
      "-of",
      "json",
      filePath,
    ]);

    const json = JSON.parse(stdout || "{}");
    const formatName = String(json?.format?.format_name || "").toLowerCase(); // ex: "ogg"
    const codecName = String(json?.streams?.[0]?.codec_name || "").toLowerCase(); // ex: "opus"
    return { formatName, codecName };
  }

  private async convertToOggOpus(inputPath: string, outputPath: string) {
    // WhatsApp-like: mono, 48k
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libopus",
      "-ar",
      "48000",
      "-ac",
      "1",
      outputPath,
    ]);
  }

  /* ------------------------------------------------------------------------ */
  /* Uploads                                                                  */
  /* ------------------------------------------------------------------------ */

  async uploadFile(filePath: string, folder: string, opts?: CloudinaryUploadOptions) {
    Console({ type: "log", message: "Cloudinary upload (filePath)" });

    try {
      const resourceType = opts?.resource_type ?? "auto";

      const res = (await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: resourceType,
        overwrite: opts?.overwrite ?? true,
        ...(opts?.public_id ? { public_id: opts.public_id } : {}),
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

  async uploadMultipart(file: Express.Multer.File, folder?: string): Promise<CloudinaryUploadResult | null> {
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
      this.safeUnlink(file.path);
    }
  }

  /**
   * ✅ NOVÍSSIMO (voice note only)
   * Faz upload GARANTINDO OGG/OPUS.
   * - Se input não for ogg/opus => converte com ffmpeg.
   * - Upload no Cloudinary usando resource_type "video" (padrão Cloudinary p/ áudio),
   *   e força format "ogg" para URL terminar em .ogg.
   */
  async uploadVoiceNoteOggOpus(
    filePath: string,
    folder: string,
    opts?: { public_id?: string; overwrite?: boolean }
  ): Promise<CloudinaryUploadResult | null> {
    Console({ type: "log", message: "Cloudinary upload (voice note ogg/opus)" });

    if (!filePath || !fs.existsSync(filePath)) {
      Console({ type: "error", message: "Arquivo inválido (filePath não existe)." });
      return null;
    }

    const outOgg = this.tmpFile("ogg");
    let pathToUpload = filePath;

    try {
      // 1) valida container/codec
      const info = await this.ffprobeAudioInfo(filePath);

      const isOgg = info.formatName.includes("ogg");
      const isOpus = info.codecName.includes("opus");

      if (!isOgg || !isOpus) {
        Console({
          type: "log",
          message: `Convertendo para OGG/OPUS (format=${info.formatName} codec=${info.codecName})`,
        });
        await this.convertToOggOpus(filePath, outOgg);

        // revalida (segurança)
        const info2 = await this.ffprobeAudioInfo(outOgg);
        if (!info2.formatName.includes("ogg") || !info2.codecName.includes("opus")) {
          throw new Error(`Conversão falhou (format=${info2.formatName} codec=${info2.codecName})`);
        }

        pathToUpload = outOgg;
      }

      // 2) upload (Cloudinary usa resource_type=video para áudio)
      const res = (await cloudinary.uploader.upload(pathToUpload, {
        folder,
        resource_type: "video",
        overwrite: opts?.overwrite ?? true,

        // força sair com extensão ogg no secure_url
        format: "ogg",

        // opcional: preservar nome
        use_filename: true,
        unique_filename: true,

        ...(opts?.public_id ? { public_id: opts.public_id } : {}),
        access_mode: "public",
      })) as UploadApiResponse;

      const normalized = this.normalizeResult(res);

      // 3) hard guarantee: URL final deve ser .ogg
      const url = String(normalized.secure_url || "");
      if (!url.toLowerCase().includes(".ogg")) {
        throw new Error(`Upload não retornou URL .ogg (secure_url=${url})`);
      }

      Console({ type: "success", message: "Upload voice note realizado (ogg/opus)." });
      return normalized;
    } catch (error) {
      Console({
        type: "error",
        message: `Erro uploadVoiceNoteOggOpus: ${(error as Error).message}`,
      });
      return null;
    } finally {
      // apaga apenas o temporário criado
      if (outOgg && outOgg !== filePath) this.safeUnlink(outOgg);
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
