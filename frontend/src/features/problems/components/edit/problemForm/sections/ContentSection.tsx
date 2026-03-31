import React, { useState } from "react";
import { Dropdown } from "@carbon/react";
import { InlineEditableMarkdown } from "@/shared/ui/markdown/markdownEditor";
import { AutoSaveField } from "@/features/problems/components/edit/common";
import { Section, FieldRow } from "@/shared/layout/SettingsPanel";
import { TextInput } from "@carbon/react";

const LANGUAGE_OPTIONS = [
  { id: "zh", label: "中文 (繁體)" },
  { id: "en", label: "English" },
];

const ContentSection: React.FC = () => {
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
        <AutoSaveField name={isZh ? "translationZh.description" : "translationEn.description"}>
          {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
            <InlineEditableMarkdown
              id={isZh ? "description-zh" : "description-en"}
              labelText=""
              value={field.value}
              onChange={(value) => { field.onChange(value); onAutoSaveChange(value); }}
              onBlur={onAutoSaveBlur}
              placeholder={isZh ? "點擊以編輯題目描述..." : "Click to edit description..."}
              minHeight="150px"
              invalid={invalid}
              invalidText={error}
            />
          )}
        </AutoSaveField>
      </FieldRow>

      <FieldRow label="輸入說明">
        <AutoSaveField name={isZh ? "translationZh.inputDescription" : "translationEn.inputDescription"}>
          {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
            <InlineEditableMarkdown
              id={isZh ? "input-desc-zh" : "input-desc-en"}
              labelText=""
              value={field.value}
              onChange={(value) => { field.onChange(value); onAutoSaveChange(value); }}
              onBlur={onAutoSaveBlur}
              placeholder={isZh ? "點擊以編輯輸入說明..." : "Click to edit input format..."}
              minHeight="100px"
              invalid={invalid}
              invalidText={error}
            />
          )}
        </AutoSaveField>
      </FieldRow>

      <FieldRow label="輸出說明">
        <AutoSaveField name={isZh ? "translationZh.outputDescription" : "translationEn.outputDescription"}>
          {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
            <InlineEditableMarkdown
              id={isZh ? "output-desc-zh" : "output-desc-en"}
              labelText=""
              value={field.value}
              onChange={(value) => { field.onChange(value); onAutoSaveChange(value); }}
              onBlur={onAutoSaveBlur}
              placeholder={isZh ? "點擊以編輯輸出說明..." : "Click to edit output format..."}
              minHeight="100px"
              invalid={invalid}
              invalidText={error}
            />
          )}
        </AutoSaveField>
      </FieldRow>

      <FieldRow label={isZh ? "提示（選填）" : "Hint (optional)"}>
        <AutoSaveField name={isZh ? "translationZh.hint" : "translationEn.hint"}>
          {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
            <InlineEditableMarkdown
              id={isZh ? "hint-zh" : "hint-en"}
              labelText=""
              value={field.value}
              onChange={(value) => { field.onChange(value); onAutoSaveChange(value); }}
              onBlur={onAutoSaveBlur}
              placeholder={isZh ? "點擊以編輯提示..." : "Click to edit hint..."}
              minHeight="80px"
              invalid={invalid}
              invalidText={error}
            />
          )}
        </AutoSaveField>
      </FieldRow>
    </Section>
  );
};

export default ContentSection;
