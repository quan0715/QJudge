import type { BackgroundInformation } from "@/core/types/chatbot.types";

export const buildBackgroundInfoPrefix = (
  backgroundInfo?: BackgroundInformation | null
): string => {
  if (!backgroundInfo) return "";

  const parts: string[] = ["<background_information>"];

  if (backgroundInfo.user) {
    parts.push("## 使用者資訊");
    parts.push(`- 使用者名稱：${backgroundInfo.user.username}`);
    if (backgroundInfo.user.role) {
      parts.push(`- 角色：${backgroundInfo.user.role}`);
    }
  }

  if (backgroundInfo.problem) {
    parts.push("## 當前題目資訊");
    parts.push(`- 題目 ID：${backgroundInfo.problem.id}`);
    parts.push(`- 題目標題：${backgroundInfo.problem.title}`);
    if (backgroundInfo.problem.difficulty) {
      parts.push(`- 難度：${backgroundInfo.problem.difficulty}`);
    }
  }

  parts.push("</background_information>\n");

  return parts.join("\n");
};
