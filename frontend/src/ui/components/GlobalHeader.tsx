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
  Home,
  Code,
  Trophy,
  List,
  Book,
  DocumentAdd,
  Events,
  UserMultiple,
  Bullhorn,
  Settings,
} from "@carbon/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { UserMenu } from "./UserMenu";
import "./GlobalHeader.scss";

export const GlobalHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const isTeacherOrAdmin = user?.role === "admin" || user?.role === "teacher";
  const isAdmin = user?.role === "admin";

  return (
    <>
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }) => (
          <Header aria-label="QJudge Platform">
            <SkipToContent />
            <HeaderMenuButton
              aria-label={t("header.menu", "選單")}
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
            />
            <HeaderName href="/" prefix="NYCU">
              QJudge
            </HeaderName>
            <HeaderNavigation aria-label="Main Navigation">
              <HeaderMenuItem
                isCurrentPage={location.pathname.startsWith("/dashboard")}
                onClick={() => navigate("/dashboard")}
              >
                {t("nav.dashboard")}
              </HeaderMenuItem>
              <HeaderMenuItem
                isCurrentPage={location.pathname.startsWith("/problems")}
                onClick={() => navigate("/problems")}
              >
                {t("nav.problems")}
              </HeaderMenuItem>
              <HeaderMenuItem
                isCurrentPage={location.pathname.startsWith("/contests")}
                onClick={() => navigate("/contests")}
              >
                {t("nav.contests")}
              </HeaderMenuItem>
              <HeaderMenuItem
                isCurrentPage={location.pathname.startsWith("/submissions")}
                onClick={() => navigate("/submissions")}
              >
                {t("nav.submissions")}
              </HeaderMenuItem>
              <HeaderMenuItem
                isCurrentPage={location.pathname.startsWith("/docs")}
                onClick={() => navigate("/docs")}
              >
                {t("nav.documentation")}
              </HeaderMenuItem>
            </HeaderNavigation>
            <HeaderGlobalBar>
              <UserMenu />
            </HeaderGlobalBar>

            {/* Mobile Side Navigation */}
            <SideNav
              aria-label={t("header.sideNav", "側邊導航")}
              expanded={isSideNavExpanded}
              isPersistent={false}
              onSideNavBlur={onClickSideNavExpand}
            >
              <SideNavItems>
                {/* Main Navigation */}
                <SideNavLink
                  renderIcon={Home}
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    navigate("/dashboard");
                    onClickSideNavExpand();
                  }}
                  isActive={location.pathname.startsWith("/dashboard")}
                >
                  {t("nav.dashboard")}
                </SideNavLink>
                <SideNavLink
                  renderIcon={Code}
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    navigate("/problems");
                    onClickSideNavExpand();
                  }}
                  isActive={location.pathname.startsWith("/problems")}
                >
                  {t("nav.problems")}
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
                <SideNavLink
                  renderIcon={List}
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    navigate("/submissions");
                    onClickSideNavExpand();
                  }}
                  isActive={location.pathname.startsWith("/submissions")}
                >
                  {t("nav.submissions")}
                </SideNavLink>
                <SideNavLink
                  renderIcon={Book}
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    navigate("/docs");
                    onClickSideNavExpand();
                  }}
                  isActive={location.pathname.startsWith("/docs")}
                >
                  {t("nav.documentation")}
                </SideNavLink>

                {/* Management Section (teacher/admin only) */}
                {isTeacherOrAdmin && (
                  <>
                    <SideNavDivider />
                    <SideNavMenu
                      renderIcon={Settings}
                      title={t("header.management")}
                      defaultExpanded={
                        location.pathname.startsWith("/management") ||
                        location.pathname.startsWith("/system")
                      }
                    >
                      <SideNavMenuItem
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate("/management/problems");
                          onClickSideNavExpand();
                        }}
                        isActive={location.pathname === "/management/problems"}
                      >
                        <DocumentAdd
                          size={16}
                          style={{ marginRight: "0.5rem" }}
                        />
                        {t("header.problemManagement")}
                      </SideNavMenuItem>
                      <SideNavMenuItem
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate("/contests/new");
                          onClickSideNavExpand();
                        }}
                        isActive={location.pathname === "/contests/new"}
                      >
                        <Events size={16} style={{ marginRight: "0.5rem" }} />
                        {t("header.createContest")}
                      </SideNavMenuItem>

                      {/* Admin only items */}
                      {isAdmin && (
                        <>
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
                            <Bullhorn
                              size={16}
                              style={{ marginRight: "0.5rem" }}
                            />
                            {t("header.announcements")}
                          </SideNavMenuItem>
                          <SideNavMenuItem
                            href="#"
                            onClick={(e: React.MouseEvent) => {
                              e.preventDefault();
                              navigate("/system/environment");
                              onClickSideNavExpand();
                            }}
                            isActive={
                              location.pathname === "/system/environment"
                            }
                          >
                            <Settings
                              size={16}
                              style={{ marginRight: "0.5rem" }}
                            />
                            {t("header.environmentSettings")}
                          </SideNavMenuItem>
                        </>
                      )}
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
