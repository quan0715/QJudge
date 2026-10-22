import type { TFunction } from "i18next";
import type { CopilotToolPart } from "@copilot";

const SUBAGENT_TITLE_MAX_CHARS = 40;

export function formatJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatToolName(toolName: string, t: TFunction): string {
  if (toolName.startsWith("__skill__:")) {
    const skillName = toolName.slice(10);
    return t("ui.useSkill", { skillName, defaultValue: `使用技能 ${skillName}` });
  }
  return toolName;
}

export function subagentTitle(step: CopilotToolPart, fallback: string): string {
  const input = step.input as { description?: unknown } | undefined;
  const firstLine =
    typeof input?.description === "string" ? input.description.split("\n")[0].trim() : "";
  if (!firstLine) return fallback;
  const chars = Array.from(firstLine);
  return chars.length > SUBAGENT_TITLE_MAX_CHARS
    ? `${chars.slice(0, SUBAGENT_TITLE_MAX_CHARS).join("")}…`
    : firstLine;
}
