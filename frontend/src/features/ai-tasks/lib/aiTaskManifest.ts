export interface AiTaskManifestV1 {
  schema_version: 1;
  task_type: string;
  context: Record<string, string>;
  prompt: string;
  updated_at: string;
}

function nowIsoString(): string {
  return new Date().toISOString();
}

export function createTaskManifest(params: {
  taskType: string;
  context: Record<string, string>;
  prompt?: string;
}): AiTaskManifestV1 {
  return {
    schema_version: 1,
    task_type: params.taskType,
    context: params.context,
    prompt: params.prompt ?? "",
    updated_at: nowIsoString(),
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
