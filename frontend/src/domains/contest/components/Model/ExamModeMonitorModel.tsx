import { Modal, UnorderedList, ListItem } from "@carbon/react";
import { View, Warning } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

export const ExamModeMonitorModel = ({
  open,
  onRequestClose,
}: {
  open: boolean;
  onRequestClose: () => void;
}) => {
  const { t } = useTranslation("contest");

  return (
    <Modal
      open={open}
      modalHeading={t("monitor.title")}
      passiveModal
      onRequestClose={onRequestClose}
      size="sm"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Header with icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem",
            backgroundColor: "var(--cds-notification-background-warning)",
            borderLeft: "3px solid var(--cds-support-warning)",
          }}
        >
          <View
            size={24}
            style={{ color: "var(--cds-support-warning)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: "var(--cds-body-compact-01-font-size, 0.875rem)",
              fontWeight: 600,
              color: "var(--cds-text-primary)",
            }}
          >
            {t("monitor.antiCheatEnabled")}
          </span>
        </div>

        {/* Rules section */}
        <div>
          <p
            style={{
              fontSize: "var(--cds-body-compact-01-font-size, 0.875rem)",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("monitor.rulesTitle")}
          </p>
          <UnorderedList>
            <ListItem>{t("monitor.noTabSwitch")}</ListItem>
            <ListItem>{t("monitor.noExitFullscreen")}</ListItem>
            <ListItem>{t("monitor.noWindowBlur")}</ListItem>
          </UnorderedList>
        </div>

        {/* Warning message */}
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "4px",
            border: "1px solid var(--cds-border-subtle)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <Warning
              size={20}
              style={{
                color: "var(--cds-support-error)",
                flexShrink: 0,
                marginTop: "2px",
              }}
            />
            <p
              style={{
                fontSize: "var(--cds-body-compact-01-font-size, 0.875rem)",
                color: "var(--cds-text-primary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t("monitor.warningMessage")}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
