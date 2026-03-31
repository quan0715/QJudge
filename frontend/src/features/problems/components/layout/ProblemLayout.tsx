import { useState } from "react";
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
import { UserMenu } from "@/features/app/components/UserMenu";
import { SideMenu } from "@/features/app/components/SideMenu";
import { SideMenuToggle } from "@/features/app/components/SideMenuToggle";

const ProblemLayout = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <Header aria-label="Problem Platform">
        <SideMenuToggle
          isOpen={sideMenuOpen}
          onClick={() => setSideMenuOpen((o) => !o)}
        />
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
          <UserMenu />
        </HeaderGlobalBar>

        <SideMenu
          isOpen={sideMenuOpen}
          onClose={() => setSideMenuOpen(false)}
        />
      </Header>

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
