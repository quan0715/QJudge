import type { ElementType, ReactNode } from "react";
import { PageTitle } from "./typography/PageTitle";
import { SectionTitle } from "./typography/SectionTitle";
import styles from "./BlockHeader.module.scss";

export interface BlockHeaderProps {
  title: ReactNode;
  titleAs?: ElementType;
  titleSize?: "page" | "section";
  description?: ReactNode;
  actions?: ReactNode;
}

export function BlockHeader({
  title,
  titleAs,
  titleSize = "section",
  description,
  actions,
}: BlockHeaderProps) {
  const TitleComp = titleSize === "page" ? PageTitle : SectionTitle;
  return (
    <header className={styles.root}>
      <div className={styles.text}>
        <TitleComp as={titleAs}>{title}</TitleComp>
        {description && <div className={styles.description}>{description}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
