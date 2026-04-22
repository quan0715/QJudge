export type AiTaskStatus =
  | "idle"
  | "running"
  | "paused"
  | "review"
  | "completed"
  | "failed";

export interface AiTaskHistoryEntry {
  at: string;
  action: string;
  detail?: string;
}

export interface AiTaskManifestV1 {
  schema_version: 1;
  task_type: string;
  context: Record<string, string>;
  status: AiTaskStatus;
  prompt: string;
  active_run_id: string | null;
  updated_at: string;
  history: AiTaskHistoryEntry[];
}

export function nowIsoString(): string {
  return new Date().toISOString();
}

export function createTaskManifest(params: {
  taskType: string;
  context: Record<string, string>;
  prompt?: string;
}): AiTaskManifestV1 {
  const at = nowIsoString();
  return {
    schema_version: 1,
    task_type: params.taskType,
    context: params.context,
    status: "idle",
    prompt: params.prompt ?? "",
    active_run_id: null,
    updated_at: at,
    history: [{ at, action: "created" }],
  };
}

export function withHistory(
  manifest: AiTaskManifestV1,
  action: string,
  detail?: string,
): AiTaskManifestV1 {
  const at = nowIsoString();
  return {
    ...manifest,
    updated_at: at,
    history: [...manifest.history, { at, action, detail }],
  };
}

export function isSameTaskContext(
  lhs: Record<string, string>,
  rhs: Record<string, string>,
): boolean {
  const lhsKeys = Object.keys(lhs).sort();
  const rhsKeys = Object.keys(rhs).sort();
  if (lhsKeys.length !== rhsKeys.length) return false;
  for (let i = 0; i < lhsKeys.length; i += 1) {
    const key = lhsKeys[i];
    if (rhsKeys[i] !== key) return false;
    if (lhs[key] !== rhs[key]) return false;
  }
  return true;
}
