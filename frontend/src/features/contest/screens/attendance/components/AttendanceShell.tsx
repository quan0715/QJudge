import { type ReactNode } from "react";
import { Button } from "@carbon/react";
import { ChevronLeft } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import styles from "./AttendanceShell.module.scss";

type Props = {
  title: string;
  onBack: () => void;
  content: ReactNode;
  footer: ReactNode;
};

export function AttendanceShell({ title, onBack, content, footer }: Props) {
  const { t } = useTranslation("contest");
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={ChevronLeft}
          iconDescription={t("attendance.shell.back", "返回")}
          onClick={onBack}
          className={styles.backButton}
          size="lg"
        />
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.headerSpacer} aria-hidden="true" />
      </header>
      <section className={styles.content}>{content}</section>
      <footer className={styles.footer}>{footer}</footer>
    </main>
  );
}
