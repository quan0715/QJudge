import type { ReactNode } from "react";
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  SideNav,
  SideNavItems,
  SideNavLink,
} from "@carbon/react";
import { Dashboard, Education, Launch, Renew, Settings } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "./QuestionBankAdminLayout.module.scss";

export type QuestionBankAdminPanelId = "overview" | "problem_management" | "settings";

interface QuestionBankAdminLayoutProps {
  bankName: string;
  activePanel: QuestionBankAdminPanelId;
  onPanelChange: (panel: QuestionBankAdminPanelId) => void;
  onBack: () => void;
  onRefresh: () => void;
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
  children,
}: QuestionBankAdminLayoutProps) => {
  const { t } = useTranslation("common");

  return (
    <div className={styles.layout}>
      <Header aria-label={t("questionBank.adminTitle", "題庫管理")} className={styles.header}>
        <HeaderName href="#" prefix={t("header.prefix", "QJudge")}>
          {bankName}
        </HeaderName>
        <HeaderGlobalBar>
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
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label={t("questionBank.adminNavigation", "題庫管理導覽")}
        isRail
        className={styles.sidenav}
        style={{
          top: "3rem",
          height: "calc(100dvh - 3rem)",
        }}
      >
        <SideNavItems>
          {NAV_ITEMS.map((item) => (
            <SideNavLink
              key={item.id}
              renderIcon={item.icon}
              isActive={item.id === activePanel}
              onClick={() => onPanelChange(item.id)}
            >
              {t(item.labelKey, item.fallback)}
            </SideNavLink>
          ))}
        </SideNavItems>
      </SideNav>

      <main className={styles.content}>
        <div className={styles.contentViewport}>{children}</div>
      </main>
    </div>
  );
};

export default QuestionBankAdminLayout;
