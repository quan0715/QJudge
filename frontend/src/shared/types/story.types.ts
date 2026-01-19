import type { ReactNode, ComponentType } from "react";

/**
 * Arg 類型定義 - 用於 Controls 面板
 */
export type ArgType = {
  /** 控制項類型 */
  control: "text" | "number" | "boolean" | "select" | "multi-select" | "array" | "object";
  /** 顯示標籤 */
  label?: string;
  /** 說明文字 */
  description?: string;
  /** select/multi-select 的選項 */
  options?: string[];
  /** select 的值映射（用於將 key 轉換為實際 object） */
  mapping?: Record<string, unknown>;
  /** 預設值 */
  defaultValue?: unknown;
  /** 是否為必填 */
  required?: boolean;
};

/**
 * Story 的 metadata，描述一個組件的展示資訊
 */
export interface StoryMeta<P = unknown> {
  /** 組件的完整路徑，如 "shared/ui/Tag/CategoryTag" */
  title: string;
  /** 組件本身 */
  component: ComponentType<P>;
  /** 組件描述 */
  description?: string;
  /** 組件分類 */
  category?: "shared" | "features" | "ui" | "layouts";
  /** Props 的預設值 */
  defaultArgs?: Partial<P>;
  /** Props 的類型定義，用於生成 Controls 面板 */
  argTypes?: Partial<Record<keyof P, ArgType>>;
}

/**
 * 單一 Story 的定義
 */
export interface Story<P = unknown> {
  /** Story 名稱，如 "Default", "With Icon" */
  name: string;
  /** 渲染函數 */
  render: (args: P) => ReactNode;
  /** 此 Story 的特定 args */
  args?: Partial<P>;
  /** 顯示的範例程式碼 */
  code?: string;
  /** Story 描述 */
  description?: string;
}

/**
 * 完整的 Story 模組定義
 */
export interface StoryModule<P = unknown> {
  meta: StoryMeta<P>;
  stories: Story<P>[];
}

/**
 * 組件註冊表中的項目
 */
export interface RegistryItem {
  /** 組件路徑 */
  path: string;
  /** 顯示名稱 */
  name: string;
  /** 分類 */
  category: string;
  /** 資料夾路徑（從 path 解析） */
  folder: string;
  /** Story 模組 */
  module: StoryModule;
}

/**
 * 資料夾分組
 */
export interface FolderGroup {
  id: string;
  name: string;
  items: RegistryItem[];
}

/**
 * 分類後的組件列表（含資料夾子分組）
 */
export interface CategoryGroup {
  id: string;
  name: string;
  folders: FolderGroup[];
}
