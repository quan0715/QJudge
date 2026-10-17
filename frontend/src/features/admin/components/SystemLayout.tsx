import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem } from "@carbon/react";
import {
  BareMetalServer,
  Dashboard,
  Network_3,
  Upgrade,
  UserMultiple,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import { UserMenu } from "@/features/app/components/UserMenu";
import { useMediaQuery } from "@/shared/hooks";
import AdminShellLayout, { type NavItem } from "@/shared/layout/AdminShellLayout";
import styles from "./SystemLayout.module.scss";

const SECTIONS = [
  { id: "overview", path: "/system", icon: Dashboard, labelKey: "system.nav.overview", label: "概覽" },
  { id: "users", path: "/system/users", icon: UserMultiple, labelKey: "system.nav.users", label: "使用者" },
  {
    id: "service-status",
    path: "/system/service-status",
    icon: BareMetalServer,
    labelKey: "system.nav.serviceStatus",
    label: "服務狀態",
  },
  { id: "ingress", path: "/system/ingress", icon: Network_3, labelKey: "system.nav.ingress", label: "Ingress" },
  { id: "version", path: "/system/version", icon: Upgrade, labelKey: "system.nav.version", label: "系統版本" },
] as const;

const isCurrentSection = (pathname: string, sectionPath: string) => {
  const current = pathname.replace(/\/+$/, "");
  return current === sectionPath || (sectionPath !== "/system" && current.startsWith(`${sectionPath}/`));
};

// Below Carbon's md breakpoint a 16rem nav would leave the content about 120px.
const PHONE_QUERY = "(max-width: 671px)";

const SystemLayout = () => {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const isPhone = useMediaQuery(PHONE_QUERY);

  const navItems: NavItem[] = SECTIONS.map((section) => ({
    id: section.id,
    icon: section.icon,
    label: t(section.labelKey, section.label),
    isActive: isCurrentSection(location.pathname, section.path),
    href: section.path,
    onClick: () => navigate(section.path),
  }));

  return (
    <AdminShellLayout
      headerAriaLabel={tc("header.systemAdmin", "系統管理")}
      headerLeft={
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.brand}>
            QJudge
          </Link>
          <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
            <BreadcrumbItem isCurrentPage>{tc("header.systemAdmin", "系統管理")}</BreadcrumbItem>
          </Breadcrumb>
        </div>
      }
      headerActions={<UserMenu />}
      sideNavAriaLabel={tc("header.adminNavigation", "管理導覽")}
      sideNavMode={{ variant: isPhone ? "rail" : "expanded" }}
      navItems={navItems}
    >
      <div className={styles.scroll}>
        <Outlet />
      </div>
    </AdminShellLayout>
  );
};

export default SystemLayout;
