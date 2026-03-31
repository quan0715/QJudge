import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { usePendingActions } from "./usePendingActions";

/**
 * Info banner shown on login/register screens when the user
 * arrived via a pending action (e.g. classroom invite link,
 * teacher activation link).
 */
export const PendingActionBanner = () => {
  const { t } = useTranslation();
  const { activeBanner } = usePendingActions();

  if (!activeBanner) return null;

  return (
    <InlineNotification
      kind="info"
      title={t(activeBanner.titleKey)}
      subtitle={t(activeBanner.subtitleKey)}
      lowContrast
      hideCloseButton
    />
  );
};
