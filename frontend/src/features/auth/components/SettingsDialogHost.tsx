import { lazy, Suspense } from "react";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";

import { useSettingsDialog } from "@/features/auth/contexts/SettingsDialogContext";

const SettingsDialog = lazy(() => import("./SettingsDialog"));

export default function SettingsDialogHost() {
  const { t } = useTranslation("common");
  const { isOpen } = useSettingsDialog();

  if (!isOpen) return null;

  return (
    <Suspense
      fallback={
        <Loading
          description={t("message.loading")}
          withOverlay
        />
      }
    >
      <SettingsDialog />
    </Suspense>
  );
}
