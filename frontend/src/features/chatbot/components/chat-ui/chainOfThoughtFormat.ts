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
  const input = step.input as { description?: unknown; prompt?: unknown } | undefined;
  const firstLine =
    typeof input?.description === "string" ? input.description.split("\n")[0].trim() : "";
  if (!firstLine) return fallback;
  const chars = Array.from(firstLine);
  return chars.length > SUBAGENT_TITLE_MAX_CHARS
    ? `${chars.slice(0, SUBAGENT_TITLE_MAX_CHARS).join("")}…`
    : firstLine;
}


function decodeQuotedContent(text: string): string {
  return text.replace(/\\(u[0-9a-f]{4}|x[0-9a-f]{2}|[nrt'"\\])/g, (_match, escape: string) => {
    if (/^[ux]/.test(escape)) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return ({ n: "\n", r: "\r", t: "\t", "'": "'", '"': '"', "\\": "\\" } as Record<string, string>)[escape];
  });
}

/** Legacy Command repr is data: extract only quoted ToolMessage content, never execute it. */
export function formatSubagentResult(value: unknown): string {
  if (typeof value === "string" && value.trimStart().startsWith("Command(")) {
    const contents = [...value.matchAll(/ToolMessage\(\s*content=(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/gs)]
      .map((match) => decodeQuotedContent(match[1] ?? match[2]));
    return contents.length ? contents.join("\n\n") : value;
  }
  if (value && typeof value === "object") {
    const result = value as { update?: { messages?: unknown }; messages?: unknown; content?: unknown };
    const messages = result.update?.messages ?? result.messages;
    if (Array.isArray(messages)) {
      const contents = messages.flatMap((message: { content?: unknown }) =>
        typeof message?.content === "string" ? [message.content] : []);
      if (contents.length) return contents.join("\n\n");
    }
    if (typeof result.content === "string") return result.content;
  }
  return formatJson(value);
}
