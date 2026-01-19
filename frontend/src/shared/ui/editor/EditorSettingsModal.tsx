import React from "react";
import {
  Modal,
  RadioButtonGroup,
  RadioButton,
  FormGroup,
  NumberInput,
} from "@carbon/react";

export interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
}

interface EditorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onSettingsChange: (settings: Partial<EditorSettings>) => void;
}

/**
 * EditorSettingsModal - Modal for configuring editor settings
 *
 * Allows users to customize:
 * - Font size (10-24)
 * - Tab size (2 or 4 spaces)
 */
export const EditorSettingsModal: React.FC<EditorSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}) => {
  const handleFontSizeChange = (
    _event: React.SyntheticEvent,
    state: { value: number | string; direction: string }
  ) => {
    const value = typeof state.value === "string" ? parseInt(state.value, 10) : state.value;
    if (!isNaN(value) && value >= 10 && value <= 24) {
      onSettingsChange({ fontSize: value });
    }
  };

  const handleTabSizeChange = (value: string | number | undefined) => {
    if (value === undefined) return;
    const tabSize = Number(value) as 2 | 4;
    if (tabSize === 2 || tabSize === 4) {
      onSettingsChange({ tabSize });
    }
  };

  return (
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      modalHeading="編輯器設定"
      passiveModal
      size="sm"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Font Size */}
        <FormGroup legendText="字體大小">
          <NumberInput
            id="editor-font-size"
            label=""
            hideLabel
            min={10}
            max={24}
            step={1}
            value={settings.fontSize}
            onChange={handleFontSizeChange}
            invalidText="請輸入 10-24 之間的數字"
          />
        </FormGroup>

        {/* Tab Size */}
        <FormGroup legendText="縮排空格數">
          <RadioButtonGroup
            name="tab-size-selection"
            valueSelected={settings.tabSize}
            onChange={handleTabSizeChange}
            orientation="horizontal"
          >
            <RadioButton id="tab-size-2" value={2} labelText="2 spaces" />
            <RadioButton id="tab-size-4" value={4} labelText="4 spaces" />
          </RadioButtonGroup>
        </FormGroup>
      </div>
    </Modal>
  );
};

export default EditorSettingsModal;
