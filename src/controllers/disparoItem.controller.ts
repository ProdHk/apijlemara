import type { Request, Response } from "express";
import os from "os";

import Console, { ConsoleData } from "../lib/Console";
import Disparo from "../models/Disparo";
import DisparoItem, { DISPARO_ITEM_STATUS } from "../models/DisparoItem";

import MetaController from "./meta.controller";

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
/* -------------------------------------------------------------------------- */

function makeReqId(prefix = "disparo_item") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function cleanStr(v: any) {
  return String(v ?? "").trim();
}

function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function makeWorkerId() {
  const host = os.hostname?.() || "host";
  return `${host}:${process.pid}`;
}

/** lock TTL padrão (se um envio travar, recupera) */
const DEFAULT_LOCK_TTL_MS = safeNumber(process.env.DISPARO_LOCK_TTL_MS, 60_000);

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class DisparoItemController {
  private meta = new MetaController();

  /**
   * GET /disparo-items
   * query: disparoId (obrigatório), status?, page?, limit?
   */
  async list(req: Request, res: Response) {
    const reqId = makeReqId("list");
    try {
      const disparoId = cleanStr(req.query?.disparoId);
      if (!disparoId) return res.status(400).json({ status: false, message: "disparoId é obrigatório." });

      const page = Math.max(1, safeNumber(req.query?.page, 1));
      const limit = Math.min(200, Math.max(1, safeNumber(req.query?.limit, 50)));
      const skip = (page - 1) * limit;

      const status = cleanStr(req.query?.status);
      const where: any = { disparoId };
      if (status && (DISPARO_ITEM_STATUS as any).includes(status)) where.status = status;

      const [items, total] = await Promise.all([
        DisparoItem.find(where).sort({ rowIndex: 1 }).skip(skip).limit(limit).lean(),
        DisparoItem.countDocuments(where),
      ]);

      return res.json({ status: true, data: { items, page, limit, total } });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO_ITEM][${reqId}] Erro ao listar.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * GET /disparo-items/:id
   */
  async get(req: Request, res: Response) {
    const reqId = makeReqId("get");
    try {
      const id = cleanStr(req.params?.id);
      const doc = await DisparoItem.findById(id).lean();
      if (!doc) return res.status(404).json({ status: false, message: "Item não encontrado." });
      return res.json({ status: true, data: doc });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO_ITEM][${reqId}] Erro ao buscar.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * POST /disparo-items/:id/retry
   * body opcional: components, language, phoneNumberId, lockTtlMs
   */
  async retry(req: Request, res: Response) {
    const reqId = makeReqId("retry");
    const t0 = Date.now();

    try {
      const id = cleanStr(req.params?.id);
      const lockTtlMs = Math.min(10 * 60_000, Math.max(10_000, safeNumber(req.body?.lockTtlMs, DEFAULT_LOCK_TTL_MS)));

      const workerId = makeWorkerId();
      const lockExpiresAt = new Date(Date.now() + lockTtlMs);

      // reserva atômico: só permite retry se não estiver processando por outro
      const item = await DisparoItem.findOneAndUpdate(
        {
          _id: id,
          status: { $in: ["erro", "fila"] },
          $or: [
            { "lock.lockedBy": { $exists: false } },
            { "lock.lockedBy": null },
            { "lock.lockExpiresAt": { $exists: false } },
            { "lock.lockExpiresAt": null },
            { "lock.lockExpiresAt": { $lte: new Date() } }, // lock expirado
          ],
        },
        {
          $set: {
            status: "processando",
            reservedAt: new Date(),
            "lock.lockedAt": new Date(),
            "lock.lockedBy": workerId,
            "lock.lockExpiresAt": lockExpiresAt,
          },
        },
        { new: true }
      ).lean();

      if (!item) {
        return res.status(409).json({ status: false, message: "Item está em processamento (lock ativo) ou não é retryável." });
      }

      const disparo = await Disparo.findById(item.disparoId).lean();
      if (!disparo) {
        await DisparoItem.updateOne(
          { _id: item._id },
          {
            $set: {
              lastAttemptAt: new Date(),
              status: "erro",
              erro: { mensagem: "Disparo pai não encontrado.", em: new Date() },
              finishedAt: new Date(),
              "lock.lockedAt": undefined,
              "lock.lockedBy": undefined,
              "lock.lockExpiresAt": undefined,
            },
            $inc: { attempts: 1 },
          }
        );
        return res.status(404).json({ status: false, message: "Disparo pai não encontrado." });
      }

      if (disparo.pausado) {
        await DisparoItem.updateOne(
          { _id: item._id },
          {
            $set: {
              lastAttemptAt: new Date(),
              status: "erro",
              erro: { mensagem: "Disparo está pausado.", em: new Date() },
              finishedAt: new Date(),
              "lock.lockedAt": undefined,
              "lock.lockedBy": undefined,
              "lock.lockExpiresAt": undefined,
            },
            $inc: { attempts: 1 },
          }
        );
        return res.status(400).json({ status: false, message: "Disparo está pausado." });
      }

      const to = cleanStr(item.phoneE164 || item.phoneRaw);
      if (!to) {
        await DisparoItem.updateOne(
          { _id: item._id },
          {
            $set: {
              lastAttemptAt: new Date(),
              status: "erro",
              erro: { mensagem: "Item sem telefone válido.", em: new Date() },
              finishedAt: new Date(),
              "lock.lockedAt": undefined,
              "lock.lockedBy": undefined,
              "lock.lockExpiresAt": undefined,
            },
            $inc: { attempts: 1 },
          }
        );
        return res.status(400).json({ status: false, message: "Item sem telefone válido." });
      }

      const templateName = cleanStr(disparo.templateNome || disparo.templateId);
      const language = cleanStr(req.body?.language) || cleanStr(disparo.meta?.templateLanguage) || "pt_BR";
      const phoneNumberId = cleanStr(req.body?.phoneNumberId) || cleanStr(disparo.meta?.phoneNumberId) || undefined;

      const components = req.body?.components;

      const bizData = JSON.stringify({
        kind: "disparo",
        disparoId: String(disparo._id),
        itemId: String(item._id),
        retry: true,
      });

      try {
        const metaRes = await this.meta.sendTemplate({
          to,
          name: templateName,
          language,
          components: Array.isArray(components) ? components : undefined,
          phoneNumberId,
          biz_opaque_callback_data: bizData,
        });

        const waId = metaRes?.contacts?.[0]?.wa_id ? String(metaRes.contacts[0].wa_id) : undefined;
        const wamid = metaRes?.messages?.[0]?.id ? String(metaRes.messages[0].id) : undefined;

        await DisparoItem.updateOne(
          { _id: item._id },
          {
            $set: {
              status: "enviado",
              finishedAt: new Date(),
              meta: {
                waId,
                messageId: wamid,
                phoneNumberId,
                sentAt: new Date(),
                lastStatus: "SENT",
              },
              erro: undefined,
              nextRetryAt: undefined,
              lastAttemptAt: new Date(),
              "lock.lockedAt": undefined,
              "lock.lockedBy": undefined,
              "lock.lockExpiresAt": undefined,
            },
            $inc: { attempts: 1 },
          }
        );

        await Disparo.updateOne(
          { _id: disparo._id },
          { $inc: { "stats.enviado": 1, "stats.processado": 1 } }
        );

        Console({
          type: "success",
          message: `[DISPARO_ITEM][${reqId}] retry ok itemId=${String(item._id)} (${Date.now() - t0}ms)`,
        });

        const updated = await DisparoItem.findById(item._id).lean();
        return res.json({ status: true, data: updated });
      } catch (e: any) {
        const attempts = safeNumber((item as any).attempts, 0) + 1;
        const backoffMs = Math.min(30 * 60_000, 5_000 * Math.pow(2, Math.max(0, attempts - 1)));
        const nextRetryAt = new Date(Date.now() + backoffMs);

        await DisparoItem.updateOne(
          { _id: item._id },
          {
            $set: {
              status: "erro",
              finishedAt: new Date(),
              nextRetryAt,
              erro: {
                mensagem: e?.message ? String(e.message) : "Falha ao reenviar template.",
                detalhe: e?.response?.data || undefined,
                em: new Date(),
              },
              lastAttemptAt: new Date(),
              "lock.lockedAt": undefined,
              "lock.lockedBy": undefined,
              "lock.lockExpiresAt": undefined,
            },
            $inc: { attempts: 1 },
          }
        );

        await Disparo.updateOne(
          { _id: disparo._id },
          { $inc: { "stats.erro": 1, "stats.processado": 1 } }
        );

        return res.status(400).json({
          status: false,
          message: "Falha ao reenviar.",
          error: e?.response?.data || e?.message,
          nextRetryAt,
        });
      }
    } catch (e) {
      Console({ type: "error", message: `[DISPARO_ITEM][${reqId}] Erro no retry.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * PATCH /disparo-items/:id/status
   * body: { status: "fila"|"processando"|"enviado"|"erro"|"ignorado" }
   *
   * (Admin/debug) — não mexe em lock por padrão.
   */
  async setStatus(req: Request, res: Response) {
    const reqId = makeReqId("set_status");
    try {
      const id = cleanStr(req.params?.id);
      const status = cleanStr(req.body?.status);

      if (!(DISPARO_ITEM_STATUS as any).includes(status)) {
        return res.status(400).json({ status: false, message: "Status inválido." });
      }

      const doc = await DisparoItem.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
      if (!doc) return res.status(404).json({ status: false, message: "Item não encontrado." });

      return res.json({ status: true, data: doc });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO_ITEM][${reqId}] Erro ao setStatus.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }
}
