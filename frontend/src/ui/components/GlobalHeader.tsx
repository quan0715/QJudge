import { useState } from "react";
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SkipToContent,
  HeaderMenuButton,
  HeaderContainer,
  HeaderPanel,
  Switcher,
  SwitcherItem,
  SwitcherDivider,
} from "@carbon/react";
import {
  Login,
  Moon,
  Sun,
  Logout,
  UserAvatar,
  Switcher as SwitcherIcon,
  Language,
  Settings,
  Checkmark,
} from "@carbon/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import { useTheme } from "@/ui/theme/ThemeContext";
import { useContentLanguage } from "@/contexts/ContentLanguageContext";
import { useTranslation } from "react-i18next";
import "./GlobalHeader.scss";

export const GlobalHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    contentLanguage,
    setContentLanguage,
    supportedLanguages,
    getCurrentLanguageShortLabel,
  } = useContentLanguage();
  const { t } = useTranslation();

  const [isUserMenuExpanded, setIsUserMenuExpanded] = useState(false);
  const [isSwitcherExpanded, setIsSwitcherExpanded] = useState(false);
  const [isLanguageMenuExpanded, setIsLanguageMenuExpanded] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setIsUserMenuExpanded(false);
  };

  const handleUserMenuClick = () => {
    setIsUserMenuExpanded(!isUserMenuExpanded);
    setIsSwitcherExpanded(false);
    setIsLanguageMenuExpanded(false);
  };

  const handleSwitcherClick = () => {
    setIsSwitcherExpanded(!isSwitcherExpanded);
    setIsUserMenuExpanded(false);
    setIsLanguageMenuExpanded(false);
  };

  const handleLanguageMenuClick = () => {
    setIsLanguageMenuExpanded(!isLanguageMenuExpanded);
    setIsUserMenuExpanded(false);
    setIsSwitcherExpanded(false);
  };

  const handleLanguageSelect = (langId: string) => {
    setContentLanguage(langId as typeof contentLanguage);
    setIsLanguageMenuExpanded(false);
  };

  const getRoleLabel = (role: string | undefined) => {
    if (!role) return t("user.role.student");
    return t(`user.role.${role}`);
  };

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <Header aria-label="QJudge Platform">
          <SkipToContent />
          <HeaderMenuButton
            aria-label="Open menu"
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
          </HeaderNavigation>
          <HeaderGlobalBar>
            <HeaderGlobalAction
              aria-label={
                theme === "g100"
                  ? t("theme.switchToLight")
                  : t("theme.switchToDark")
              }
              onClick={toggleTheme}
            >
              {theme === "g100" ? <Sun size={20} /> : <Moon size={20} />}
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label={t("language.switchTo")}
              isActive={isLanguageMenuExpanded}
              onClick={handleLanguageMenuClick}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <Language size={20} />
                <span style={{ fontSize: "12px", fontWeight: 500 }}>
                  {getCurrentLanguageShortLabel()}
                </span>
              </div>
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label={t("header.appSwitcher")}
              isActive={isSwitcherExpanded}
              onClick={handleSwitcherClick}
            >
              <SwitcherIcon size={20} />
            </HeaderGlobalAction>

            {user ? (
              <HeaderGlobalAction
                aria-label={t("header.userMenu")}
                isActive={isUserMenuExpanded}
                onClick={handleUserMenuClick}
              >
                <UserAvatar size={20} />
              </HeaderGlobalAction>
            ) : (
              <HeaderGlobalAction
                aria-label={t("button.login")}
                onClick={() => navigate("/login")}
              >
                <Login size={20} />
              </HeaderGlobalAction>
            )}
          </HeaderGlobalBar>

          <HeaderPanel
            aria-label={t("header.userMenu")}
            expanded={isUserMenuExpanded}
            {...{
              style: {
                position: "fixed",
                right: 0,
                top: "48px",
                height: "auto",
                maxHeight: "none",
                bottom: "auto",
              },
            }}
          >
            <Switcher aria-label={t("header.userMenu")}>
              <li className="cds--switcher__item" style={{ cursor: "default" }}>
                <div
                  style={{
                    padding: "1rem 1rem 0.5rem 1rem",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "var(--cds-text-primary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {user?.username || user?.email}
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                      fontWeight: 400,
                    }}
                  >
                    {getRoleLabel(user?.role)}
                  </span>
                </div>
              </li>
              <SwitcherDivider />
              <SwitcherItem
                aria-label={t("button.logout")}
                onClick={handleLogout}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    color: "var(--cds-support-error)",
                  }}
                >
                  <Logout size={20} />
                  <span style={{ fontWeight: 500 }}>{t("button.logout")}</span>
                </div>
              </SwitcherItem>
            </Switcher>
          </HeaderPanel>

          <HeaderPanel
            aria-label={t("language.selectLanguage")}
            expanded={isLanguageMenuExpanded}
            {...{
              style: {
                position: "fixed",
                right: 0,
                top: "48px",
                height: "auto",
                maxHeight: "none",
                bottom: "auto",
              },
            }}
          >
            <Switcher aria-label={t("language.selectLanguage")}>
              <li className="cds--switcher__item" style={{ cursor: "default" }}>
                <span
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.75rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {t("language.selectLanguage")}
                </span>
              </li>
              <SwitcherDivider />
              {supportedLanguages.map((lang) => (
                <SwitcherItem
                  key={lang.id}
                  aria-label={lang.label}
                  onClick={() => handleLanguageSelect(lang.id)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    }}
                  >
                    <span>{lang.label}</span>
                    {contentLanguage === lang.id && (
                      <Checkmark
                        size={16}
                        style={{ color: "var(--cds-icon-primary)" }}
                      />
                    )}
                  </div>
                </SwitcherItem>
              ))}
            </Switcher>
          </HeaderPanel>

          <HeaderPanel
            aria-label={t("header.appSwitcher")}
            expanded={isSwitcherExpanded}
            {...{ style: { position: "fixed", right: 0, top: "48px" } }}
          >
            <Switcher aria-label={t("header.appSwitcher")}>
              <SwitcherItem
                aria-label={t("nav.dashboard")}
                onClick={() => navigate("/dashboard")}
              >
                {t("nav.dashboard")}
              </SwitcherItem>
              <SwitcherItem
                aria-label={t("nav.problems")}
                onClick={() => navigate("/problems")}
              >
                {t("nav.problems")}
              </SwitcherItem>
              <SwitcherItem
                aria-label={t("nav.contests")}
                onClick={() => navigate("/contests")}
              >
                {t("nav.contests")}
              </SwitcherItem>
              <SwitcherItem
                aria-label={t("nav.submissions")}
                onClick={() => navigate("/submissions")}
              >
                {t("nav.submissions")}
              </SwitcherItem>

              {(user?.role === "admin" || user?.role === "teacher") && (
                <>
                  <SwitcherDivider />
                  <li className="cds--switcher__item">
                    <span
                      style={{
                        padding: "0.5rem 1rem",
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary)",
                      }}
                    >
                      {t("header.management")}
                    </span>
                  </li>
                  <SwitcherItem
                    aria-label={t("header.problemManagement")}
                    onClick={() => navigate("/management/problems")}
                  >
                    {t("header.problemManagement")}
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label={t("header.createContest")}
                    onClick={() => navigate("/contests/new")}
                  >
                    {t("header.createContest")}
                  </SwitcherItem>
                </>
              )}

              {user?.role === "admin" && (
                <>
                  <SwitcherItem
                    aria-label={t("header.userManagement")}
                    onClick={() => navigate("/system/users")}
                  >
                    {t("header.userManagement")}
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label={t("header.announcements")}
                    onClick={() => navigate("/management/announcements")}
                  >
                    {t("header.announcements")}
                  </SwitcherItem>
                </>
              )}

              {user?.role === "admin" && (
                <>
                  <SwitcherDivider />
                  <li className="cds--switcher__item">
                    <span
                      style={{
                        padding: "0.5rem 1rem",
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary)",
                      }}
                    >
                      {t("header.system")}
                    </span>
                  </li>
                  <SwitcherItem
                    aria-label={t("header.environmentSettings")}
                    onClick={() => navigate("/system/environment")}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Settings size={16} />
                      {t("header.environmentSettings")}
                    </div>
                  </SwitcherItem>
                </>
              )}
            </Switcher>
          </HeaderPanel>
        </Header>
      )}
    />
  );
};
