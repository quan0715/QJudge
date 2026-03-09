import type { ComponentType } from "react";
import { Tile } from "@carbon/react";

import styles from "./OverviewDataCards.module.scss";

export interface OverviewDataCardItem {
  key: string;
  label: string;
  value: string;
  unit?: string;
  subtext?: string;
  tone?: "default" | "warning";
  icon?: ComponentType<{ size?: number; className?: string }>;
}

interface OverviewDataCardsProps {
  items: OverviewDataCardItem[];
  mode?: "grid" | "compact" | "raw";
  className?: string;
}

export default function OverviewDataCards({
  items,
  mode = "grid",
  className,
}: OverviewDataCardsProps) {
  const gridModeClass =
    mode === "compact"
      ? styles.gridCompact
      : mode === "raw"
        ? styles.gridRaw
        : styles.gridRegular;
  const cardModeClass =
    mode === "compact"
      ? styles.cardCompact
      : mode === "raw"
        ? styles.cardRaw
        : styles.cardGrid;

  return (
    <div className={`${styles.grid} ${gridModeClass} ${className || ""}`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Tile key={item.key} className={`${styles.card} ${cardModeClass}`}>
            <div className={styles.headerRow}>
              {Icon ? <Icon size={16} className={styles.icon} /> : null}
              <span className={styles.label}>{item.label}</span>
            </div>
            <div className={styles.valueRow}>
              <span
                className={`${styles.value} ${item.tone === "warning" ? styles.warningValue : ""}`}
              >
                {item.value}
              </span>
              {item.unit ? (
                <span className={styles.unit}>
                  {item.unit}
                </span>
              ) : null}
            </div>
            {item.subtext ? <span className={styles.subtext}>{item.subtext}</span> : null}
          </Tile>
        );
      })}
    </div>
  );
}
