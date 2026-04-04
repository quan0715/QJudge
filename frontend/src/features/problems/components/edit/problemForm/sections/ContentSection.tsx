import React, { useState } from "react";
import type { FieldPath } from "react-hook-form";
import { Dropdown } from "@carbon/react";
import { InlineEditableMarkdown, MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import { AutoSaveField } from "@/features/problems/components/edit/common";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { Section, FieldRow } from "@/shared/layout/SettingsPanel";
import { TextInput } from "@carbon/react";

const LANGUAGE_OPTIONS = [
  { id: "zh", label: "中文 (繁體)" },
  { id: "en", label: "English" },
];

interface ContentSectionProps {
  /** Use always-visible MarkdownField instead of click-to-edit InlineEditableMarkdown */
  directEdit?: boolean;
}

const ContentSection: React.FC<ContentSectionProps> = ({ directEdit = false }) => {
  const [selectedLanguage, setSelectedLanguage] = useState("zh");
  const isZh = selectedLanguage === "zh";

  const languageSelector = (
    <Dropdown
      id="language-selector"
      titleText=""
      label="選擇語言"
      items={LANGUAGE_OPTIONS}
      itemToString={(item) => (item ? item.label : "")}
      selectedItem={LANGUAGE_OPTIONS.find((l) => l.id === selectedLanguage)}
      onChange={({ selectedItem }) => {
        if (selectedItem) setSelectedLanguage(selectedItem.id);
      }}
      size="sm"
    />
  );

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
    <Section title="題目內容" action={languageSelector}>
      <FieldRow label="題目標題">
        <AutoSaveField name={isZh ? "translationZh.title" : "translationEn.title"}>
          {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
            <TextInput
              id={isZh ? "title-zh" : "title-en"}
              labelText=""
              placeholder={isZh ? "輸入標題..." : "Enter title..."}
              invalid={invalid}
              invalidText={error}
              {...field}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                field.onChange(e);
                onAutoSaveChange(e.target.value);
              }}
              onBlur={() => {
                field.onBlur();
                onAutoSaveBlur();
              }}
            />
          )}
        </AutoSaveField>
      </FieldRow>

      <FieldRow label="題目描述">
        {renderMarkdown(
          isZh ? "translationZh.description" : "translationEn.description",
          isZh ? "description-zh" : "description-en",
          isZh ? "點擊以編輯題目描述..." : "Click to edit description...",
          "150px",
        )}
      </FieldRow>

      <FieldRow label="輸入說明">
        {renderMarkdown(
          isZh ? "translationZh.inputDescription" : "translationEn.inputDescription",
          isZh ? "input-desc-zh" : "input-desc-en",
          isZh ? "點擊以編輯輸入說明..." : "Click to edit input format...",
          "100px",
        )}
      </FieldRow>

      <FieldRow label="輸出說明">
        {renderMarkdown(
          isZh ? "translationZh.outputDescription" : "translationEn.outputDescription",
          isZh ? "output-desc-zh" : "output-desc-en",
          isZh ? "點擊以編輯輸出說明..." : "Click to edit output format...",
          "100px",
        )}
      </FieldRow>

      <FieldRow label={isZh ? "提示（選填）" : "Hint (optional)"}>
        {renderMarkdown(
          isZh ? "translationZh.hint" : "translationEn.hint",
          isZh ? "hint-zh" : "hint-en",
          isZh ? "點擊以編輯提示..." : "Click to edit hint...",
          "80px",
        )}
      </FieldRow>
    </Section>
  );
};

export default ContentSection;
