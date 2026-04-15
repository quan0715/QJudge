import React from "react";
import type { FieldPath } from "react-hook-form";
import { InlineEditableMarkdown, MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import { AutoSaveField } from "@/features/problems/components/edit/common";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { Section, FieldRow } from "@/shared/layout/SettingsPanel";

interface ContentSectionProps {
  /** Use always-visible MarkdownField instead of click-to-edit InlineEditableMarkdown */
  directEdit?: boolean;
}

const ContentSection: React.FC<ContentSectionProps> = ({ directEdit = false }) => {
  const renderMarkdown = (
    name: FieldPath<ProblemFormSchema>,
    id: string,
    placeholder: string,
    minHeight: string,
  ) => (
    <AutoSaveField name={name}>
      {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) =>
        directEdit ? (
          <MarkdownField
            id={id}
            value={String(field.value ?? "")}
            onChange={(value) => { field.onChange(value); onAutoSaveChange(value); }}
            minHeight={minHeight}
            placeholder={placeholder}
            invalid={invalid}
            invalidText={error}
          />
        ) : (
          <InlineEditableMarkdown
            id={id}
            labelText=""
            value={String(field.value ?? "")}
            onChange={(value) => { field.onChange(value); onAutoSaveChange(value); }}
            onBlur={onAutoSaveBlur}
            placeholder={placeholder}
            minHeight={minHeight}
            invalid={invalid}
            invalidText={error}
          />
        )
      }
    </AutoSaveField>
  );

  return (
    <Section title="題目內容">
      <FieldRow label="題目描述">
        {renderMarkdown(
          "translationZh.description",
          "description",
          "點擊以編輯題目描述...",
          "150px",
        )}
      </FieldRow>

      <FieldRow label="輸入說明">
        {renderMarkdown(
          "translationZh.inputDescription",
          "input-desc",
          "點擊以編輯輸入說明...",
          "100px",
        )}
      </FieldRow>

      <FieldRow label="輸出說明">
        {renderMarkdown(
          "translationZh.outputDescription",
          "output-desc",
          "點擊以編輯輸出說明...",
          "100px",
        )}
      </FieldRow>

      <FieldRow label="提示（選填）">
        {renderMarkdown(
          "translationZh.hint",
          "hint",
          "點擊以編輯提示...",
          "80px",
        )}
      </FieldRow>
    </Section>
  );
};

export default ContentSection;
