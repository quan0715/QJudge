import React from "react";
import { useFormContext, Controller, type ControllerRenderProps, type FieldPath } from "react-hook-form";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import { FieldSaveIndicator } from "./FieldSaveIndicator";
import styles from "./AutoSaveField.module.scss";

/**
 * Props for the render function
 */
export interface AutoSaveFieldRenderProps<TName extends FieldPath<ProblemFormSchema>> {
  field: ControllerRenderProps<ProblemFormSchema, TName>;
  error?: string;
  invalid: boolean;
  onAutoSaveChange: (value: unknown) => void;
  onAutoSaveBlur: () => void;
}

/**
 * AutoSaveField props
 */
export interface AutoSaveFieldProps<TName extends FieldPath<ProblemFormSchema>> {
  /** Field name in the form schema */
  name: TName;
  /** Render function for the field */
  children: (props: AutoSaveFieldRenderProps<TName>) => React.ReactNode;
  /** Show save indicator next to field (default: false - only show in navbar) */
  showSaveIndicator?: boolean;
  /** Additional className for container */
  className?: string;
}

/**
 * AutoSaveField - Wrapper component for form fields with auto-save
 *
 * Features:
 * - Integrates with ProblemEditContext for auto-save
 * - Shows FieldSaveIndicator next to the field
 * - Shows inline validation errors
 * - Handles onChange (debounced) and onBlur (immediate) saves
 *
 * Usage:
 * ```tsx
 * <AutoSaveField name="title">
 *   {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
 *     <TextInput
 *       id="title"
 *       labelText="Title"
 *       invalid={invalid}
 *       invalidText={error}
 *       {...field}
 *       onChange={(e) => {
 *         field.onChange(e);
 *         onAutoSaveChange(e.target.value);
 *       }}
 *       onBlur={() => {
 *         field.onBlur();
 *         onAutoSaveBlur();
 *       }}
 *     />
 *   )}
 * </AutoSaveField>
 * ```
 */
export function AutoSaveField<TName extends FieldPath<ProblemFormSchema>>({
  name,
  children,
  showSaveIndicator = false, // Default: only show status in navbar
  className,
}: AutoSaveFieldProps<TName>) {
  const { control, formState: { errors }, getValues } = useFormContext<ProblemFormSchema>();
  const { handleFieldChange, handleFieldBlur, getFieldSaveState, autoSave } = useProblemEdit();

  // Get nested error message
  const getErrorMessage = (): string | undefined => {
    const parts = name.split(".");
    let current: unknown = errors;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    if (current && typeof current === "object" && "message" in current) {
      return (current as { message?: string }).message;
    }
    return undefined;
  };

  const errorMessage = getErrorMessage();
  const saveState = getFieldSaveState(name);

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const onAutoSaveChange = (value: unknown) => {
          handleFieldChange(name, value);
        };

        const onAutoSaveBlur = () => {
          const currentValue = getValues(name);
          handleFieldBlur(name, currentValue);
        };

        return (
          <div className={`${styles.container} ${className || ""}`}>
            <div className={styles.fieldWrapper}>
              {children({
                field,
                error: errorMessage,
                invalid: !!errorMessage,
                onAutoSaveChange,
                onAutoSaveBlur,
              })}
            </div>
            {showSaveIndicator && saveState && (
              <FieldSaveIndicator
                status={saveState.status}
                error={saveState.error}
                onRetry={() => autoSave.retrySave(name)}
                className={styles.indicator}
              />
            )}
          </div>
        );
      }}
    />
  );
}

export default AutoSaveField;
