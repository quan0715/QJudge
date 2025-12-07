
import { useState, useEffect } from 'react';
import { 
  Form, TextInput, TextArea, NumberInput, Dropdown, 
  Button, InlineNotification, Toggle, Grid, Column,
  ContentSwitcher, Switch,
  FormLabel, Accordion, AccordionItem
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import { TestCaseList } from './common/TestCaseList';
import { TagSelect } from './common/TagSelect';
import Editor from '@monaco-editor/react';
import { DEFAULT_TEMPLATES, LANGUAGE_OPTIONS } from '@/domains/problem/constants/codeTemplates';
import { getTags } from '@/services/problem';
import type { Tag, TestCase, Translation, LanguageConfig } from '@/core/entities/problem.entity';

export interface ProblemFormData {
  title: string;
  slug: string;
  difficulty: string;
  timeLimit: number;
  memoryLimit: number;
  isVisible: boolean;
  order: number;
  translations: Translation[];
  testCases: TestCase[];
  languageConfigs: LanguageConfig[];
  existingTagIds?: number[]; // IDs of existing tags
  newTagNames?: string[]; // Names of new tags to create
}

interface ProblemFormProps {
  initialData?: Partial<ProblemFormData>;
  onSubmit: (data: ProblemFormData) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  isEditMode: boolean;
  isContestMode?: boolean;
  loading?: boolean;
  error?: string;
  success?: string;
}

const ProblemForm = ({
  initialData,
  onSubmit,
  onCancel,
  onDelete,
  isEditMode,
  // isContestMode = false,
  loading = false,
  error: externalError,
  success: externalSuccess,
}: ProblemFormProps) => {
  // Basic Info
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [timeLimit, setTimeLimit] = useState(1000);
  const [memoryLimit, setMemoryLimit] = useState(128);
  const [isVisible, setIsVisible] = useState(true);

  // Tags
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedExistingTagIds, setSelectedExistingTagIds] = useState<number[]>([]);
  const [pendingNewTagNames, setPendingNewTagNames] = useState<string[]>([]);

  // Translation (Chinese)
  const [translationTitle, setTranslationTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inputDescription, setInputDescription] = useState('');
  const [outputDescription, setOutputDescription] = useState('');
  const [hint, setHint] = useState('');

  // Translation (English)
  const [translationTitleEn, setTranslationTitleEn] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [inputDescriptionEn, setInputDescriptionEn] = useState('');
  const [outputDescriptionEn, setOutputDescriptionEn] = useState('');
  const [hintEn, setHintEn] = useState('');

  // Test Cases
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  // Language Configs - Only C++ enabled by default
  const [languageConfigs, setLanguageConfigs] = useState<LanguageConfig[]>(
    LANGUAGE_OPTIONS.map((lang, index) => ({
      language: lang.id,
      templateCode: DEFAULT_TEMPLATES[lang.id],
      isEnabled: lang.id === 'cpp', // Only C++ enabled
      order: index
    }))
  );

  // Load tags on mount
  const [tagsLoading, setTagsLoading] = useState(true);
  useEffect(() => {
    const loadTags = async () => {
      setTagsLoading(true);
      try {
        const tags = await getTags();
        setAvailableTags(tags);
      } catch (error) {
        console.error('Failed to load tags:', error);
      } finally {
        setTagsLoading(false);
      }
    };
    loadTags();
  }, []);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDifficulty(initialData.difficulty || 'medium');
      setTimeLimit(initialData.timeLimit || 1000);
      setMemoryLimit(initialData.memoryLimit || 128);
      setIsVisible(initialData.isVisible ?? true);

      // Load translations
      const transZh = initialData.translations?.find((t: Translation) => t.language === 'zh-TW' || t.language === 'zh-hant');
      if (transZh) {
        setTranslationTitle(transZh.title);
        setDescription(transZh.description);
        setInputDescription(transZh.inputDescription);
        setOutputDescription(transZh.outputDescription);
        setHint(transZh.hint || '');
      }

      const transEn = initialData.translations?.find((t: Translation) => t.language === 'en');
      if (transEn) {
        setTranslationTitleEn(transEn.title);
        setDescriptionEn(transEn.description);
        setInputDescriptionEn(transEn.inputDescription);
        setOutputDescriptionEn(transEn.outputDescription);
        setHintEn(transEn.hint || '');
      }

      // Load test cases
      if (initialData.testCases && initialData.testCases.length > 0) {
        setTestCases(initialData.testCases);
      }

      // Load language configs
      if (initialData.languageConfigs && initialData.languageConfigs.length > 0) {
        setLanguageConfigs(initialData.languageConfigs);
      }

      // Load tags - can be existingTagIds (number[]) or tags (Tag[])
      if (initialData.existingTagIds && initialData.existingTagIds.length > 0) {
        setSelectedExistingTagIds(initialData.existingTagIds);
      } else if ((initialData as any).tags) {
        const tags = (initialData as any).tags;
        // Handle both number[] and Tag[] formats
        if (typeof tags[0] === 'number') {
          setSelectedExistingTagIds(tags as number[]);
        } else {
          setSelectedExistingTagIds(tags.map((t: any) => Number(t.id)));
        }
      }
    }
  }, [initialData]);

  // Test Case Handlers
  const handleAddTestCase = (input: string, output: string, isHidden?: boolean) => {
    const newTestCase: TestCase = {
      input,
      output,
      isSample: !isHidden, // isSample = !isHidden (public tests are samples)
      score: 10,
      order: testCases.length,
      isHidden: isHidden ?? false
    };
    setTestCases(prev => [...prev, newTestCase]);
  };

  const handleDeleteTestCase = (id: string) => {
    const idx = parseInt(id);
    setTestCases(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateTestCase = (id: string, input: string, output: string) => {
    const idx = parseInt(id);
    setTestCases(prev => prev.map((tc, i) => 
      i === idx ? { ...tc, input, output } : tc
    ));
  };

  const handleToggleVisibility = (id: string, isHidden: boolean) => {
    const idx = parseInt(id);
    setTestCases(prev => prev.map((tc, i) => 
      // If hiding, it cannot be a sample anymore
      i === idx ? { ...tc, isHidden, ...(isHidden ? { isSample: false } : {}) } : tc
    ));
  };

  const handleToggleSample = (id: string, isSample: boolean) => {
    const idx = parseInt(id);
    setTestCases(prev => prev.map((tc, i) => 
      // If setting as sample, also ensure it's visible (not hidden)
      i === idx ? { ...tc, isSample, ...(isSample ? { isHidden: false } : {}) } : tc
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const translations: Translation[] = [
      {
        language: 'zh-TW',
        title: translationTitle,
        description,
        inputDescription: inputDescription,
        outputDescription: outputDescription,
        hint
      }
    ];

    // Add English translation if provided
    if (translationTitleEn || descriptionEn) {
      translations.push({
        language: 'en',
        title: translationTitleEn || translationTitle,
        description: descriptionEn || description,
        inputDescription: inputDescriptionEn || inputDescription,
        outputDescription: outputDescriptionEn || outputDescription,
        hint: hintEn || hint
      });
    }

    const payload: ProblemFormData = {
      title: title || translationTitle,
      slug: '', // Will be auto-generated by backend
      difficulty,
      timeLimit,
      memoryLimit,
      isVisible,
      order: 0, // Default order
      translations,
      testCases,
      languageConfigs,
      existingTagIds: selectedExistingTagIds,
      newTagNames: pendingNewTagNames
    };

    await onSubmit(payload);
  };

  // Content Switcher State
  const [activeSection, setActiveSection] = useState('basic');

  return (
    <div style={{ width: '100%' }}>
      {externalError && (
        <InlineNotification
          kind="error"
          title="錯誤"
          subtitle={externalError}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {externalSuccess && (
        <InlineNotification
          kind="success"
          title="成功"
          subtitle={externalSuccess}
          style={{ marginBottom: '1rem' }}
        />
      )}

      <div style={{ display: 'flex', gap: '2rem' }}>
        {/* Form Section */}
        <div style={{ flex: '1 1 100%' }}>
          <Form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '2rem' }}>
                <ContentSwitcher 
                    size="lg"
                    selectedIndex={['basic', 'content', 'testcases', 'languages'].indexOf(activeSection)}
                    onChange={({ name }) => setActiveSection(name as string)}
                >
                    <Switch name="basic" text="基本資訊" />
                    <Switch name="content" text="題目內容" />
                    <Switch name="testcases" text="測試案例" />
                    <Switch name="languages" text="語言設定" />
                </ContentSwitcher>
            </div>

            {/* Basic Info Section */}
            <div style={{ display: activeSection === 'basic' ? 'block' : 'none' }}>
                  <Grid style={{ marginTop: '1rem' }}>
                    <Column lg={16} md={8} sm={4}>
                      <TextInput
                        id="problem-title"
                        labelText="題目標題 (全局) *"
                        placeholder="輸入題目標題..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>
                    <Column lg={4} md={4} sm={4}>
                      <Dropdown
                        id="difficulty"
                        titleText="難度"
                        label="選擇難度"
                        items={[
                          { id: 'easy', label: '簡單' },
                          { id: 'medium', label: '中等' },
                          { id: 'hard', label: '困難' }
                        ]}
                        itemToString={(item) => item ? item.label : ''}
                        selectedItem={[
                          { id: 'easy', label: '簡單' },
                          { id: 'medium', label: '中等' },
                          { id: 'hard', label: '困難' }
                        ].find(i => i.id === difficulty)}
                        onChange={({ selectedItem }) => setDifficulty(selectedItem?.id || 'medium')}
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>
                    <Column lg={4} md={4} sm={4}>
                      <NumberInput
                        id="time-limit"
                        label="時間限制 (ms)"
                        value={timeLimit}
                        onChange={(e: any) => setTimeLimit(e.imaginaryTarget?.value || timeLimit)}
                        min={100}
                        step={100}
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>
                    <Column lg={4} md={4} sm={4}>
                      <NumberInput
                        id="memory-limit"
                        label="記憶體限制 (MB)"
                        value={memoryLimit}
                        onChange={(e: any) => setMemoryLimit(e.imaginaryTarget?.value || memoryLimit)}
                        min={16}
                        step={16}
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>

                    <Column lg={16} md={8} sm={4}>
                      <Toggle
                        id="is-visible"
                        labelText="題目可見性"
                        labelA="隱藏"
                        labelB="可見"
                        toggled={isVisible}
                        onToggle={(checked) => setIsVisible(checked)}
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>

                    <Column lg={16} md={8} sm={4}>
                      <TagSelect
                        availableTags={availableTags}
                        selectedTagIds={selectedExistingTagIds}
                        onSelectionChange={setSelectedExistingTagIds}
                        pendingNewTags={pendingNewTagNames}
                        onPendingNewTagsChange={setPendingNewTagNames}
                        loading={tagsLoading}
                        titleText="標籤"
                        placeholder="搜尋或建立標籤..."
                      />
                    </Column>
                  </Grid>
            </div>

            {/* Content Section - Using Accordion for Language Versions */}
            <div style={{ display: activeSection === 'content' ? 'block' : 'none' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <FormLabel style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>
                        語言版本 / Language Versions
                    </FormLabel>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
                        展開下方的區塊來編輯各語言版本的題目內容
                    </p>
                    
                    <Accordion>
                        {/* Chinese Version */}
                        <AccordionItem title="中文 (繁體)" open>
                            <Grid>
                                <Column lg={16}>
                                    <TextInput
                                        id="title-zh"
                                        labelText="題目標題 *"
                                        placeholder="輸入標題..."
                                        value={translationTitle}
                                        onChange={(e) => setTranslationTitle(e.target.value)}
                                        required
                                        style={{ marginBottom: '1rem' }}
                                    />
                                    <TextArea
                                        id="description-zh"
                                        labelText="題目描述 (Markdown)"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={8}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={8}>
                                    <TextArea
                                        id="input-desc-zh"
                                        labelText="輸入說明 (Markdown)"
                                        value={inputDescription}
                                        onChange={(e) => setInputDescription(e.target.value)}
                                        rows={4}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={8}>
                                    <TextArea
                                        id="output-desc-zh"
                                        labelText="輸出說明 (Markdown)"
                                        value={outputDescription}
                                        onChange={(e) => setOutputDescription(e.target.value)}
                                        rows={4}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={16}>
                                    <TextArea
                                        id="hint-zh"
                                        labelText="提示 (Markdown)"
                                        value={hint}
                                        onChange={(e) => setHint(e.target.value)}
                                        rows={2}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                            </Grid>
                        </AccordionItem>

                        {/* English Version */}
                        <AccordionItem title="English">
                            <Grid>
                                <Column lg={16}>
                                    <TextInput
                                        id="title-en"
                                        labelText="Title"
                                        placeholder="Enter title..."
                                        value={translationTitleEn}
                                        onChange={(e) => setTranslationTitleEn(e.target.value)}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                    <TextArea
                                        id="description-en"
                                        labelText="Description (Markdown)"
                                        value={descriptionEn}
                                        onChange={(e) => setDescriptionEn(e.target.value)}
                                        rows={8}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={8}>
                                    <TextArea
                                        id="input-desc-en"
                                        labelText="Input Format (Markdown)"
                                        value={inputDescriptionEn}
                                        onChange={(e) => setInputDescriptionEn(e.target.value)}
                                        rows={4}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={8}>
                                    <TextArea
                                        id="output-desc-en"
                                        labelText="Output Format (Markdown)"
                                        value={outputDescriptionEn}
                                        onChange={(e) => setOutputDescriptionEn(e.target.value)}
                                        rows={4}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={16}>
                                    <TextArea
                                        id="hint-en"
                                        labelText="Hint (Markdown)"
                                        value={hintEn}
                                        onChange={(e) => setHintEn(e.target.value)}
                                        rows={2}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                            </Grid>
                        </AccordionItem>
                    </Accordion>
                </div>
            </div>

            {/* Test Cases Section */}
            <div style={{ display: activeSection === 'testcases' ? 'block' : 'none' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
                        設定題目的測試案例。公開的測資會顯示給學生作為範例，隱藏的測資用於評分。
                    </p>
                </div>
                <TestCaseList
                    mode="problem"
                    items={testCases.map((tc, index) => ({
                        id: String(index),
                        input: tc.input,
                        output: tc.output,
                        isSample: tc.isSample,
                        isHidden: tc.isHidden ?? false
                    }))}
                    onAdd={handleAddTestCase}
                    onDelete={handleDeleteTestCase}
                    onUpdate={handleUpdateTestCase}
                    onToggleVisibility={handleToggleVisibility}
                    onToggleSample={handleToggleSample}
                />
            </div>

            {/* Languages Section */}
            <div style={{ display: activeSection === 'languages' ? 'block' : 'none' }}>
                 <div style={{ padding: '1rem' }}>
                    <h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>允許的程式語言</h4>
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const config = languageConfigs.find(c => c.language === lang.id);
                      const isEnabled = config?.isEnabled ?? true;
                      
                      return (
                        <div key={lang.id} style={{ marginBottom: '2rem' }}>
                          <Toggle
                            id={`lang-${lang.id}`}
                            labelText={lang.label}
                            labelA="停用"
                            labelB="啟用"
                            toggled={isEnabled}
                            onToggle={(checked) => {
                                setLanguageConfigs(prev => 
                                  prev.map(c => 
                                    c.language === lang.id 
                                      ? { ...c, isEnabled: checked }
                                      : c
                                  )
                                );
                            }}
                            style={{ marginBottom: '0.5rem' }}
                          />
                          
                          {isEnabled && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                                範本程式碼
                              </div>
                              <div style={{ border: '1px solid var(--cds-border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                                <Editor
                                  height="200px"
                                  language={lang.id === 'cpp' ? 'cpp' : lang.id}
                                  value={config?.templateCode || DEFAULT_TEMPLATES[lang.id]}
                                  theme="vs-dark"
                                  onChange={(value) => {
                                    setLanguageConfigs(prev =>
                                      prev.map(c =>
                                        c.language === lang.id
                                          ? { ...c, templateCode: value || '' }
                                          : c
                                      )
                                    );
                                  }}
                                  options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                 </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {isEditMode && onDelete ? (
                <Button kind="danger--tertiary" onClick={onDelete}>
                  刪除題目
                </Button>
              ) : (
                <div />
              )}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button kind="secondary" onClick={onCancel}>取消</Button>
                <Button
                  type="submit"
                  renderIcon={Save}
                  disabled={loading}
                >
                  {loading ? '儲存中...' : (isEditMode ? '更新題目' : '建立題目')}
                </Button>
              </div>
            </div>
          </Form>
        </div>
    </div>
    </div>
  );
};

export default ProblemForm;
