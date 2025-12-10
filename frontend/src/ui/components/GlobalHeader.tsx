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
} from "@carbon/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import { useTheme } from "@/ui/theme/ThemeContext";
import { Settings } from "@carbon/icons-react";
import { DatabaseSwitcher } from "./DatabaseSwitcher";
import "./GlobalHeader.scss"; // Assuming a SCSS file for component-specific styles

export const GlobalHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isUserMenuExpanded, setIsUserMenuExpanded] = useState(false);
  const [isSwitcherExpanded, setIsSwitcherExpanded] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setIsUserMenuExpanded(false);
  };

  const handleUserMenuClick = () => {
    setIsUserMenuExpanded(!isUserMenuExpanded);
    setIsSwitcherExpanded(false);
  };

  const handleSwitcherClick = () => {
    setIsSwitcherExpanded(!isSwitcherExpanded);
    setIsUserMenuExpanded(false);
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
              Dashboard
            </HeaderMenuItem>
            <HeaderMenuItem
              isCurrentPage={location.pathname.startsWith("/problems")}
              onClick={() => navigate("/problems")}
            >
              Problems
            </HeaderMenuItem>
            <HeaderMenuItem
              isCurrentPage={location.pathname.startsWith("/contests")}
              onClick={() => navigate("/contests")}
            >
              Contests
            </HeaderMenuItem>
            <HeaderMenuItem
              isCurrentPage={location.pathname.startsWith("/submissions")}
              onClick={() => navigate("/submissions")}
            >
              Submissions
            </HeaderMenuItem>
          </HeaderNavigation>
          <HeaderGlobalBar>
            <HeaderGlobalAction
              aria-label={
                theme === "g100"
                  ? "Switch to Light Mode"
                  : "Switch to Dark Mode"
              }
              onClick={toggleTheme}
            >
              {theme === "g100" ? <Sun size={20} /> : <Moon size={20} />}
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label="App Switcher"
              isActive={isSwitcherExpanded}
              onClick={handleSwitcherClick}
            >
              <SwitcherIcon size={20} />
            </HeaderGlobalAction>

            {user ? (
              <HeaderGlobalAction
                aria-label="User Menu"
                isActive={isUserMenuExpanded}
                onClick={handleUserMenuClick}
              >
                <UserAvatar size={20} />
              </HeaderGlobalAction>
            ) : (
              <HeaderGlobalAction
                aria-label="Login"
                onClick={() => navigate("/login")}
              >
                <Login size={20} />
              </HeaderGlobalAction>
            )}
          </HeaderGlobalBar>

          <HeaderPanel
            aria-label="User Menu"
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
            <Switcher aria-label="User Menu Options">
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
                    {user?.role
                      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                      : "Student"}
                  </span>
                </div>
              </li>
              <SwitcherDivider />
              <SwitcherItem aria-label="Logout" onClick={handleLogout}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    color: "var(--cds-support-error)",
                  }}
                >
                  <Logout size={20} />
                  <span style={{ fontWeight: 500 }}>Logout</span>
                </div>
              </SwitcherItem>
            </Switcher>
          </HeaderPanel>

          <HeaderPanel
            aria-label="Switcher Panel"
            expanded={isSwitcherExpanded}
            {...{ style: { position: "fixed", right: 0, top: "48px" } }}
          >
            <Switcher aria-label="Switcher Options">
              <SwitcherItem
                aria-label="Dashboard"
                onClick={() => navigate("/dashboard")}
              >
                Dashboard
              </SwitcherItem>
              <SwitcherItem
                aria-label="Problems"
                onClick={() => navigate("/problems")}
              >
                Problems
              </SwitcherItem>
              <SwitcherItem
                aria-label="Contests"
                onClick={() => navigate("/contests")}
              >
                Contests
              </SwitcherItem>
              <SwitcherItem
                aria-label="Leaderboard"
                onClick={() => navigate("/ranking")}
              >
                Leaderboard
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
                      Management
                    </span>
                  </li>
                  <SwitcherItem
                    aria-label="Problem Management"
                    onClick={() => navigate("/management/problems")}
                  >
                    Problem Management
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label="Contest Creation"
                    onClick={() => navigate("/contests/new")}
                  >
                    Create Contest
                  </SwitcherItem>
                </>
              )}

              {user?.role === "admin" && (
                <>
                  <SwitcherItem
                    aria-label="User Management"
                    onClick={() => navigate("/admin/users")}
                  >
                    User Management
                  </SwitcherItem>
                  <SwitcherItem
                    aria-label="Announcements"
                    onClick={() => navigate("/management/announcements")}
                  >
                    Announcements
                  </SwitcherItem>
                </>
              )}

              {/* Development Tools - Only visible in dev mode for admin users */}
              {user?.role === "admin" && import.meta.env.DEV && (
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
                      Development
                    </span>
                  </li>
                  {/* Database Switcher - Quick toggle */}
                  <DatabaseSwitcher isAdmin={user?.role === "admin"} />
                  {/* Environment Page Link */}
                  <SwitcherItem
                    aria-label="Environment"
                    onClick={() => navigate("/admin/environment")}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Settings size={16} />
                      Environment Settings
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
