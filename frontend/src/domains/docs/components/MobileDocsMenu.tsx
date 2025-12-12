import { useState } from "react";
import { Button, Modal } from "@carbon/react";
import { Menu } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import DocSidebar from "./DocSidebar";
import { SkeletonText } from "@carbon/react";
import styles from "./MobileDocsMenu.module.scss";

interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
  defaultDoc: string;
}

interface MobileDocsMenuProps {
  config: DocConfig | null;
  currentSlug: string;
}

/**
 * Mobile navigation menu for documentation pages.
 * Shows as a button that opens a modal with the sidebar navigation.
 */
const MobileDocsMenu: React.FC<MobileDocsMenuProps> = ({ config, currentSlug }) => {
  const { t } = useTranslation("docs");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        renderIcon={Menu}
        onClick={() => setIsOpen(true)}
        className={styles.menuButton}
        aria-label={t("nav.menu", "選單")}
      >
        {t("nav.menu", "選單")}
      </Button>

      <Modal
        open={isOpen}
        onRequestClose={() => setIsOpen(false)}
        modalHeading={t("nav.productLabel", "使用說明")}
        passiveModal
        size="sm"
        className={styles.mobileMenuModal}
      >
        <div className={styles.modalContent}>
          {config ? (
            <DocSidebar config={config} currentSlug={currentSlug} />
          ) : (
            <SkeletonText paragraph lineCount={8} />
          )}
        </div>
      </Modal>
    </>
  );
};

export default MobileDocsMenu;
