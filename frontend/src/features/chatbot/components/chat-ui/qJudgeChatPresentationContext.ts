import { createContext } from "react";

export interface QJudgeChatPresentationValue {
  mode: "full" | "sidebar";
  onClose?: () => void;
}

export const QJudgeChatPresentationContext =
  createContext<QJudgeChatPresentationValue>({ mode: "full" });
