import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import {
  type AiTaskManifestV1,
  createTaskManifest,
  isSameTaskContext,
} from "./aiTaskManifest";

const SESSION_BASE_URL = "/api/v1/ai/sessions";
const TASK_MANIFEST_CONTEXT_KEY = "task_manifest";

interface AiSessionWithContext {
  session_id: string;
  context: Record<string, unknown>;
}

function isTaskManifest(value: unknown): value is AiTaskManifestV1 {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as AiTaskManifestV1).schema_version === 1 &&
      typeof (value as AiTaskManifestV1).task_type === "string",
  );
}

async function getSessionWithContext(sessionId: string): Promise<AiSessionWithContext> {
  return requestJson<AiSessionWithContext>(
    httpClient.get(`${SESSION_BASE_URL}/${sessionId}/`),
    "無法載入 AI session",
  );
}

async function patchSessionContext(
  sessionId: string,
  context: Record<string, unknown>,
): Promise<AiSessionWithContext> {
  return requestJson<AiSessionWithContext>(
    httpClient.request(`${SESSION_BASE_URL}/${sessionId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    }),
    "無法更新 AI session context",
  );
}

export async function loadTaskManifest(sessionId: string): Promise<AiTaskManifestV1 | null> {
  const session = await getSessionWithContext(sessionId);
  const manifest = session.context?.[TASK_MANIFEST_CONTEXT_KEY];
  return isTaskManifest(manifest) ? manifest : null;
}

function extractTaskManifest(sessionContext: unknown): AiTaskManifestV1 | null {
  if (!sessionContext || typeof sessionContext !== "object") return null;
  const manifest = (sessionContext as Record<string, unknown>)[TASK_MANIFEST_CONTEXT_KEY];
  return isTaskManifest(manifest) ? manifest : null;
}

/**
 * 在一批 session 中找出第一個 task_type 與 context 都吻合的 session id。
 * 呼叫端需提供已載入的 session context（來自 session list API），
 * 此函式只做純 in-memory 過濾，避免對每個 session 發 detail fetch。
 * 順序由呼叫端決定（通常按 updatedAt desc，回傳 = 時間最近的 match）。
 */
export function findLatestTaskSession(params: {
  sessions: ReadonlyArray<{ id: string; context?: Record<string, unknown> | null }>;
  taskType: string;
  context: Record<string, string>;
}): string | null {
  for (const session of params.sessions) {
    const manifest = extractTaskManifest(session.context);
    if (!manifest) continue;
    if (manifest.task_type !== params.taskType) continue;
    if (!isSameTaskContext(manifest.context, params.context)) continue;
    return session.id;
  }
  return null;
}

export async function saveTaskManifest(
  sessionId: string,
  manifest: AiTaskManifestV1,
): Promise<void> {
  const session = await getSessionWithContext(sessionId);
  await patchSessionContext(sessionId, {
    ...(session.context ?? {}),
    [TASK_MANIFEST_CONTEXT_KEY]: manifest,
  });
}

export async function createTaskSession(params: {
  taskType: string;
  context: Record<string, string>;
  prompt?: string;
  title?: string;
}): Promise<{ sessionId: string; manifest: AiTaskManifestV1 }> {
  const session = await chatbotRepository.createBackendSession();
  const manifest = createTaskManifest({
    taskType: params.taskType,
    context: params.context,
    prompt: params.prompt,
  });
  await saveTaskManifest(session.id, manifest);
  const title = params.title?.trim();
  if (title) {
    await chatbotRepository.renameSession(session.id, title);
  }
  return { sessionId: session.id, manifest };
}

export type BindTaskSessionReason = "not_found" | "wrong_type" | "context_mismatch";

export type BindTaskSessionResult =
  | { ok: true; manifest: AiTaskManifestV1 }
  | { ok: false; reason: BindTaskSessionReason; message: string };

/**
 * 嘗試綁定既有 session。business rule 失敗以 discriminated union 回傳（不 throw）；
 * 載入 session 時的網路／伺服器錯誤仍會 throw，由呼叫端以 try/catch 處理。
 */
export async function bindExistingTaskSession(params: {
  sessionId: string;
  taskType: string;
  context?: Record<string, string>;
}): Promise<BindTaskSessionResult> {
  const manifest = await loadTaskManifest(params.sessionId);
  if (!manifest) {
    return {
      ok: false,
      reason: "not_found",
      message: "找不到 session task manifest，無法綁定此 session",
    };
  }
  if (manifest.task_type !== params.taskType) {
    return {
      ok: false,
      reason: "wrong_type",
      message: "task 類型不一致，無法綁定此 session",
    };
  }
  if (params.context && !isSameTaskContext(manifest.context, params.context)) {
    return {
      ok: false,
      reason: "context_mismatch",
      message: "task context 不一致，無法綁定此 session",
    };
  }
  return { ok: true, manifest };
}

