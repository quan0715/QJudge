import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  NumberInput,
  Dropdown,
  Toggle,
  IconButton,
  Button,
  Modal,
  Tag,
  Accordion,
  AccordionItem,
} from "@carbon/react";
import { Add, TrashCan, Edit } from "@carbon/icons-react";
import { Section, FieldRow, ActionRow } from "@/shared/layout/SettingsPanel";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import { QJudgeEditor } from "@/shared/ui/editor/QJudgeEditor";
import type { BankQuestion, CodingQuestionExt } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import { updateQuestion } from "@/infrastructure/api/repositories/questionBank.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import { GlobalSaveIndicator } from "./GlobalSaveIndicator";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------
const AUTO_SAVE_DELAY = 800;
const toNumberInputValue = (value: string | number): number =>
  typeof value === "number" ? value : Number(value || 0);

const DIFFICULTY_ITEMS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

interface TranslationForm {
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  hint: string;
}

interface TestCaseForm {
  inputData: string;
  outputData: string;
  isSample: boolean;
  isHidden: boolean;
  score: number;
}

interface LanguageConfigForm {
  language: string;
  templateCode: string;
  isEnabled: boolean;
}

interface CodingFormState {
  title: string;
  difficulty: string;
  timeLimit: number;
  memoryLimit: number;
  translationZh: TranslationForm;
  testCases: TestCaseForm[];
  languageConfigs: LanguageConfigForm[];
  forbiddenKeywords: string[];
  requiredKeywords: string[];
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------
const toFormState = (q: BankQuestion): CodingFormState => {
  const ext = q.codingExt;
  const zhTrans = ext?.translations?.find(
    (tr) => tr.language === "zh-TW" || tr.language === "zh",
  );

  return {
    title: q.title || "",
    difficulty: q.difficulty || "medium",
    timeLimit: q.timeLimit || 1000,
    memoryLimit: q.memoryLimit || 128,
    translationZh: {
      title: zhTrans?.title || q.title || "",
      description: zhTrans?.description || "",
      inputDescription: zhTrans?.inputDescription || "",
      outputDescription: zhTrans?.outputDescription || "",
      hint: zhTrans?.hint || "",
    },
    testCases:
      ext?.testCases?.map((tc) => ({
        inputData: tc.inputData || "",
        outputData: tc.outputData || "",
        isSample: tc.isSample ?? false,
        isHidden: tc.isHidden ?? false,
        score: tc.score ?? 0,
      })) || [],
    languageConfigs:
      ext?.languageConfigs?.map((lc) => ({
        language: lc.language,
        templateCode: lc.templateCode || "",
        isEnabled: lc.isEnabled ?? true,
      })) || [{ language: "cpp", templateCode: "", isEnabled: true }],
    forbiddenKeywords: ext?.forbiddenKeywords || [],
    requiredKeywords: ext?.requiredKeywords || [],
  };
};

const buildPayload = (form: CodingFormState, existing: BankQuestion): UpsertBankQuestionPayload => {
  const translations: CodingQuestionExt["translations"] = [];
  if (form.translationZh.title || form.translationZh.description) {
    translations.push({
      language: "zh-TW",
      title: form.translationZh.title,
      description: form.translationZh.description,
      inputDescription: form.translationZh.inputDescription,
      outputDescription: form.translationZh.outputDescription,
      hint: form.translationZh.hint,
    });
  }

  return {
    questionType: "coding",
    title: form.title || form.translationZh.title,
    difficulty: form.difficulty,
    timeLimit: form.timeLimit,
    memoryLimit: form.memoryLimit,
    order: existing.order,
    codingExt: {
      translations: translations.map((tr) => ({
        language: tr.language,
        title: tr.title,
        description: tr.description,
        input_description: tr.inputDescription || "",
        output_description: tr.outputDescription || "",
        hint: tr.hint || "",
      })),
      testCases: form.testCases.map((tc, idx) => ({
        input_data: tc.inputData,
        output_data: tc.outputData,
        is_sample: tc.isSample,
        is_hidden: tc.isHidden,
        weight_percent: tc.score,
        order: idx,
      })),
      languageConfigs: form.languageConfigs
        .filter((lc) => lc.isEnabled)
        .map((lc, idx) => ({
          language: lc.language,
          template_code: lc.templateCode,
          is_enabled: lc.isEnabled,
          order: idx,
        })),
      forbiddenKeywords: form.forbiddenKeywords,
      requiredKeywords: form.requiredKeywords,
    },
  };
};

// ---------------------------------------------------------------------------
// Shared auto-save hook
// ---------------------------------------------------------------------------
interface CodingEditCtx {
  form: CodingFormState;
  update: (patch: Partial<CodingFormState>) => void;
  updateTranslation: (patch: Partial<TranslationForm>) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

function useCodingAutoSave(bankId: string, question: BankQuestion, onSaved?: () => void): CodingEditCtx {
  const { showToast } = useToast();
  const { t } = useTranslation("common");
  const [form, setForm] = useState<CodingFormState>(() => toFormState(question));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const latestRef = useRef(form);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = toFormState(question);
    setForm(next);
    latestRef.current = next;
    setSaveStatus("idle");
  }, [question.bankItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFields = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      const payload = buildPayload(latestRef.current, question);
      await updateQuestion(bankId, question.bankItemId, payload);
      setSaveStatus("saved");
      onSaved?.();
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSaveStatus("error");
      showToast({ kind: "error", title: t("message.error"), subtitle: t("message.saveFailed", "儲存失敗") });
    } finally {
      savingRef.current = false;
    }
  }, [bankId, question, onSaved, showToast, t]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveFields();
    }, AUTO_SAVE_DELAY);
  }, [saveFields]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void saveFields();
      }
    };
  }, [saveFields]);

  const update = useCallback((patch: Partial<CodingFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      latestRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateTranslation = useCallback((patch: Partial<TranslationForm>) => {
    setForm((prev) => {
      const next = { ...prev, translationZh: { ...prev.translationZh, ...patch } };
      latestRef.current = next;
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  return { form, update, updateTranslation, saveStatus };
}

// ---------------------------------------------------------------------------
// Sub-tab: Edit — basic info + content (all MarkdownField)
// ---------------------------------------------------------------------------
const CodingEditTab = ({ ctx }: { ctx: CodingEditCtx }) => {
  const { t } = useTranslation("common");
  const { form, update, updateTranslation } = ctx;

  return (
    <>
      <Section title={t("questionBank.basicInfo", "基本資訊")}>
        <FieldRow label={t("questionBank.title", "標題")}>
          <TextInput
            id="coding-title"
            labelText=""
            hideLabel
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={t("questionBank.titlePlaceholder", "題目標題")}
          />
        </FieldRow>
        <ActionRow label={t("questionBank.difficulty", "難度")}>
          <Dropdown
            id="coding-difficulty"
            label=""
            titleText=""
            hideLabel
            size="sm"
            items={DIFFICULTY_ITEMS}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={DIFFICULTY_ITEMS.find((d) => d.id === form.difficulty) ?? DIFFICULTY_ITEMS[1]}
            onChange={({ selectedItem }) => {
              if (selectedItem) update({ difficulty: selectedItem.id });
            }}
          />
        </ActionRow>
        <ActionRow label={t("questionBank.timeLimit", "時間限制 (ms)")}>
          <NumberInput id="coding-time-limit" hideLabel label="" size="sm" min={100} max={30000} step={100} value={form.timeLimit} onChange={(_e, { value }) => update({ timeLimit: toNumberInputValue(value) })} />
        </ActionRow>
        <ActionRow label={t("questionBank.memoryLimit", "記憶體限制 (MB)")}>
          <NumberInput id="coding-memory-limit" hideLabel label="" size="sm" min={16} max={1024} step={16} value={form.memoryLimit} onChange={(_e, { value }) => update({ memoryLimit: toNumberInputValue(value) })} />
        </ActionRow>
      </Section>

      <Section title={t("questionBank.contentZh", "題目內容（中文）")}>
        <FieldRow label={t("questionBank.description", "題目描述")} description={t("questionBank.descriptionDesc", "支援 Markdown 語法")}>
          <MarkdownField id="coding-description" value={form.translationZh.description} onChange={(v) => updateTranslation({ description: v })} minHeight="200px" placeholder={t("questionBank.descriptionPlaceholder", "輸入題目描述…")} />
        </FieldRow>
        <FieldRow label={t("questionBank.inputDesc", "輸入說明")}>
          <MarkdownField id="coding-input-desc" value={form.translationZh.inputDescription} onChange={(v) => updateTranslation({ inputDescription: v })} minHeight="100px" placeholder={t("questionBank.inputDescPlaceholder", "描述輸入格式…")} />
        </FieldRow>
        <FieldRow label={t("questionBank.outputDesc", "輸出說明")}>
          <MarkdownField id="coding-output-desc" value={form.translationZh.outputDescription} onChange={(v) => updateTranslation({ outputDescription: v })} minHeight="100px" placeholder={t("questionBank.outputDescPlaceholder", "描述輸出格式…")} />
        </FieldRow>
        <FieldRow label={t("questionBank.hint", "提示")}>
          <MarkdownField id="coding-hint" value={form.translationZh.hint} onChange={(v) => updateTranslation({ hint: v })} minHeight="80px" placeholder={t("questionBank.hintPlaceholder", "提供解題提示（選填）")} />
        </FieldRow>
      </Section>
    </>
  );
};

// ---------------------------------------------------------------------------
// Sub-tab: Validation — test cases (inline cards + portaled modal) + keywords
// ---------------------------------------------------------------------------
const CodingValidationTab = ({ ctx }: { ctx: CodingEditCtx }) => {
  const { t } = useTranslation("common");
  const { form, update } = ctx;

  const [tcModalOpen, setTcModalOpen] = useState(false);
  const [tcEditingIdx, setTcEditingIdx] = useState<number | null>(null);
  const [tcEdit, setTcEdit] = useState<TestCaseForm>({ inputData: "", outputData: "", isSample: false, isHidden: false, score: 0 });

  const openAdd = () => { setTcEdit({ inputData: "", outputData: "", isSample: false, isHidden: false, score: 0 }); setTcEditingIdx(null); setTcModalOpen(true); };
  const openEdit = (i: number) => { setTcEdit({ ...form.testCases[i] }); setTcEditingIdx(i); setTcModalOpen(true); };
  const handleSubmit = () => {
    if (tcEditingIdx !== null) {
      update({ testCases: form.testCases.map((tc, idx) => (idx === tcEditingIdx ? { ...tcEdit } : tc)) });
    } else {
      update({ testCases: [...form.testCases, tcEdit] });
    }
    setTcModalOpen(false);
  };
  const removeTc = (i: number) => update({ testCases: form.testCases.filter((_, idx) => idx !== i) });

  const [newForbidden, setNewForbidden] = useState("");
  const [newRequired, setNewRequired] = useState("");
  const addKw = (type: "forbidden" | "required") => {
    const [raw, setter, list, key] = type === "forbidden"
      ? [newForbidden, setNewForbidden, form.forbiddenKeywords, "forbiddenKeywords" as const]
      : [newRequired, setNewRequired, form.requiredKeywords, "requiredKeywords" as const];
    const kw = raw.trim();
    if (!kw || list.includes(kw)) return;
    update({ [key]: [...list, kw] });
    setter("");
  };

  return (
    <>
      {/* Test Cases */}
      <Section
        title={t("questionBank.testCases", "測試資料")}
        description={t("questionBank.testCasesDesc", "範例測試資料會顯示在題目頁面中")}
        action={<Button kind="ghost" size="sm" renderIcon={Add} onClick={openAdd}>{t("questionBank.addTestCase", "新增")}</Button>}
      >
        {form.testCases.length === 0 && (
          <p style={{ color: "var(--cds-text-helper)", padding: "0.5rem 0" }}>{t("questionBank.noTestCases", "尚未新增測試資料")}</p>
        )}
        {form.testCases.map((tc, i) => (
          <div key={i} style={{ padding: "0.75rem 0", borderBottom: i < form.testCases.length - 1 ? "1px solid var(--cds-border-subtle)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>#{i + 1}</span>
                <Tag size="sm" type={tc.isSample ? "cyan" : tc.isHidden ? "cool-gray" : "green"}>
                  {tc.isSample ? t("questionBank.sample", "範例") : tc.isHidden ? t("questionBank.hidden", "隱藏") : t("questionBank.public", "公開")}
                </Tag>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <IconButton kind="ghost" size="sm" label={t("button.edit", "編輯")} onClick={() => openEdit(i)}><Edit size={16} /></IconButton>
                <IconButton kind="ghost" size="sm" label={t("button.delete", "刪除")} onClick={() => removeTc(i)}><TrashCan size={16} /></IconButton>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div>
                <p style={{ fontSize: "0.6875rem", color: "var(--cds-text-helper)", marginBottom: "0.125rem" }}>Input</p>
                <pre style={{ margin: 0, padding: "0.375rem 0.5rem", background: "var(--cds-layer-02)", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "var(--cds-code-01-font-family, monospace)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "4rem", overflow: "hidden" }}>{tc.inputData || "—"}</pre>
              </div>
              <div>
                <p style={{ fontSize: "0.6875rem", color: "var(--cds-text-helper)", marginBottom: "0.125rem" }}>Output</p>
                <pre style={{ margin: 0, padding: "0.375rem 0.5rem", background: "var(--cds-layer-02)", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "var(--cds-code-01-font-family, monospace)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "4rem", overflow: "hidden" }}>{tc.outputData || "—"}</pre>
              </div>
            </div>
          </div>
        ))}
      </Section>

      {/* Test Case Modal — portaled to avoid double-modal stacking */}
      {tcModalOpen && createPortal(
        <Modal
          open
          onRequestClose={() => setTcModalOpen(false)}
          onRequestSubmit={handleSubmit}
          modalHeading={tcEditingIdx !== null ? t("questionBank.editTestCase", "編輯測試資料") : t("questionBank.addTestCase", "新增測試資料")}
          primaryButtonText={t("button.confirm", "確定")}
          secondaryButtonText={t("button.cancel", "取消")}
          size="md"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem 0" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <Toggle id="tc-modal-sample" size="sm" labelText={t("questionBank.sample", "範例")} toggled={tcEdit.isSample} onToggle={(v: boolean) => setTcEdit((p) => ({ ...p, isSample: v, isHidden: v ? false : p.isHidden }))} />
              <Toggle id="tc-modal-hidden" size="sm" labelText={t("questionBank.hidden", "隱藏")} toggled={tcEdit.isHidden} onToggle={(v: boolean) => setTcEdit((p) => ({ ...p, isHidden: v, isSample: v ? false : p.isSample }))} />
            </div>
            <MarkdownField id="tc-modal-input" labelText="Input" value={tcEdit.inputData} onChange={(v) => setTcEdit((p) => ({ ...p, inputData: v }))} minHeight="120px" showPreview={false} />
            <MarkdownField id="tc-modal-output" labelText="Output" value={tcEdit.outputData} onChange={(v) => setTcEdit((p) => ({ ...p, outputData: v }))} minHeight="120px" showPreview={false} />
            <NumberInput id="tc-modal-score" label={t("questionBank.tcScore", "配分 (%)")} size="sm" min={0} max={100} step={10} value={tcEdit.score} onChange={(_e, { value }) => setTcEdit((p) => ({ ...p, score: toNumberInputValue(value) }))} />
          </div>
        </Modal>,
        getModalPortalRoot(),
      )}

      {/* Keywords */}
      <Section title={t("questionBank.codeConstraints", "程式碼限制")}>
        <FieldRow label={t("questionBank.forbiddenKeywords", "禁用關鍵字")} description={t("questionBank.forbiddenKeywordsDesc", "提交的程式碼不可包含這些關鍵字")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: form.forbiddenKeywords.length > 0 ? "0.5rem" : 0 }}>
            {form.forbiddenKeywords.map((kw, i) => (
              <Tag key={i} type="red" size="sm" filter onClose={() => update({ forbiddenKeywords: form.forbiddenKeywords.filter((_, idx) => idx !== i) })}>{kw}</Tag>
            ))}
          </div>
          <TextInput id="forbidden-kw" labelText="" hideLabel size="sm" value={newForbidden} onChange={(e) => setNewForbidden(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKw("forbidden"); } }} placeholder={t("questionBank.keywordPlaceholder", "輸入關鍵字後按 Enter")} />
        </FieldRow>
        <FieldRow label={t("questionBank.requiredKeywords", "必要關鍵字")} description={t("questionBank.requiredKeywordsDesc", "提交的程式碼必須包含這些關鍵字")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: form.requiredKeywords.length > 0 ? "0.5rem" : 0 }}>
            {form.requiredKeywords.map((kw, i) => (
              <Tag key={i} type="green" size="sm" filter onClose={() => update({ requiredKeywords: form.requiredKeywords.filter((_, idx) => idx !== i) })}>{kw}</Tag>
            ))}
          </div>
          <TextInput id="required-kw" labelText="" hideLabel size="sm" value={newRequired} onChange={(e) => setNewRequired(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKw("required"); } }} placeholder={t("questionBank.keywordPlaceholder", "輸入關鍵字後按 Enter")} />
        </FieldRow>
      </Section>
    </>
  );
};

// ---------------------------------------------------------------------------
// Sub-tab: Language — toggle enable + Monaco template (read-only language ID)
// ---------------------------------------------------------------------------
const CodingLanguageTab = ({ ctx }: { ctx: CodingEditCtx }) => {
  const { t } = useTranslation("common");
  const { form, update } = ctx;

  const toggle = (i: number, isEnabled: boolean) => {
    update({ languageConfigs: form.languageConfigs.map((lc, idx) => (idx === i ? { ...lc, isEnabled } : lc)) });
  };
  const updateTemplate = (i: number, templateCode: string) => {
    update({ languageConfigs: form.languageConfigs.map((lc, idx) => (idx === i ? { ...lc, templateCode } : lc)) });
  };

  return (
    <Section title={t("questionBank.languageConfigs", "語言設定")} description={t("questionBank.languageConfigsDesc", "啟用語言並設定初始模板程式碼")}>
      {form.languageConfigs.length === 0 ? (
        <p style={{ color: "var(--cds-text-helper)", padding: "0.5rem 0" }}>{t("questionBank.noLanguages", "尚未設定語言")}</p>
      ) : (
        <Accordion>
          {form.languageConfigs.map((lc, i) => (
            <AccordionItem
              key={lc.language || i}
              title={
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600 }}>{lc.language.toUpperCase()}</span>
                  <Tag size="sm" type={lc.isEnabled ? "green" : "cool-gray"}>
                    {lc.isEnabled ? t("questionBank.enabled", "啟用") : t("questionBank.disabled", "停用")}
                  </Tag>
                </div>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.5rem 0" }}>
                <ActionRow label={t("questionBank.enabledLabel", "啟用此語言")}>
                  <Toggle id={`lang-enabled-${i}`} size="sm" labelText="" hideLabel labelA={t("questionBank.disabled", "停用")} labelB={t("questionBank.enabled", "啟用")} toggled={lc.isEnabled} onToggle={(v: boolean) => toggle(i, v)} />
                </ActionRow>
                {lc.isEnabled && (
                  <FieldRow label={t("questionBank.templateCode", "模板程式碼")} description={t("questionBank.templateCodeDesc", "學生開始作答時的初始程式碼")}>
                    <div style={{ border: "1px solid var(--cds-border-subtle)", borderRadius: "4px", overflow: "hidden" }}>
                      <QJudgeEditor height="200px" language={lc.language || "plaintext"} value={lc.templateCode} onChange={(v) => updateTemplate(i, v ?? "")} />
                    </div>
                  </FieldRow>
                )}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Main — renders the active sub-tab, shares auto-save state across all tabs
// ---------------------------------------------------------------------------
export interface CodingQuestionEditPanelProps {
  bankId: string;
  question: BankQuestion;
  onSaved?: () => void;
  activeTab?: "edit" | "validation" | "languages";
}

const CodingQuestionEditPanel = ({ bankId, question, onSaved, activeTab = "edit" }: CodingQuestionEditPanelProps) => {
  const ctx = useCodingAutoSave(bankId, question, onSaved);

  return (
    <>
      <GlobalSaveIndicator status={ctx.saveStatus} />
      {activeTab === "edit" && <CodingEditTab ctx={ctx} />}
      {activeTab === "validation" && <CodingValidationTab ctx={ctx} />}
      {activeTab === "languages" && <CodingLanguageTab ctx={ctx} />}
    </>
  );
};

export default CodingQuestionEditPanel;
