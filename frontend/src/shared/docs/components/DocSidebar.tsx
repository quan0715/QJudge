import type { ComponentType, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SideNavItems, SideNavMenu, SideNavMenuItem } from "@carbon/react";
import { DocumentBlank } from "@carbon/icons-react";
import type { DocSiteConfig } from "@/core/docs";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";
import styles from "./DocSidebar.module.scss";

export interface DocSidebarProps {
  config: DocSiteConfig;
  currentSlug: string;
  /** Callback when a link is clicked (for closing mobile menu) */
  onLinkClick?: () => void;
}

const DocSidebar: React.FC<DocSidebarProps> = ({
  config,
  currentSlug,
  onLinkClick,
}) => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();
  const { routeBase, sectionIcons } = useDocsFramework();

  const handleNavigation = (slug: string) => {
    navigate(`${routeBase}/${slug}`, { replace: false });
    onLinkClick?.();
  };

  return (
    <nav className={styles.nav} aria-label={t("nav.productLabel", "使用說明")}>
      <SideNavItems className={styles.items} isSideNavExpanded>
        {config.sections.map((section) => {
          const Icon = ((section.icon
            ? sectionIcons[section.icon]
            : undefined) || DocumentBlank) as ComponentType;
          const hasActiveItem = section.items.includes(currentSlug);
          const sectionLabel =
            section.title ||
            t(section.titleKey || `nav.sections.${section.id}`, section.id);

          return (
            <SideNavMenu
              key={`${section.id}-${hasActiveItem ? "active" : "idle"}`}
              className={styles.menuSection}
              renderIcon={Icon}
              title={sectionLabel}
              defaultExpanded={hasActiveItem}
              isActive={hasActiveItem}
              isSideNavExpanded
            >
              {section.items.map((item) => {
                const isActive = currentSlug === item;

                return (
                  <SideNavMenuItem
                    key={item}
                    className={styles.menuItem}
                    href={`#${routeBase}/${item}`}
                    isActive={isActive}
                    aria-current={isActive ? "page" : undefined}
                    onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                      event.preventDefault();
                      handleNavigation(item);
                    }}
                  >
                    {t(`nav.items.${item}`, item)}
                  </SideNavMenuItem>
                );
              })}
            </SideNavMenu>
          );
        })}
      </SideNavItems>
    </nav>
  );
};

export default DocSidebar;
