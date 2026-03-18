import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  SkipToContent,
  HeaderMenuButton,
  HeaderContainer,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavDivider,
  SideNavMenu,
  SideNavMenuItem,
} from "@carbon/react";
import {
  Trophy,
  UserMultiple,
  Bullhorn,
  Settings,
  Education,
} from "@carbon/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/features/app/components/UserMenu";
import "./GlobalHeader.scss";

export const GlobalHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const isAdmin = user?.role === "admin";
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

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
        {
          key: "question-banks",
          active: location.pathname.startsWith("/question-banks"),
          onClick: () => navigate("/question-banks"),
          label: t("nav.questionBanks", "Question Banks"),
        },
        {
          key: "contests",
          active: location.pathname.startsWith("/contests"),
          onClick: () => navigate("/contests"),
          label: t("nav.contests"),
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
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }) => (
          <Header aria-label={t("header.platform")}>
            <SkipToContent />
            <HeaderMenuButton
              aria-label={t("header.menu")}
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
            />
            <HeaderName href="/" prefix={t("header.prefix")}>
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
              <UserMenu />
            </HeaderGlobalBar>

            {/* Mobile Side Navigation */}
            <SideNav
              aria-label={t("header.sideNav")}
              expanded={isSideNavExpanded}
              isPersistent={false}
              onSideNavBlur={onClickSideNavExpand}
            >
              <SideNavItems>
                {/* Main Navigation */}
                <SideNavLink
                  renderIcon={Education}
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    navigate("/dashboard");
                    onClickSideNavExpand();
                  }}
                  isActive={
                    location.pathname.startsWith("/dashboard") ||
                    location.pathname.startsWith("/classrooms/")
                  }
                >
                  {t("nav.dashboard")}
                </SideNavLink>

                {isTeacherOrAdmin ? (
                  <>
                    <SideNavLink
                      renderIcon={Education}
                      href="#"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        navigate("/question-banks");
                        onClickSideNavExpand();
                      }}
                      isActive={location.pathname.startsWith("/question-banks")}
                    >
                      {t("nav.questionBanks", "Question Banks")}
                    </SideNavLink>
                    <SideNavLink
                      renderIcon={Trophy}
                      href="#"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        navigate("/contests");
                        onClickSideNavExpand();
                      }}
                      isActive={location.pathname.startsWith("/contests")}
                    >
                      {t("nav.contests")}
                    </SideNavLink>
                  </>
                ) : null}

                {/* Admin only items */}
                {isAdmin && (
                  <>
                    <SideNavDivider />
                    <SideNavMenu
                      renderIcon={Settings}
                      title={t("header.systemSettings")}
                      defaultExpanded={
                        location.pathname.startsWith("/system") ||
                        location.pathname.startsWith(
                          "/management/announcements"
                        )
                      }
                    >
                      <SideNavMenuItem
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate("/system/users");
                          onClickSideNavExpand();
                        }}
                        isActive={location.pathname === "/system/users"}
                      >
                        <UserMultiple
                          size={16}
                          style={{ marginRight: "0.5rem" }}
                        />
                        {t("header.userManagement")}
                      </SideNavMenuItem>
                      <SideNavMenuItem
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate("/management/announcements");
                          onClickSideNavExpand();
                        }}
                        isActive={
                          location.pathname === "/management/announcements"
                        }
                      >
                        <Bullhorn size={16} style={{ marginRight: "0.5rem" }} />
                        {t("header.announcements")}
                      </SideNavMenuItem>
                      <SideNavMenuItem
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate("/system/environment");
                          onClickSideNavExpand();
                        }}
                        isActive={location.pathname === "/system/environment"}
                      >
                        <Settings size={16} style={{ marginRight: "0.5rem" }} />
                        {t("header.environmentSettings")}
                      </SideNavMenuItem>
                    </SideNavMenu>
                  </>
                )}
              </SideNavItems>
            </SideNav>
          </Header>
        )}
      />
    </>
  );
};
