import type { ReactNode } from "react";
import type { CarbonIconType } from "@carbon/icons-react";
import type { ModelInfo, RunTodoItem } from "@/core/types/chatbot.types";
import type { ArtifactRecord } from "@/infrastructure/api/repositories/artifact.repository";

export type TaskStatus = "idle" | "running" | "paused" | "review" | "completed" | "failed";

export interface TaskShellProgress {
  completed: number;
  total: number;
}

export interface TaskShellSecondaryProgress extends TaskShellProgress {
  label: string;
}

export interface TaskShellMainTab {
  id: string;
  title: string;
  icon?: ReactNode;
  closable?: boolean;
  render(): ReactNode;
}

export interface TaskShellSessionOption {
  id: string;
  label: string;
}

export interface TaskShellSelectOption {
  id: string;
  label: string;
}

export interface TaskShellSelectBlock {
  label: string;
  placeholder: string;
  options: TaskShellSelectOption[];
  selectedId: string;
  onChange(id: string): void;
}

export interface TaskShellInitPrompt {
  value: string;
  defaultValue: string;
  onChange(value: string): void;
  /** True 時 UI 顯示為 readonly（例如 run 過後） + 顯示「重新開始」解鎖。 */
  locked: boolean;
  onUnlock?(): void;
}

export interface TaskShellModelSelect {
  models: ModelInfo[];
  selectedModelId: string;
  onChange(modelId: string): void;
}

export interface TaskShellAction {
  label: string;
  onClick(): void;
  disabled?: boolean;
  pending?: boolean;
  kind?: "primary" | "secondary" | "ghost";
  renderIcon?: CarbonIconType;
}

export type { RunTodoItem, ArtifactRecord, ModelInfo };
