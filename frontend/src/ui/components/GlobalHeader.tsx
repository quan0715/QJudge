import { useState, useEffect, useRef } from "react";
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
import { Switcher as SwitcherIcon, Settings } from "@carbon/icons-react";
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

  const [isSwitcherExpanded, setIsSwitcherExpanded] = useState(false);

  const switcherRef = useRef<HTMLDivElement>(null);

  // Close switcher panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        isSwitcherExpanded &&
        switcherRef.current &&
        !switcherRef.current.contains(target)
      ) {
        const switcherButton = document.querySelector(
          '[aria-label="' + t("header.appSwitcher") + '"]'
        );
        if (!switcherButton?.contains(target)) {
          setIsSwitcherExpanded(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSwitcherExpanded, t]);

  const handleSwitcherClick = () => {
    setIsSwitcherExpanded(!isSwitcherExpanded);
  };

  const handleUserMenuExpandedChange = (expanded: boolean) => {
    if (expanded) {
      setIsSwitcherExpanded(false);
    }
  };

  return (
    <>
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
              <HeaderMenuItem
                isCurrentPage={location.pathname.startsWith("/docs")}
                onClick={() => navigate("/docs")}
              >
                {t("nav.documentation")}
              </HeaderMenuItem>
            </HeaderNavigation>
            <HeaderGlobalBar>
              <HeaderGlobalAction
                aria-label={t("header.appSwitcher")}
                isActive={isSwitcherExpanded}
                onClick={handleSwitcherClick}
              >
                <SwitcherIcon size={20} />
              </HeaderGlobalAction>

              <UserMenu
                otherPanelExpanded={isSwitcherExpanded}
                onExpandedChange={handleUserMenuExpandedChange}
              />
            </HeaderGlobalBar>

            {/* App Switcher Panel */}
            <HeaderPanel
              aria-label={t("header.appSwitcher")}
              expanded={isSwitcherExpanded}
            >
              <div ref={switcherRef}>
                <Switcher aria-label={t("header.appSwitcher")}>
                  <SwitcherItem
                    aria-label={t("nav.dashboard")}
                    onClick={() => {
                      navigate("/dashboard");
                      setIsSwitcherExpanded(false);
                    }}
                  >
                    {t("nav.dashboard")}
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label={t("nav.problems")}
                    onClick={() => {
                      navigate("/problems");
                      setIsSwitcherExpanded(false);
                    }}
                  >
                    {t("nav.problems")}
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label={t("nav.contests")}
                    onClick={() => {
                      navigate("/contests");
                      setIsSwitcherExpanded(false);
                    }}
                  >
                    {t("nav.contests")}
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label={t("nav.submissions")}
                    onClick={() => {
                      navigate("/submissions");
                      setIsSwitcherExpanded(false);
                    }}
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
                        onClick={() => {
                          navigate("/management/problems");
                          setIsSwitcherExpanded(false);
                        }}
                      >
                        {t("header.problemManagement")}
                      </SwitcherItem>
                      <SwitcherItem
                        aria-label={t("header.createContest")}
                        onClick={() => {
                          navigate("/contests/new");
                          setIsSwitcherExpanded(false);
                        }}
                      >
                        {t("header.createContest")}
                      </SwitcherItem>
                    </>
                  )}

                  {user?.role === "admin" && (
                    <>
                      <SwitcherItem
                        aria-label={t("header.userManagement")}
                        onClick={() => {
                          navigate("/system/users");
                          setIsSwitcherExpanded(false);
                        }}
                      >
                        {t("header.userManagement")}
                      </SwitcherItem>
                      <SwitcherItem
                        aria-label={t("header.announcements")}
                        onClick={() => {
                          navigate("/management/announcements");
                          setIsSwitcherExpanded(false);
                        }}
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
                        onClick={() => {
                          navigate("/system/environment");
                          setIsSwitcherExpanded(false);
                        }}
                      >
                        <Settings size={16} style={{ marginRight: "0.5rem" }} />
                        {t("header.environmentSettings")}
                      </SwitcherItem>
                    </>
                  )}
                </Switcher>
              </div>
            </HeaderPanel>
          </Header>
        )}
      />
    </>
  );
};
