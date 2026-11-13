import { useEffect, useRef, type MouseEvent } from "react";
import { Button } from "@carbon/react";
import { Help } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import styles from "./ExamHelpButton.module.scss";

interface ExamHelpButtonProps {
  /** Close stale guidance when the page or available exam actions change. */
  contextKey: string;
  coding: boolean;
}

export function ExamHelpButton({ contextKey, coding }: ExamHelpButtonProps) {
  const { t, i18n } = useTranslation("contest");
  const { pathname } = useLocation();
  const tourRef = useRef<Driver | null>(null);

  useEffect(() => () => {
    tourRef.current?.destroy();
    tourRef.current = null;
  }, [contextKey, pathname, i18n.language]);

  const startTour = (event: MouseEvent<HTMLButtonElement>) => {
    const opener = event.currentTarget;
    const shell = opener.closest("[data-exam-shell]");
    if (!shell || tourRef.current?.isActive()) return;

    const candidates = [
      { id: "overview", title: t("workspace.rail.overview", "考試概覽"), description: t("workspace.tour.overview", "在這裡查看考試資訊與規則。開始、繼續作答與交卷等操作，也會依考試狀態顯示在概覽中。") },
      { id: "questions", title: t("workspace.rail.questions", "題目"), description: t("workspace.tour.questions", "從這裡進入作答畫面，並開啟題目列表。導覽結束後，再點選想作答的題目。") },
      { id: "list-toggle", title: t("workspace.tour.listTitle", "題目列表"), description: t("workspace.tour.list", "用這個按鈕展開或收合題目列表。列表可切換題目、查看各題狀態；收合後能留出更多作答空間。") },
      { id: "answer", title: t("workspace.tour.answerTitle", "作答區域"), description: coding
        ? t("workspace.tour.codingAnswer", "先閱讀題目，再於編輯器撰寫程式。測試執行後，記得提交程式並查看評測結果；只執行測試不代表已提交。")
        : t("workspace.tour.paperAnswer", "在這裡閱讀題目，依題型選擇或輸入答案。切換題目前留意儲存狀態，交卷前可到「作答內容」檢查。") },
      { id: "review", title: t("workspace.rail.review", "作答內容"), description: t("workspace.tour.review", "在這裡檢查各題的作答狀態與可查看的作答紀錄，交卷前確認是否還有遺漏。") },
      { id: "standings", title: t("workspace.rail.standings", "排行榜"), description: t("workspace.tour.standings", "競賽開放排行榜時，可在這裡查看排名與成績。顯示的資訊依競賽設定而定。") },
    ];
    const steps: DriveStep[] = candidates.flatMap(({ id, title, description }) => {
      const element = shell.querySelector<HTMLElement>(`[data-exam-tour="${id}"]`);
      if (!element || element.closest("[hidden]") || !element.getClientRects().length) return [];
      return [{ element, popover: { title, description, side: id === "list-toggle" ? "bottom" : "right", align: "start" } }];
    });
    if (!steps.length) return;

    const tour = driver({
      steps,
      animate: false,
      smoothScroll: false,
      disableActiveInteraction: true,
      overlayClickBehavior: "none",
      allowClose: true,
      showProgress: true,
      showButtons: ["previous", "next", "close"],
      progressText: "{{current}} / {{total}}",
      nextBtnText: t("workspace.tour.next", "下一步"),
      prevBtnText: t("workspace.tour.previous", "上一步"),
      doneBtnText: t("workspace.tour.done", "完成"),
      closeBtnLabel: t("workspace.tour.close", "關閉導覽"),
      popoverClass: styles.popover,
      // Driver owns these native controls. Keep its focus/keyboard behavior and
      // use its public DOM hook to apply our Carbon-token theme at this boundary.
      onPopoverRender: (popover) => {
        popover.title.classList.add(styles.title);
        popover.description.classList.add(styles.description);
        popover.progress.classList.add(styles.progress);
        popover.previousButton.classList.add(styles.previous);
        popover.nextButton.classList.add(styles.next);
        popover.closeButton.classList.add(styles.close);
      },
      onDestroyed: () => {
        tourRef.current = null;
        if (opener.isConnected) opener.focus({ preventScroll: true });
      },
    });
    tourRef.current = tour;
    tour.drive();
  };

  return (
    <Button kind="ghost" size="sm" renderIcon={Help} className={styles.help}
      aria-label={t("workspace.tour.helpLabel", "Help：操作導覽")} onClick={startTour}>
      Help
    </Button>
  );
}
