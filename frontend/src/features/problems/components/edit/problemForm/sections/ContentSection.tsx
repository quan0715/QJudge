import React, { useState } from "react";
import { TextInput, Dropdown } from "@carbon/react";
import { InlineEditableMarkdown } from "@/shared/ui/markdown/markdownEditor";
import { AutoSaveField } from "@/features/problems/components/edit/common";

const LANGUAGE_OPTIONS = [
  { id: "zh", label: "中文 (繁體)" },
  { id: "en", label: "English" },
];

/**
 * ContentSection - Form section for problem content translations.
 * Uses language dropdown for switching between translations.
 * Uses AutoSaveField for field-level auto-save.
 */
const ContentSection: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("zh");

  const isZh = selectedLanguage === "zh";

  return (
    <div className="content-section">
      {/* Language Selector */}
      <div className="content-section__language-selector">
        <Dropdown
          id="language-selector"
          titleText="編輯語言版本 / Edit Language Version"
          label="選擇語言"
          items={LANGUAGE_OPTIONS}
          itemToString={(item) => (item ? item.label : "")}
          selectedItem={LANGUAGE_OPTIONS.find((l) => l.id === selectedLanguage)}
          onChange={({ selectedItem }) => {
            if (selectedItem) {
              setSelectedLanguage(selectedItem.id);
            }
          }}
        />
      </div>

      {/* Chinese Translation Fields */}
      {isZh && (
        <div className="content-section__fields">
          <div className="content-section__field">
            <AutoSaveField name="translationZh.title">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <TextInput
                  id="title-zh"
                  labelText="題目標題"
                  placeholder="輸入標題..."
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
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationZh.description">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="description-zh"
                  labelText="題目描述"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="點擊以編輯題目描述..."
                  minHeight="150px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationZh.inputDescription">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="input-desc-zh"
                  labelText="輸入說明"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="點擊以編輯輸入說明..."
                  minHeight="100px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationZh.outputDescription">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="output-desc-zh"
                  labelText="輸出說明"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="點擊以編輯輸出說明..."
                  minHeight="100px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationZh.hint">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="hint-zh"
                  labelText="提示（選填）"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="點擊以編輯提示..."
                  minHeight="80px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>
        </div>
      )}

      {/* English Translation Fields */}
      {!isZh && (
        <div className="content-section__fields">
          <div className="content-section__field">
            <AutoSaveField name="translationEn.title">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <TextInput
                  id="title-en"
                  labelText="Title"
                  placeholder="Enter title..."
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
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationEn.description">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="description-en"
                  labelText="Description"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="Click to edit description..."
                  minHeight="150px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationEn.inputDescription">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="input-desc-en"
                  labelText="Input Format"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="Click to edit input format..."
                  minHeight="100px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationEn.outputDescription">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="output-desc-en"
                  labelText="Output Format"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="Click to edit output format..."
                  minHeight="100px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>

          <div className="content-section__field">
            <AutoSaveField name="translationEn.hint">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <InlineEditableMarkdown
                  id="hint-en"
                  labelText="Hint (optional)"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onAutoSaveChange(value);
                  }}
                  onBlur={onAutoSaveBlur}
                  placeholder="Click to edit hint..."
                  minHeight="80px"
                  invalid={invalid}
                  invalidText={error}
                />
              )}
            </AutoSaveField>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentSection;
