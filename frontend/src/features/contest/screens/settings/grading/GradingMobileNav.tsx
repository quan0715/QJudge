import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@carbon/react";
import { ChevronDown, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "./GradingMobileNav.module.scss";

interface GradingMobileNavProps {
  questionLabel: string;
  studentLabel: string;
  questionContent: ReactNode;
  studentContent: ReactNode;
}

type DrawerTarget = "question" | "student" | null;

export default function GradingMobileNav({
  questionLabel,
  studentLabel,
  questionContent,
  studentContent,
}: GradingMobileNavProps) {
  const { t } = useTranslation("contest");
  const [openDrawer, setOpenDrawer] = useState<DrawerTarget>(null);
  const prevQuestionLabel = useRef(questionLabel);
  const prevStudentLabel = useRef(studentLabel);

  // Auto-close drawer when selection changes (label changed = user picked something)
  useEffect(() => {
    if (openDrawer === "question" && questionLabel !== prevQuestionLabel.current) {
      setOpenDrawer(null);
    }
    if (openDrawer === "student" && studentLabel !== prevStudentLabel.current) {
      setOpenDrawer(null);
    }
    prevQuestionLabel.current = questionLabel;
    prevStudentLabel.current = studentLabel;
  }, [questionLabel, studentLabel, openDrawer]);

  const drawerTitle =
    openDrawer === "question"
      ? t("grading.questionList", "題目列表")
      : t("grading.answerList", "作答列表");

  const drawerContent =
    openDrawer === "question" ? questionContent : studentContent;

  return (
    <>
      <div className={styles.mobileNav}>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpenDrawer("question")}
          aria-label={t("grading.selectQuestion", "選擇題目")}
        >
          <span className={styles.triggerLabel}>{questionLabel}</span>
          <ChevronDown size={14} className={styles.triggerIcon} />
        </button>
        <span className={styles.separator}>›</span>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpenDrawer("student")}
          aria-label={t("grading.selectStudent", "選擇學生")}
        >
          <span className={styles.triggerLabel}>{studentLabel}</span>
          <ChevronDown size={14} className={styles.triggerIcon} />
        </button>
      </div>

      {/* Backdrop */}
      <div
        className={`${styles.backdrop} ${openDrawer ? styles.backdropOpen : ""}`}
        onClick={() => setOpenDrawer(null)}
      />

      {/* Drawer */}
      <div className={`${styles.drawer} ${openDrawer ? styles.drawerOpen : ""}`}>
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>{drawerTitle}</span>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Close}
            iconDescription={t("common.close", "關閉")}
            onClick={() => setOpenDrawer(null)}
          />
        </div>
        <div className={styles.drawerBody}>{drawerContent}</div>
      </div>
    </>
  );
}
