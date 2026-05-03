import type { ChangeEvent } from "react";
import { Information, Locked, View, Security } from "@carbon/icons-react";
import { SettingsModal, type SettingsModalNavItem } from "@/shared/ui/modal/SettingsModal";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";
import GeneralSettingsPanel from "./GeneralSettingsPanel";
import AccessSettingsPanel from "./AccessSettingsPanel";
import DisplaySettingsPanel from "./DisplaySettingsPanel";
import CheatDetectionPanel from "./CheatDetectionPanel";

interface ContestSettingsModalProps extends ContestSettingsPanelProps {
  open: boolean;
  onRequestClose: () => void;
  // General panel date/time props
  startDateInput: Date | null;
  endDateInput: Date | null;
  startTimeInput: string;
  endTimeInput: string;
  startMeridiem: "AM" | "PM";
  endMeridiem: "AM" | "PM";
  onStartDateChange: (dates: Date[]) => void;
  onEndDateChange: (dates: Date[]) => void;
  onStartTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEndTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartMeridiemChange: (value: string) => void;
  onEndMeridiemChange: (value: string) => void;
  // Access panel danger zone
  onArchive: () => void;
  onDelete: () => void;
}

const NAV_ITEM_DEFS: (Omit<SettingsModalNavItem, "label"> & { labelKey: string; fallback: string })[] = [
  { id: "general", labelKey: "settings.basicInfo", fallback: "基本資訊", icon: Information },
  { id: "access", labelKey: "settings.accessControl", fallback: "狀態與權限", icon: Locked },
  { id: "display", labelKey: "settings.displaySettings", fallback: "顯示設定", icon: View },
  { id: "cheatDetection", labelKey: "settings.examModeSettings", fallback: "防作弊監控設定", icon: Security },
];

export default function ContestSettingsModal({
  open,
  onRequestClose,
  t,
  tc,
  contest,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
  startDateInput,
  endDateInput,
  startTimeInput,
  endTimeInput,
  startMeridiem,
  endMeridiem,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onStartMeridiemChange,
  onEndMeridiemChange,
  onArchive,
  onDelete,
}: ContestSettingsModalProps) {
  const sharedProps: ContestSettingsPanelProps = {
    t, tc, contest, form, getState, onRetry, onChange, onConfirmedChange,
  };
  const navItems = NAV_ITEM_DEFS.map(({ labelKey, fallback, ...item }) => ({
    ...item,
    label: t(labelKey, fallback),
  }));

  const renderPanel = (activeId: string) => {
    switch (activeId) {
      case "general":
        return (
          <GeneralSettingsPanel
            {...sharedProps}
            startDateInput={startDateInput}
            endDateInput={endDateInput}
            startTimeInput={startTimeInput}
            endTimeInput={endTimeInput}
            startMeridiem={startMeridiem}
            endMeridiem={endMeridiem}
            onStartDateChange={onStartDateChange}
            onEndDateChange={onEndDateChange}
            onStartTimeChange={onStartTimeChange}
            onEndTimeChange={onEndTimeChange}
            onStartMeridiemChange={onStartMeridiemChange}
            onEndMeridiemChange={onEndMeridiemChange}
          />
        );
      case "access":
        return (
          <AccessSettingsPanel
            {...sharedProps}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        );
      case "display":
        return <DisplaySettingsPanel {...sharedProps} />;
      case "cheatDetection":
        return <CheatDetectionPanel {...sharedProps} />;
      default:
        return null;
    }
  };

  return (
    <SettingsModal
      open={open}
      onRequestClose={onRequestClose}
      modalHeading={t("settings.title", "競賽設定")}
      navItems={navItems}
      renderPanel={renderPanel}
    />
  );
}
