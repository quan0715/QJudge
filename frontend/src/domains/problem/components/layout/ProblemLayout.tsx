import { Outlet, useNavigate } from "react-router-dom";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderNavigation,
  HeaderMenuItem,
} from "@carbon/react";
import { Home } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/ui/components/UserMenu";

const ProblemLayout = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <Header aria-label="Problem Platform">
        <HeaderName
          href="#"
          prefix="NYCU"
          onClick={(e) => {
            e.preventDefault();
            navigate("/dashboard");
          }}
        >
          QJudge
        </HeaderName>
        <HeaderNavigation aria-label="Problem Navigation">
          <HeaderMenuItem onClick={() => navigate("/problems")}>
            {t("nav.backToProblemList")}
          </HeaderMenuItem>
        </HeaderNavigation>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={t("nav.dashboard")}
            tooltipAlignment="center"
            onClick={() => navigate("/dashboard")}
          >
            <Home size={20} />
          </HeaderGlobalAction>

          {/* User Menu - contains theme and language settings */}
          <UserMenu />
        </HeaderGlobalBar>
      </Header>

      {/* Main Content - Account for fixed header height */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: "3rem",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default ProblemLayout;
