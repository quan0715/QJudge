import type { ChangeEvent, ReactNode } from "react";
import { Search } from "@carbon/react";
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
  placeholder?: string;
  ariaLabel?: string;
}

function ToolbarSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: ToolbarSearchProps) {
  return (
    <div className={styles.search}>
      <Search
        size="lg"
        labelText={ariaLabel ?? placeholder ?? "search"}
        placeholder={placeholder}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
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
