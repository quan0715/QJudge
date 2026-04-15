// Type declarations for @carbon/ai-chat-components subpath imports.
// The package uses wildcard exports (./es/*) which TypeScript doesn't resolve natively.
// Vite resolves these via the alias in vite.config.ts.
declare module "@carbon/ai-chat-components/es/react/history" {
  import type { FC, ReactNode } from "react";

  interface HistoryAction {
    text: string;
    delete?: boolean;
    divider?: boolean;
    icon?: unknown;
  }

  export const HistoryShell: FC<{ className?: string; children?: ReactNode }>;
  export const HistoryHeader: FC<{
    headerTitle?: string;
    onClose?: () => void;
    showCloseAction?: boolean;
  }>;
  export const HistoryToolbar: FC<{
    onNewChatClick?: () => void;
    onSearchInput?: (event: any) => void;
  }>;
  export const HistoryContent: FC<{ children?: ReactNode }>;
  export const HistoryLoading: FC<Record<string, never>>;
  export const HistoryPanel: FC<{ "aria-label"?: string; children?: ReactNode }>;
  export const HistoryPanelMenu: FC<{
    expanded?: boolean;
    title?: string;
    children?: ReactNode;
  }>;
  export const HistoryPanelItem: FC<{
    id?: string;
    name?: string;
    selected?: boolean;
    rename?: boolean;
    actions?: HistoryAction[];
    onMenuAction?: (event: any) => void;
    onSelected?: (event: CustomEvent) => void;
    onRenameSave?: (event: CustomEvent) => void;
  }>;
  export const HistoryPanelItems: FC<{ children?: ReactNode }>;
  export const HistorySearchItem: FC<{
    date?: string;
    disabled?: boolean;
    onSelected?: (event: CustomEvent) => void;
    children?: ReactNode;
  }>;
  export const HistoryPanelItemInput: FC<Record<string, unknown>>;
  export const HistoryDeletePanel: FC<{
    onCancel?: () => void;
    onConfirm?: () => void;
    children?: ReactNode;
  }>;
}
