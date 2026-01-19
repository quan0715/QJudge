import React, { useState, useCallback } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  Toggle,
  TextInput,
  Button,
  Tag,
  Layer,
  Accordion,
  AccordionItem,
  Stack,
} from "@carbon/react";
import { Add, Code, Warning } from "@carbon/icons-react";
import Editor from "@monaco-editor/react";
import {
  DEFAULT_TEMPLATES,
  LANGUAGE_OPTIONS,
} from "@/features/problems/constants/codeTemplates";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import styles from "./LanguageConfigSection.module.scss";

/**
 * LanguageConfigSection - Clean Carbon-based language and restriction settings
 * 
 * Features:
 * - Accordion for each language with toggle and code editor
 * - Clean keyword management with tags
 * - Auto-save integration
 */
const LanguageConfigSection: React.FC = () => {
  const { control, watch, setValue, getValues } = useFormContext<ProblemFormSchema>();
  const { handleFieldChange } = useProblemEdit();

  const languageConfigs = watch("languageConfigs") || [];
  const forbiddenKeywords = watch("forbiddenKeywords") || [];
  const requiredKeywords = watch("requiredKeywords") || [];

  // Keyword input state
  const [newForbiddenKeyword, setNewForbiddenKeyword] = useState("");
  const [newRequiredKeyword, setNewRequiredKeyword] = useState("");

  // Trigger auto-save for language configs
  const triggerLanguageConfigSave = useCallback(() => {
    setTimeout(() => {
      const currentConfigs = getValues("languageConfigs");
      handleFieldChange("languageConfigs", currentConfigs);
    }, 0);
  }, [getValues, handleFieldChange]);

  // Trigger auto-save for keywords
  const triggerKeywordsSave = useCallback((field: "forbiddenKeywords" | "requiredKeywords") => {
    setTimeout(() => {
      const currentKeywords = getValues(field);
      handleFieldChange(field, currentKeywords);
    }, 0);
  }, [getValues, handleFieldChange]);

  // Add required keyword
  const addRequiredKeyword = useCallback(() => {
    if (newRequiredKeyword.trim()) {
      const updated = [...requiredKeywords, newRequiredKeyword.trim()];
      setValue("requiredKeywords", updated);
      setNewRequiredKeyword("");
      triggerKeywordsSave("requiredKeywords");
    }
  }, [newRequiredKeyword, requiredKeywords, setValue, triggerKeywordsSave]);

  // Remove required keyword
  const removeRequiredKeyword = useCallback((index: number) => {
    const updated = requiredKeywords.filter((_, i) => i !== index);
    setValue("requiredKeywords", updated);
    triggerKeywordsSave("requiredKeywords");
  }, [requiredKeywords, setValue, triggerKeywordsSave]);

  // Add forbidden keyword
  const addForbiddenKeyword = useCallback(() => {
    if (newForbiddenKeyword.trim()) {
      const updated = [...forbiddenKeywords, newForbiddenKeyword.trim()];
      setValue("forbiddenKeywords", updated);
      setNewForbiddenKeyword("");
      triggerKeywordsSave("forbiddenKeywords");
    }
  }, [newForbiddenKeyword, forbiddenKeywords, setValue, triggerKeywordsSave]);

  // Remove forbidden keyword
  const removeForbiddenKeyword = useCallback((index: number) => {
    const updated = forbiddenKeywords.filter((_, i) => i !== index);
    setValue("forbiddenKeywords", updated);
    triggerKeywordsSave("forbiddenKeywords");
  }, [forbiddenKeywords, setValue, triggerKeywordsSave]);

  // Count enabled languages
  const enabledCount = languageConfigs.filter((lc) => lc?.isEnabled !== false).length;

  return (
    <Stack gap={7}>
      {/* Language Settings */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <Code size={20} />
            <h3>程式語言設定</h3>
          </div>
          <Tag type="blue" size="sm">
            {enabledCount} / {LANGUAGE_OPTIONS.length} 已啟用
          </Tag>
        </div>
        <p className={styles.sectionDesc}>
          設定此題目可使用的程式語言，以及每種語言的範本程式碼
        </p>

        <Accordion align="start" className={styles.languageAccordion}>
          {LANGUAGE_OPTIONS.map((lang, langIndex) => {
            const config = languageConfigs?.[langIndex];
            const isEnabled = config?.isEnabled !== false;

            return (
              <AccordionItem
                key={lang.id}
                title={
                  <div className={styles.accordionTitle}>
                    <span>{lang.label}</span>
                    <Tag
                      type={isEnabled ? "green" : "gray"}
                      size="sm"
                    >
                      {isEnabled ? "啟用" : "停用"}
                    </Tag>
                  </div>
                }
              >
                <Layer className={styles.languageContent}>
                  <Controller
                    name={`languageConfigs.${langIndex}.isEnabled`}
                    control={control}
                    render={({ field }) => (
                      <Toggle
                        id={`lang-toggle-${lang.id}`}
                        labelText="啟用此語言"
                        labelA="停用"
                        labelB="啟用"
                        toggled={field.value !== false}
                        onToggle={(checked) => {
                          field.onChange(checked);
                          triggerLanguageConfigSave();
                        }}
                      />
                    )}
                  />

                  {isEnabled && (
                    <div className={styles.templateEditor}>
                      <label className={styles.editorLabel}>範本程式碼</label>
                      <Controller
                        name={`languageConfigs.${langIndex}.templateCode`}
                        control={control}
                        render={({ field }) => (
                          <div className={styles.editorWrapper}>
                            <Editor
                              height="180px"
                              language={lang.id === "cpp" ? "cpp" : lang.id}
                              value={field.value || DEFAULT_TEMPLATES[lang.id]}
                              theme="vs-dark"
                              onChange={(value) => {
                                field.onChange(value || "");
                              }}
                              onMount={(editor) => {
                                // Trigger save on blur
                                editor.onDidBlurEditorWidget(() => {
                                  triggerLanguageConfigSave();
                                });
                              }}
                              options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                fontLigatures: false,
                                lineNumbers: "on",
                                padding: { top: 8, bottom: 8 },
                                fontFamily:
                                  "'JetBrains Mono NL', 'SF Mono', 'Menlo', 'Consolas', monospace",
                              }}
                            />
                          </div>
                        )}
                      />
                    </div>
                  )}
                </Layer>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      {/* Keyword Restrictions */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <Warning size={20} />
            <h3>關鍵字限制</h3>
          </div>
        </div>
        <p className={styles.sectionDesc}>
          設定學生提交的程式碼中必須包含或禁止使用的關鍵字
        </p>

        <div className={styles.keywordsGrid}>
          {/* Required Keywords */}
          <Layer className={styles.keywordCard}>
            <h4 className={styles.keywordCardTitle}>
              <Tag type="green" size="sm">必須使用</Tag>
            </h4>
            <div className={styles.keywordInput}>
              <TextInput
                id="new-required-keyword"
                labelText=""
                placeholder="輸入關鍵字後按 Enter..."
                value={newRequiredKeyword}
                onChange={(e) => setNewRequiredKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRequiredKeyword();
                  }
                }}
              />
              <Button
                kind="tertiary"
                size="md"
                hasIconOnly
                renderIcon={Add}
                iconDescription="新增"
                onClick={addRequiredKeyword}
              />
            </div>
            <div className={styles.keywordTags}>
              {requiredKeywords.length === 0 ? (
                <span className={styles.keywordEmpty}>尚無限制</span>
              ) : (
                requiredKeywords.map((kw, index) => (
                  <Tag
                    key={index}
                    type="green"
                    size="sm"
                    onClose={() => removeRequiredKeyword(index)}
                    filter
                  >
                    {kw}
                  </Tag>
                ))
              )}
            </div>
          </Layer>

          {/* Forbidden Keywords */}
          <Layer className={styles.keywordCard}>
            <h4 className={styles.keywordCardTitle}>
              <Tag type="red" size="sm">禁止使用</Tag>
            </h4>
            <div className={styles.keywordInput}>
              <TextInput
                id="new-forbidden-keyword"
                labelText=""
                placeholder="輸入關鍵字後按 Enter..."
                value={newForbiddenKeyword}
                onChange={(e) => setNewForbiddenKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addForbiddenKeyword();
                  }
                }}
              />
              <Button
                kind="tertiary"
                size="md"
                hasIconOnly
                renderIcon={Add}
                iconDescription="新增"
                onClick={addForbiddenKeyword}
              />
            </div>
            <div className={styles.keywordTags}>
              {forbiddenKeywords.length === 0 ? (
                <span className={styles.keywordEmpty}>尚無限制</span>
              ) : (
                forbiddenKeywords.map((kw, index) => (
                  <Tag
                    key={index}
                    type="red"
                    size="sm"
                    onClose={() => removeForbiddenKeyword(index)}
                    filter
                  >
                    {kw}
                  </Tag>
                ))
              )}
            </div>
          </Layer>
        </div>
      </section>
    </Stack>
  );
};

export default LanguageConfigSection;
