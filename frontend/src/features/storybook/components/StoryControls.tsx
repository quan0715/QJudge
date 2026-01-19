import {
  TextInput,
  NumberInput,
  Toggle,
  Dropdown,
  Tag,
  Button,
} from "@carbon/react";
import { Reset } from "@carbon/icons-react";
import type { ArgType } from "@/shared/types/story.types";

interface StoryControlsProps {
  argTypes: Record<string, ArgType>;
  values: Record<string, unknown>;
  defaultValues: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset: () => void;
}

const StoryControls: React.FC<StoryControlsProps> = ({
  argTypes,
  values,
  defaultValues,
  onChange,
  onReset,
}) => {
  const renderControl = (key: string, argType: ArgType) => {
    const value = values[key] ?? defaultValues[key] ?? argType.defaultValue;
    const label = argType.label || key;

    switch (argType.control) {
      case "text":
        return (
          <TextInput
            id={`control-${key}`}
            labelText={label}
            helperText={argType.description}
            value={String(value || "")}
            onChange={(e) => onChange(key, e.target.value)}
            size="sm"
          />
        );

      case "number":
        return (
          <NumberInput
            id={`control-${key}`}
            label={label}
            helperText={argType.description}
            value={Number(value) || 0}
            onChange={(_, { value: newValue }) => onChange(key, newValue)}
            size="sm"
            hideSteppers
          />
        );

      case "boolean":
        return (
          <div>
            <label
              className="cds--label"
              style={{ display: "block", marginBottom: "0.5rem" }}
            >
              {label}
            </label>
            <Toggle
              id={`control-${key}`}
              labelA="False"
              labelB="True"
              toggled={Boolean(value)}
              onToggle={(toggled) => onChange(key, toggled)}
              size="sm"
              hideLabel
            />
            {argType.description && (
              <p className="cds--form__helper-text">{argType.description}</p>
            )}
          </div>
        );

      case "select":
        return (
          <Dropdown
            id={`control-${key}`}
            label="Select..."
            titleText={label}
            helperText={argType.description}
            items={argType.options || []}
            selectedItem={String(value)}
            onChange={({ selectedItem }) => onChange(key, selectedItem)}
            size="sm"
          />
        );

      case "multi-select":
        return (
          <div>
            <label className="cds--label">{label}</label>
            {argType.description && (
              <p
                className="cds--form__helper-text"
                style={{ marginBottom: "0.5rem" }}
              >
                {argType.description}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
              {(argType.options || []).map((option) => {
                const isSelected = Array.isArray(value) && value.includes(option);
                return (
                  <Tag
                    key={option}
                    type={isSelected ? "blue" : "gray"}
                    size="sm"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      const currentValue = Array.isArray(value) ? value : [];
                      if (isSelected) {
                        onChange(
                          key,
                          currentValue.filter((v) => v !== option)
                        );
                      } else {
                        onChange(key, [...currentValue, option]);
                      }
                    }}
                  >
                    {option}
                  </Tag>
                );
              })}
            </div>
          </div>
        );

      case "array":
        return (
          <div>
            <label className="cds--label">{label}</label>
            {argType.description && (
              <p
                className="cds--form__helper-text"
                style={{ marginBottom: "0.5rem" }}
              >
                {argType.description}
              </p>
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.25rem",
                marginBottom: "0.5rem",
              }}
            >
              {Array.isArray(value) &&
                value.map((item, index) => (
                  <Tag
                    key={index}
                    type="gray"
                    size="sm"
                    filter
                    onClose={() => {
                      const newValue = [...value];
                      newValue.splice(index, 1);
                      onChange(key, newValue);
                    }}
                  >
                    {String(item)}
                  </Tag>
                ))}
            </div>
            <TextInput
              id={`control-${key}-add`}
              labelText=""
              placeholder="輸入後按 Enter 新增"
              size="sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const input = e.target as HTMLInputElement;
                  if (input.value.trim()) {
                    const currentValue = Array.isArray(value) ? value : [];
                    onChange(key, [...currentValue, input.value.trim()]);
                    input.value = "";
                  }
                }
              }}
            />
          </div>
        );

      case "object":
        return (
          <div>
            <label className="cds--label">{label}</label>
            {argType.description && (
              <p
                className="cds--form__helper-text"
                style={{ marginBottom: "0.5rem" }}
              >
                {argType.description}
              </p>
            )}
            <pre
              style={{
                fontSize: "0.75rem",
                padding: "0.5rem",
                background: "var(--cds-layer-02)",
                borderRadius: "4px",
                overflow: "auto",
                maxHeight: "150px",
              }}
            >
              {JSON.stringify(value, null, 2)}
            </pre>
          </div>
        );

      default:
        return (
          <div>
            <label className="cds--label">{label}</label>
            <pre
              style={{
                fontSize: "0.75rem",
                padding: "0.5rem",
                background: "var(--cds-layer-02)",
                borderRadius: "4px",
                overflow: "auto",
              }}
            >
              {JSON.stringify(value, null, 2)}
            </pre>
          </div>
        );
    }
  };

  const controlKeys = Object.keys(argTypes);

  if (controlKeys.length === 0) {
    return (
      <p
        className="cds--type-body-compact-01"
        style={{ color: "var(--cds-text-secondary)" }}
      >
        此組件沒有定義可調整的 Props
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Reset Button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Reset}
          onClick={onReset}
        >
          重設
        </Button>
      </div>

      {/* Controls */}
      {controlKeys.map((key) => (
        <div key={key}>{renderControl(key, argTypes[key])}</div>
      ))}
    </div>
  );
};

export default StoryControls;
