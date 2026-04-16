import { useState } from "react";
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SkipToContent,
} from "@carbon/react";
import {
  Globe,
  Chat,
} from "@carbon/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/features/app/components/UserMenu";
import { SideMenu } from "@/features/app/components/SideMenu";
import { SideMenuToggle } from "@/features/app/components/SideMenuToggle";
import { usePageHeaderActionsSlot } from "@/features/app/contexts/PageHeaderActionsContext";
import "./GlobalHeader.scss";

export const GlobalHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const pageHeaderActions = usePageHeaderActionsSlot();

  const desktopNavItems = isTeacherOrAdmin
    ? [
        {
          key: "dashboard",
          active:
            location.pathname.startsWith("/dashboard") ||
            location.pathname.startsWith("/classrooms/"),
          onClick: () => navigate("/dashboard"),
          label: t("nav.dashboard"),
        },
      ]
    : [
        {
          key: "dashboard",
          active:
            location.pathname.startsWith("/dashboard") ||
            location.pathname.startsWith("/classrooms/"),
          onClick: () => navigate("/dashboard"),
          label: t("nav.dashboard"),
        },
      ];

  return (
    <>
      <Header aria-label={t("header.platform")}>
        <SkipToContent />
        <SideMenuToggle
          isOpen={sideMenuOpen}
          onClick={() => setSideMenuOpen((o) => !o)}
        />
        <HeaderName href="/dashboard" prefix={t("header.prefix")}>
          QJudge
        </HeaderName>
        <HeaderNavigation aria-label={t("header.mainNavigation")}>
          {desktopNavItems.map((item) => (
            <HeaderMenuItem
              key={item.key}
              isCurrentPage={item.active}
              onClick={item.onClick}
            >
              {item.label}
            </HeaderMenuItem>
          ))}
        </HeaderNavigation>
        <HeaderGlobalBar>
          {pageHeaderActions}
          {isTeacherOrAdmin && (
            <>
              <HeaderGlobalAction
                aria-label="AI 助教"
                tooltipAlignment="end"
                onClick={() => navigate("/chat")}
                isActive={location.pathname === "/chat"}
              >
                <Chat size={20} />
              </HeaderGlobalAction>
              <HeaderGlobalAction
                aria-label={t("nav.marketplace", "Marketplace")}
                tooltipAlignment="end"
                onClick={() => navigate("/marketplace")}
              >
                <Globe size={20} />
              </HeaderGlobalAction>
            </>
          )}
          <UserMenu />
        </HeaderGlobalBar>

        <SideMenu
          isOpen={sideMenuOpen}
          onClose={() => setSideMenuOpen(false)}
        />
      </Header>
    </>
  );
};
