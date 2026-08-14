import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";

import styles from "./PageLoading.module.scss";

interface PageLoadingProps {
  description?: string;
  fullScreen?: boolean;
}

export function PageLoading({
  description,
  fullScreen = false,
}: PageLoadingProps) {
  const { t } = useTranslation("common");

  return (
    <div
      className={[styles.root, fullScreen && styles.fullScreen]
        .filter(Boolean)
        .join(" ")}
      aria-busy="true"
    >
      <Loading
        description={description ?? t("message.loading")}
        withOverlay={false}
      />
    </div>
  );
}

export default PageLoading;
