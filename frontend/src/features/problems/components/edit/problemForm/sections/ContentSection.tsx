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

interface MarkdownEditorFieldProps {
  name: FieldPath<ProblemFormSchema>;
  id: string;
  placeholder: string;
  minHeight: string;
  directEdit: boolean;
}

const MarkdownEditorField: React.FC<MarkdownEditorFieldProps> = ({
  name,
  id,
  placeholder,
  minHeight,
  directEdit,
}) => (
  <AutoSaveField name={name}>
    {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) =>
      directEdit ? (
        <MarkdownField
          id={id}
          value={String(field.value ?? "")}
          onChange={(value) => {
            field.onChange(value);
            onAutoSaveChange(value);
          }}
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
          onChange={(value) => {
            field.onChange(value);
            onAutoSaveChange(value);
          }}
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

export const HintField: React.FC<{ directEdit?: boolean }> = ({ directEdit = false }) => (
  <FieldRow label="提示（選填）">
    <MarkdownEditorField
      name="translationZh.hint"
      id="hint"
      placeholder="點擊以編輯提示..."
      minHeight="80px"
      directEdit={directEdit}
    />
  </FieldRow>
);

const ContentSection: React.FC<ContentSectionProps> = ({ directEdit = false }) => (
  <Section title="題目內容">
    <FieldRow label="題目描述">
      <MarkdownEditorField
        name="translationZh.description"
        id="description"
        placeholder="點擊以編輯題目描述..."
        minHeight="150px"
        directEdit={directEdit}
      />
    </FieldRow>

    <FieldRow label="輸入說明">
      <MarkdownEditorField
        name="translationZh.inputDescription"
        id="input-desc"
        placeholder="點擊以編輯輸入說明..."
        minHeight="100px"
        directEdit={directEdit}
      />
    </FieldRow>

    <FieldRow label="輸出說明">
      <MarkdownEditorField
        name="translationZh.outputDescription"
        id="output-desc"
        placeholder="點擊以編輯輸出說明..."
        minHeight="100px"
        directEdit={directEdit}
      />
    </FieldRow>

  </Section>
);

export default ContentSection;
