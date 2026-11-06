import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { GradeAppeal } from "@/core/entities/gradeAppeal.entity";

export default function GradeAppealStatusTag({ appeal }: { appeal: GradeAppeal }) {
  const { t } = useTranslation("contest");
  if (appeal.status === "closed") {
    return <Tag size="sm" type="gray">{t("gradeAppeal.statusClosed", "已結案")}</Tag>;
  }
  if (appeal.waiting_for === "student") {
    return <Tag size="sm" type="teal">{t("gradeAppeal.waitingForStudent", "等待考生回覆")}</Tag>;
  }
  return <Tag size="sm" type="blue">{appeal.waiting_for === "staff"
    ? t("gradeAppeal.waitingForStaff", "等待教師回覆")
    : t("gradeAppeal.statusOpen", "未結案")}</Tag>;
}
