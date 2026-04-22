import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import {
  type AiTaskManifestV1,
  createTaskManifest,
  isSameTaskContext,
  withHistory,
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

/**
 * 在一批 session id 裡挑出第一個 task_type 與 context 都吻合的。id 的順序由呼叫端決定
 * （通常按 updatedAt / createdAt 由新到舊排，回傳 = 時間最近的 match）。
 * 失敗或沒有 manifest 的 session 會被跳過，不影響其他 session 的查詢。
 */
export async function findLatestTaskSession(params: {
  sessionIds: readonly string[];
  taskType: string;
  context: Record<string, string>;
}): Promise<string | null> {
  for (const sessionId of params.sessionIds) {
    let manifest: AiTaskManifestV1 | null;
    try {
      manifest = await loadTaskManifest(sessionId);
    } catch {
      continue;
    }
    if (!manifest) continue;
    if (manifest.task_type !== params.taskType) continue;
    if (!isSameTaskContext(manifest.context, params.context)) continue;
    return sessionId;
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
}): Promise<{ sessionId: string; manifest: AiTaskManifestV1 }> {
  const session = await chatbotRepository.createBackendSession();
  const manifest = createTaskManifest({
    taskType: params.taskType,
    context: params.context,
    prompt: params.prompt,
  });
  await saveTaskManifest(session.id, manifest);
  return { sessionId: session.id, manifest };
}

export class TaskContextMismatchError extends Error {
  constructor(message = "task context 不一致，無法綁定此 session") {
    super(message);
    this.name = "TaskContextMismatchError";
  }
}

export async function bindExistingTaskSession(params: {
  sessionId: string;
  taskType: string;
  context?: Record<string, string>;
}): Promise<AiTaskManifestV1> {
  const manifest = await loadTaskManifest(params.sessionId);
  if (!manifest) {
    throw new Error("找不到 session task manifest，無法綁定此 session");
  }
  if (manifest.task_type !== params.taskType) {
    throw new Error("task 類型不一致，無法綁定此 session");
  }
  if (params.context && !isSameTaskContext(manifest.context, params.context)) {
    throw new TaskContextMismatchError();
  }
  return manifest;
}

export async function patchTaskManifest(
  sessionId: string,
  patcher: (prev: AiTaskManifestV1) => AiTaskManifestV1,
): Promise<AiTaskManifestV1> {
  const prev = await loadTaskManifest(sessionId);
  if (!prev) {
    throw new Error("找不到 session task manifest");
  }
  const next = patcher(prev);
  await saveTaskManifest(sessionId, next);
  return next;
}

export function appendTaskHistory(
  manifest: AiTaskManifestV1,
  action: string,
  detail?: string,
): AiTaskManifestV1 {
  return withHistory(manifest, action, detail);
}
