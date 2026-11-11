import { Button, Search } from "@carbon/react";
import { Search as SearchIcon } from "@carbon/icons-react";
import { useState, type ChangeEvent, type ReactNode } from "react";
import styles from "./DashboardToolbar.module.scss";

export interface DashboardToolbarProps {
  children: ReactNode;
}

function Root({ children }: DashboardToolbarProps) {
  return <div className={styles.root}>{children}</div>;
}

interface ToolbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  size?: "sm" | "md" | "lg";
  collapsible?: boolean;
}

function ToolbarSearch({
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  id,
  size = "md",
  collapsible = false,
}: ToolbarSearchProps) {
  const [expanded, setExpanded] = useState(!collapsible || Boolean(value));
  const isExpanded = !collapsible || expanded || Boolean(value);

  if (collapsible && !isExpanded) {
    return (
      <div className={`${styles.search} ${styles.searchCollapsed}`}>
        <Button
          kind="ghost"
          size={size}
          hasIconOnly
          renderIcon={SearchIcon}
          iconDescription={ariaLabel ?? placeholder ?? "搜尋"}
          onClick={() => setExpanded(true)}
        />
      </div>
    );
  }

  return (
    <div className={styles.search}>
      <Search
        id={id}
        size={size}
        labelText={ariaLabel ?? placeholder ?? "search"}
        placeholder={placeholder}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onClear={onClear}
      />
    </div>
  );
}

interface ToolbarFilterSlotProps {
  children: ReactNode;
}
function ToolbarFilter({ children }: ToolbarFilterSlotProps) {
  return <div className={styles.filterMenu}>{children}</div>;
}

export const DashboardToolbar = Object.assign(Root, {
  Search: ToolbarSearch,
  Filter: ToolbarFilter,
});
