import type { Request, Response } from "express";
import fs from "fs";
import xlsx from "xlsx";
import os from "os";

import Console, { ConsoleData } from "../lib/Console";
import { normalizeBRBase10 } from "../lib/phone";

import Disparo, { DISPARO_STATUS } from "../models/Disparo";
import DisparoItem from "../models/DisparoItem";

import MetaController from "./meta.controller";

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
/* -------------------------------------------------------------------------- */

function makeReqId(prefix = "disparo") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function cleanStr(v: any) {
  return String(v ?? "").trim();
}

function cleanDigits(v?: string | null) {
  if (!v) return "";
  return String(v).replace(/\D+/g, "");
}

function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickExcelRowsAsObjects(filePath: string): Record<string, any>[] {
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
}

function toStringSafe(v: any) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function nowOrDate(v: any) {
  const s = cleanStr(v);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function buildVarsFromRow(params: {
  row: Record<string, any>;
  variables: Array<{ var: string; column: string; fallback?: string }>;
}) {
  const out: Record<string, string> = {};
  for (const m of params.variables || []) {
    const key = cleanStr(m?.var);
    const col = cleanStr(m?.column);
    if (!key || !col) continue;

    const raw = params.row?.[col];
    const val = cleanStr(toStringSafe(raw)) || cleanStr(m?.fallback);
    out[key] = val;
  }
  return out;
}

function normalizePhoneFromRow(row: Record<string, any>, phoneColumn: string) {
  const raw = toStringSafe(row?.[phoneColumn]);
  const digits = cleanDigits(raw);
  const canon = normalizeBRBase10(digits);
  return { phoneRaw: raw, phoneE164: canon };
}

function makeWorkerId() {
  const host = os.hostname?.() || "host";
  return `${host}:${process.pid}`;
}

function toISO(d?: any) {
  if (!d) return "";
  try {
    return new Date(d).toISOString();
  } catch {
    return "";
  }
}
function buildTemplateComponentsFromVars(
  vars: Record<string, string>
) {
  return [
    {
      type: "header",
      parameters: Object.entries(vars)
        .filter(([k]) => k === "nome")
        .map(([_, v]) => ({
          type: "text",
          text: v,
          parameter_name: "nome",
        })),
    },
    {
      type: "body",
      parameters: Object.entries(vars)
        .filter(([k]) => k !== "nome")
        .map(([k, v]) => ({
          type: "text",
          text: v,
          parameter_name: k,
        })),
    },
  ].filter(c => c.parameters.length > 0);
}


/** lock TTL padrão (se um envio travar, recupera) */
const DEFAULT_LOCK_TTL_MS = safeNumber(process.env.DISPARO_LOCK_TTL_MS, 60_000);

/* -------------------------------------------------------------------------- */
/* Controller                                                                 */
/* -------------------------------------------------------------------------- */

export default class DisparoController {
  private meta = new MetaController();

  /**
   * POST /disparos
   * multipart/form-data:
   *  - file (.xlsx) em req.file
   *  - criadoPor, atendenteId, titulo, descricao?
   *  - templateName (ou templateNome/template), templateId? (fallback)
   *  - sheetMap (json ou objeto)
   *  - agendamento (json ou objeto)
   *  - phoneNumberId?, language?, tentativasMax?, prioridade?
   */
  async create(req: Request, res: Response) {
    const reqId = makeReqId("create");
    const t0 = Date.now();

    try {
      const file = (req as any).file as
        | { path: string; originalname: string; mimetype: string; size: number }
        | undefined;

      if (!file?.path) {
        return res.status(400).json({ status: false, message: "Envie o arquivo .xlsx (multipart/form-data)." });
      }

      const criadoPor = cleanStr(req.body?.criadoPor);
      const atendenteId = cleanStr(req.body?.atendenteId);
      const titulo = cleanStr(req.body?.titulo);
      const descricao = cleanStr(req.body?.descricao);

      const templateName = cleanStr(req.body?.templateName || req.body?.templateNome || req.body?.template);
      const templateId = cleanStr(req.body?.templateId) || templateName;

      const phoneNumberId = cleanStr(req.body?.phoneNumberId);

      const sheetMap =
        typeof req.body?.sheetMap === "string" ? JSON.parse(req.body.sheetMap) : (req.body?.sheetMap || {});
      const agendamento =
        typeof req.body?.agendamento === "string"
          ? JSON.parse(req.body.agendamento)
          : (req.body?.agendamento || {});

      if (!criadoPor) return res.status(400).json({ status: false, message: "criadoPor é obrigatório." });
      if (!atendenteId) return res.status(400).json({ status: false, message: "atendenteId é obrigatório." });
      if (!titulo) return res.status(400).json({ status: false, message: "titulo é obrigatório." });
      if (!templateName) return res.status(400).json({ status: false, message: "templateName é obrigatório." });

      if (!cleanStr(sheetMap?.phoneColumn)) {
        return res.status(400).json({ status: false, message: "sheetMap.phoneColumn é obrigatório." });
      }

      const modo = cleanStr(agendamento?.modo) === "agendado" ? "agendado" : "agora";
      const dataAgendada = modo === "agendado" ? nowOrDate(agendamento?.dataAgendada) : undefined;

      // cria disparo
      const disparo = await Disparo.create({
        criadoPor,
        atendenteId: String(atendenteId),
        provider: "meta",
        status: "processando",

        titulo,
        descricao: descricao || "",

        templateId,
        templateNome: templateName,

        sheetMap: {
          phoneColumn: cleanStr(sheetMap.phoneColumn),
          nameColumn: cleanStr(sheetMap.nameColumn) || undefined,
          keyColumn: cleanStr(sheetMap.keyColumn) || undefined,
          variables: Array.isArray(sheetMap.variables) ? sheetMap.variables : [],
        },

        arquivo: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storage: "local",
          pathOrUrl: file.path,
        },

        agendamento: {
          modo,
          dataAgendada,
          timezone: cleanStr(agendamento?.timezone) || undefined,
        },

        meta: {
          phoneNumberId: phoneNumberId || undefined,
          templateLanguage: cleanStr(req.body?.language) || undefined,
        },

        tentativasMax: safeNumber(req.body?.tentativasMax, 3),
        prioridade: safeNumber(req.body?.prioridade, 0),
        pausado: false,

        stats: {
          total: 0,
          fila: 0,
          processando: 0,
          enviado: 0,
          erro: 0,
          ignorado: 0,
          processado: 0,
          startedAt: new Date(),
        },
      });

      Console({
        type: "log",
        message: `[DISPARO][${reqId}] Criado disparoId=${String(disparo._id)}. Lendo planilha...`,
      });

      // parse excel
      const rows = pickExcelRowsAsObjects(file.path);
      if (!rows.length) {
        await Disparo.updateOne(
          { _id: disparo._id },
          { $set: { status: "erro", ultimoErro: "Planilha vazia ou sem cabeçalhos." } }
        );
        return res.status(400).json({ status: false, message: "Planilha vazia ou sem cabeçalhos." });
      }

      const phoneColumn = cleanStr(sheetMap.phoneColumn);
      const nameColumn = cleanStr(sheetMap.nameColumn);
      const keyColumn = cleanStr(sheetMap.keyColumn);
      const variables = Array.isArray(sheetMap.variables) ? sheetMap.variables : [];

      const docs = rows.map((row, idx) => {
        const { phoneRaw, phoneE164 } = normalizePhoneFromRow(row, phoneColumn);

        const key = keyColumn ? cleanStr(toStringSafe(row?.[keyColumn])) : "";
        const name = nameColumn ? cleanStr(toStringSafe(row?.[nameColumn])) : "";

        const vars = buildVarsFromRow({ row, variables });

        const status = phoneE164 ? "fila" : "ignorado";

        return {
          disparoId: disparo._id,
          rowIndex: idx,
          key: key || undefined,
          row,
          vars,
          phoneRaw: phoneRaw || "",
          phoneE164: phoneE164 || undefined,
          name: name || undefined,
          status,
          attempts: 0,
          // worker fields
          nextRetryAt: undefined,
          reservedAt: undefined,
          finishedAt: undefined,
          lock: {},
        };
      });

      // insert
      await DisparoItem.insertMany(docs, { ordered: false });

      const total = docs.length;
      const fila = docs.filter((d) => d.status === "fila").length;
      const ignorado = docs.filter((d) => d.status === "ignorado").length;

      let nextStatus: any = "em_fila";
      if (modo === "agendado") nextStatus = "agendado";
      if (fila === 0) nextStatus = "erro";

      await Disparo.updateOne(
        { _id: disparo._id },
        {
          $set: {
            status: nextStatus,
            stats: {
              total,
              fila,
              processando: 0,
              enviado: 0,
              erro: 0,
              ignorado,
              processado: 0,
              startedAt: disparo.stats?.startedAt || new Date(),
            },
            ultimoErro: fila === 0 ? "Nenhuma linha válida com telefone (phoneColumn)." : undefined,
          },
        }
      );

      Console({
        type: "success",
        message: `[DISPARO][${reqId}] Itens gerados ok. total=${total} fila=${fila} ignorado=${ignorado} (${Date.now() - t0}ms)`,
      });

      const saved = await Disparo.findById(disparo._id).lean();
      return res.json({ status: true, data: saved });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro ao criar disparo.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * GET /disparos
   * query: atendenteId?, status?, page?, limit?
   */
  async list(req: Request, res: Response) {
    const reqId = makeReqId("list");
    try {
      const page = Math.max(1, safeNumber(req.query?.page, 1));
      const limit = Math.min(100, Math.max(1, safeNumber(req.query?.limit, 20)));
      const skip = (page - 1) * limit;

      const atendenteId = cleanStr(req.query?.atendenteId);
      const status = cleanStr(req.query?.status);

      const where: any = {};
      if (atendenteId) where.atendenteId = atendenteId;
      if (status && (DISPARO_STATUS as any).includes(status)) where.status = status;

      const [items, total] = await Promise.all([
        Disparo.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Disparo.countDocuments(where),
      ]);

      return res.json({ status: true, data: { items, page, limit, total } });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro ao listar.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * GET /disparos/:id
   */
  async get(req: Request, res: Response) {
    const reqId = makeReqId("get");
    try {
      const id = cleanStr(req.params?.id);
      const doc = await Disparo.findById(id).lean();
      if (!doc) return res.status(404).json({ status: false, message: "Disparo não encontrado." });
      return res.json({ status: true, data: doc });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro ao buscar.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * PATCH /disparos/:id/pause
   */
  async pause(req: Request, res: Response) {
    const reqId = makeReqId("pause");
    try {
      const id = cleanStr(req.params?.id);

      const doc = await Disparo.findByIdAndUpdate(
        id,
        { $set: { pausado: true, status: "pausado" } },
        { new: true }
      ).lean();

      if (!doc) return res.status(404).json({ status: false, message: "Disparo não encontrado." });
      return res.json({ status: true, data: doc });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro ao pausar.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * PATCH /disparos/:id/resume
   */
  async resume(req: Request, res: Response) {
    const reqId = makeReqId("resume");
    try {
      const id = cleanStr(req.params?.id);

      const disparo = await Disparo.findById(id).lean();
      if (!disparo) return res.status(404).json({ status: false, message: "Disparo não encontrado." });

      let nextStatus: any = "em_fila";
      if (disparo.agendamento?.modo === "agendado") nextStatus = "agendado";

      const doc = await Disparo.findByIdAndUpdate(
        id,
        { $set: { pausado: false, status: nextStatus } },
        { new: true }
      ).lean();

      return res.json({ status: true, data: doc });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro ao retomar.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * POST /disparos/:id/send-next
   * body: { limit?: number, lockTtlMs?: number, components?: any[], language?: string, phoneNumberId?: string }
   *
   * Versão worker-ready:
   * - Reserva item (fila->processando) com lock atômico
   * - Envia
   * - Finaliza (enviado/erro) liberando lock
   */
  async sendNext(req: Request, res: Response) {
    const reqId = makeReqId("send_next");
    const t0 = Date.now();

    try {
      const id = cleanStr(req.params?.id);
      const limit = Math.min(50, Math.max(1, safeNumber(req.body?.limit, 10)));
      const lockTtlMs = Math.min(10 * 60_000, Math.max(10_000, safeNumber(req.body?.lockTtlMs, DEFAULT_LOCK_TTL_MS)));

      const disparo = await Disparo.findById(id).lean();
      if (!disparo) return res.status(404).json({ status: false, message: "Disparo não encontrado." });

      if (disparo.pausado) return res.status(400).json({ status: false, message: "Disparo está pausado." });

      // agendamento
      if (disparo.agendamento?.modo === "agendado" && disparo.agendamento?.dataAgendada) {
        const now = Date.now();
        const when = new Date(disparo.agendamento.dataAgendada).getTime();
        if (now < when) {
          return res.status(400).json({
            status: false,
            message: `Disparo agendado para ${toISO(disparo.agendamento.dataAgendada)}.`,
          });
        }
      }

      // marca disparo como rodando (idempotente)
      const workerId = makeWorkerId();
      await Disparo.updateOne(
        { _id: id },
        {
          $set: {
            status: "rodando",
            "worker.lockedBy": workerId,
            "worker.lockedAt": new Date(),
            "worker.heartbeatAt": new Date(),
          },
        }
      );

      const templateName = cleanStr(disparo.templateNome || disparo.templateId);
      const language = cleanStr(req.body?.language) || cleanStr(disparo.meta?.templateLanguage) || "pt_BR";
      const phoneNumberId = cleanStr(req.body?.phoneNumberId) || cleanStr(disparo.meta?.phoneNumberId) || undefined;


      let sent = 0;
      let failed = 0;
      let reserved = 0;

      for (let i = 0; i < limit; i++) {
        // reserva 1 item atômico
        const lockExpiresAt = new Date(Date.now() + lockTtlMs);

        const item = await DisparoItem.findOneAndUpdate(
          {
            disparoId: id,
            status: "fila",
            $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: null }, { nextRetryAt: { $lte: new Date() } }],
            // libera lock expirado caso esteja preso (opcional para fila; aqui só pega "fila" mesmo)
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
          { sort: { rowIndex: 1 }, new: true }
        ).lean();
        const components = buildTemplateComponentsFromVars(item.vars);
        if (!item) break;
        reserved++;

        const to = cleanStr(item.phoneE164 || item.phoneRaw);
        if (!to) {
          failed++;
          await DisparoItem.updateOne(
            { _id: item._id },
            {
              $set: {
                lastAttemptAt: new Date(),
                status: "erro",
                finishedAt: new Date(),
                erro: { mensagem: "Telefone ausente/inválido.", em: new Date() },
                "lock.lockedAt": undefined,
                "lock.lockedBy": undefined,
                "lock.lockExpiresAt": undefined,
              },
              $inc: { attempts: 1 },
            }
          );

          await Disparo.updateOne(
            { _id: id },
            {
              $inc: { "stats.erro": 1, "stats.processado": 1, "stats.processando": -1 },
            }
          );

          continue;
        }

        // callback data p/ rastreio (disparo + item)
        const bizData = JSON.stringify({
          kind: "disparo",
          disparoId: String(id),
          itemId: String(item._id),
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
                lastAttemptAt: new Date(),
                status: "enviado",
                finishedAt: new Date(),
                meta: {
                  waId,
                  messageId: wamid,
                  phoneNumberId: phoneNumberId,
                  sentAt: new Date(),
                  lastStatus: "SENT",
                },
                erro: undefined,
                nextRetryAt: undefined,
                "lock.lockedAt": undefined,
                "lock.lockedBy": undefined,
                "lock.lockExpiresAt": undefined,
              },
              $inc: { attempts: 1 },


            }
          );

          sent++;
        } catch (e: any) {
          failed++;

          // backoff simples (exponencial capado)
          const attempts = safeNumber((item as any).attempts, 0) + 1;
          const backoffMs = Math.min(30 * 60_000, 5_000 * Math.pow(2, Math.max(0, attempts - 1))); // 5s,10s,20s,... cap 30min
          const nextRetryAt = new Date(Date.now() + backoffMs);

          await DisparoItem.updateOne(
            { _id: item._id },
            {
              $set: {
                lastAttemptAt: new Date(),
                status: "erro",
                finishedAt: new Date(),
                nextRetryAt,
                erro: {
                  mensagem: e?.message ? String(e.message) : "Falha ao enviar template.",
                  detalhe: e?.response?.data || undefined,
                  em: new Date(),
                },
                "lock.lockedAt": undefined,
                "lock.lockedBy": undefined,
                "lock.lockExpiresAt": undefined,
              },
              $inc: { attempts: 1 },

            }
          );
        }

        // heartbeat
        await Disparo.updateOne(
          { _id: id },
          {
            $set: { "worker.heartbeatAt": new Date() },
          }
        );
      }

      // atualiza stats do disparo (incremental)
      if (sent || failed || reserved) {
        await Disparo.updateOne(
          { _id: id },
          {
            $inc: {
              "stats.enviado": sent,
              "stats.erro": failed,
              "stats.processado": sent + failed,
              "stats.fila": -(sent + failed), // sai da fila (processando->final)
            },
          }
        );
      }

      const remainingFila = await DisparoItem.countDocuments({ disparoId: id, status: "fila" });

      if (remainingFila === 0) {
        await Disparo.updateOne(
          { _id: id },
          {
            $set: { status: "concluido", "stats.finishedAt": new Date() },
            $setOnInsert: {},
          }
        );
      } else {
        await Disparo.updateOne({ _id: id }, { $set: { status: "em_fila" } });
      }

      Console({
        type: "success",
        message: `[DISPARO][${reqId}] sendNext ok. reserved=${reserved} sent=${sent} failed=${failed} remainingFila=${remainingFila} (${Date.now() - t0}ms)`,
      });

      return res.json({ status: true, data: { reserved, sent, failed, remainingFila } });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro no sendNext.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }

  /**
   * DELETE /disparos/:id
   * Remove disparo e itens (simples).
   */
  async remove(req: Request, res: Response) {
    const reqId = makeReqId("remove");
    try {
      const id = cleanStr(req.params?.id);

      const disparo = await Disparo.findById(id).lean();
      if (!disparo) return res.status(404).json({ status: false, message: "Disparo não encontrado." });

      await DisparoItem.deleteMany({ disparoId: id });

      const p = cleanStr(disparo.arquivo?.pathOrUrl);
      if (p && disparo.arquivo?.storage === "local") {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch { }
      }

      await Disparo.deleteOne({ _id: id });

      return res.json({ status: true, message: "Disparo removido." });
    } catch (e) {
      Console({ type: "error", message: `[DISPARO][${reqId}] Erro ao remover.` });
      ConsoleData({ type: "error", data: e });
      return res.status(500).json({ status: false, message: "Erro interno" });
    }
  }
}
