import type { ReactNode } from "react";
import { HeaderGlobalAction, HeaderName } from "@carbon/react";
import { Dashboard, Education, Launch, Renew, Settings } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import AdminShellLayout, { type NavItem } from "@/shared/layout/AdminShellLayout";

export type QuestionBankAdminPanelId = "overview" | "problem_management" | "settings";

interface QuestionBankAdminLayoutProps {
  bankName: string;
  activePanel: QuestionBankAdminPanelId;
  onPanelChange: (panel: QuestionBankAdminPanelId) => void;
  onBack: () => void;
  onRefresh: () => void;
  readOnly?: boolean;
  children: ReactNode;
}

const NAV_ITEMS: Array<{
  id: QuestionBankAdminPanelId;
  icon: typeof Dashboard;
  labelKey: string;
  fallback: string;
}> = [
  { id: "overview", icon: Dashboard, labelKey: "tab.overview", fallback: "總覽" },
  {
    id: "problem_management",
    icon: Education,
    labelKey: "page.problemManagement",
    fallback: "題目管理",
  },
  { id: "settings", icon: Settings, labelKey: "tab.settings", fallback: "設定" },
];

const QuestionBankAdminLayout = ({
  bankName,
  activePanel,
  onPanelChange,
  onBack,
  onRefresh,
  readOnly = false,
  children,
}: QuestionBankAdminLayoutProps) => {
  const { t } = useTranslation("common");

  const visibleNavItems = readOnly
    ? NAV_ITEMS.filter((item) => item.id !== "settings")
    : NAV_ITEMS;

  const navItems: NavItem[] = visibleNavItems.map((item) => ({
    id: item.id,
    icon: item.icon,
    label: t(item.labelKey, item.fallback),
    isActive: item.id === activePanel,
    onClick: () => onPanelChange(item.id),
  }));

  return (
    <AdminShellLayout
      headerAriaLabel={t("questionBank.adminTitle", "題庫管理")}
      headerLeft={
        <HeaderName href="#" prefix={t("header.prefix", "QJudge")}>
          {bankName}
        </HeaderName>
      }
      headerActions={
        <>
          <HeaderGlobalAction
            aria-label={t("action.refresh", "重新整理")}
            tooltipAlignment="end"
            onClick={onRefresh}
          >
            <Renew size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label={t("questionBank.backToBanks", "回到題庫列表")}
            tooltipAlignment="end"
            onClick={onBack}
          >
            <Launch size={20} />
          </HeaderGlobalAction>
        </>
      }
      sideNavAriaLabel={t("questionBank.adminNavigation", "題庫管理導覽")}
      sideNavMode={{ variant: "rail" }}
      navItems={navItems}
    >
      {children}
    </AdminShellLayout>
  );
};

export default QuestionBankAdminLayout;
