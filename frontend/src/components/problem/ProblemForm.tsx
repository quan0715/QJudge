import { useState, useEffect } from 'react';
import {
  Form,
  TextInput,
  TextArea,
  Button,
  Toggle,
  NumberInput,
  InlineNotification,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Grid,
  Column,
  Dropdown,
  FilterableMultiSelect,
  Tag as CarbonTag
} from '@carbon/react';
import { Save, View } from '@carbon/icons-react';
import ProblemPreview from '@/components/problem/ProblemPreview';
import Editor from '@monaco-editor/react';
import { DEFAULT_TEMPLATES, LANGUAGE_OPTIONS } from '@/constants/codeTemplates';
import { PageHeader } from '@/components/common/PageHeader';
import { tagService } from '@/services/tagService';
import type { Tag } from '@/models/problem';

export interface TestCase {
  input_data: string;
  output_data: string;
  is_sample: boolean;
  score: number;
  order: number;
  is_hidden: boolean;
}

export interface Translation {
  language: string;
  title: string;
  description: string;
  input_description: string;
  output_description: string;
  hint: string;
}

export interface LanguageConfig {
  language: string;
  template_code: string;
  is_enabled: boolean;
  order: number;
}

export interface ProblemFormData {
  title: string;
  slug: string;
  difficulty: string;
  time_limit: number;
  memory_limit: number;
  is_visible: boolean;
  order: number;
  translations: Translation[];
  test_cases: TestCase[];
  language_configs: LanguageConfig[];
  existing_tag_ids?: number[]; // IDs of existing tags
  new_tag_names?: string[]; // Names of new tags to create
}

interface ProblemFormProps {
  initialData?: Partial<ProblemFormData>;
  onSubmit: (data: ProblemFormData) => Promise<void>;
  onCancel: () => void;
  isEditMode: boolean;
  isContestMode?: boolean;
  loading?: boolean;
  error?: string;
  success?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

const ProblemForm = ({
  initialData,
  onSubmit,
  onCancel,
  isEditMode,
  // isContestMode = false,
  loading = false,
  error: externalError,
  success: externalSuccess,
  breadcrumbs
}: ProblemFormProps) => {
  const [showPreview, setShowPreview] = useState(false);
  const [currentLang, setCurrentLang] = useState<'zh-TW' | 'en'>('zh-TW');

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
  const [tagInputValue, setTagInputValue] = useState('');

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
  const [testCases, setTestCases] = useState<TestCase[]>([{
    input_data: '',
    output_data: '',
    is_sample: true,
    score: 10,
    order: 0,
    is_hidden: false
  }]);

  // Language Configs - Only C++ enabled by default
  const [languageConfigs, setLanguageConfigs] = useState<LanguageConfig[]>(
    LANGUAGE_OPTIONS.map((lang, index) => ({
      language: lang.id,
      template_code: DEFAULT_TEMPLATES[lang.id],
      is_enabled: lang.id === 'cpp', // Only C++ enabled
      order: index
    }))
  );

  // Load tags on mount
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await tagService.getTags();
        setAvailableTags(tags);
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    };
    loadTags();
  }, []);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDifficulty(initialData.difficulty || 'medium');
      setTimeLimit(initialData.time_limit || 1000);
      setMemoryLimit(initialData.memory_limit || 128);
      setIsVisible(initialData.is_visible ?? true);

      // Load translations
      const transZh = initialData.translations?.find((t: Translation) => t.language === 'zh-TW' || t.language === 'zh-hant');
      if (transZh) {
        setTranslationTitle(transZh.title);
        setDescription(transZh.description);
        setInputDescription(transZh.input_description);
        setOutputDescription(transZh.output_description);
        setHint(transZh.hint || '');
      }

      const transEn = initialData.translations?.find((t: Translation) => t.language === 'en');
      if (transEn) {
        setTranslationTitleEn(transEn.title);
        setDescriptionEn(transEn.description);
        setInputDescriptionEn(transEn.input_description);
        setOutputDescriptionEn(transEn.output_description);
        setHintEn(transEn.hint || '');
      }

      // Load test cases
      if (initialData.test_cases && initialData.test_cases.length > 0) {
        setTestCases(initialData.test_cases);
      }

      // Load language configs
      if (initialData.language_configs && initialData.language_configs.length > 0) {
        setLanguageConfigs(initialData.language_configs);
      }

      // Load tags (if present in initialData)
      // Assuming initialData comes from API which returns Tag objects in 'tags' field
      if ((initialData as any).tags) {
        const tags = (initialData as any).tags as Tag[];
        setSelectedExistingTagIds(tags.map(t => Number(t.id)));
      }
    }
  }, [initialData]);



  const addTestCase = () => {
    setTestCases([...testCases, {
      input_data: '',
      output_data: '',
      is_sample: false,
      score: 10,
      order: testCases.length,
      is_hidden: false
    }]);
  };

  const updateTestCase = (index: number, field: keyof TestCase, value: any) => {
    const updated = [...testCases];
    updated[index] = { ...updated[index], [field]: value };
    setTestCases(updated);
  };

  const removeTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const translations = [
      {
        language: 'zh-TW',
        title: translationTitle,
        description,
        input_description: inputDescription,
        output_description: outputDescription,
        hint
      }
    ];

    // Add English translation if provided
    if (translationTitleEn || descriptionEn) {
      translations.push({
        language: 'en',
        title: translationTitleEn || translationTitle,
        description: descriptionEn || description,
        input_description: inputDescriptionEn || inputDescription,
        output_description: outputDescriptionEn || outputDescription,
        hint: hintEn || hint
      });
    }

    const payload: ProblemFormData = {
      title: title || translationTitle,
      slug: '', // Will be auto-generated by backend
      difficulty,
      time_limit: timeLimit,
      memory_limit: memoryLimit,
      is_visible: isVisible,
      order: 0, // Default order
      translations,
      test_cases: testCases,
      language_configs: languageConfigs,
      existing_tag_ids: selectedExistingTagIds,
      new_tag_names: pendingNewTagNames
    };

    await onSubmit(payload);
  };

  const getCurrentTitle = () => currentLang === 'zh-TW' ? translationTitle : translationTitleEn;
  const getCurrentDescription = () => currentLang === 'zh-TW' ? description : descriptionEn;
  const getCurrentInputDesc = () => currentLang === 'zh-TW' ? inputDescription : inputDescriptionEn;
  const getCurrentOutputDesc = () => currentLang === 'zh-TW' ? outputDescription : outputDescriptionEn;
  const getCurrentHint = () => currentLang === 'zh-TW' ? hint : hintEn;

  const setCurrentTitle = (value: string) => currentLang === 'zh-TW' ? setTranslationTitle(value) : setTranslationTitleEn(value);
  const setCurrentDescription = (value: string) => currentLang === 'zh-TW' ? setDescription(value) : setDescriptionEn(value);
  const setCurrentInputDesc = (value: string) => currentLang === 'zh-TW' ? setInputDescription(value) : setInputDescriptionEn(value);
  const setCurrentOutputDesc = (value: string) => currentLang === 'zh-TW' ? setOutputDescription(value) : setOutputDescriptionEn(value);
  const setCurrentHint = (value: string) => currentLang === 'zh-TW' ? setHint(value) : setHintEn(value);

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      <PageHeader
        title={isEditMode ? '編輯題目' : '新增題目'}
        breadcrumbs={breadcrumbs}
        actions={
          <>
            <Button
              kind="tertiary"
              renderIcon={View}
              onClick={() => setShowPreview(!showPreview)}
              size="md"
            >
              {showPreview ? '隱藏預覽' : '顯示預覽'}
            </Button>
            <Button
              kind="secondary"
              onClick={onCancel}
              size="md"
            >
              取消
            </Button>
          </>
        }
      />

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
        <div style={{ flex: showPreview ? '1' : '1 1 100%' }}>
          <Form onSubmit={handleSubmit}>
            <Tabs>
              <TabList aria-label="Problem form tabs">
                <Tab>基本資訊</Tab>
                <Tab>題目內容</Tab>
                <Tab>測試案例</Tab>
                <Tab>語言設定</Tab>
              </TabList>
              <TabPanels>
                {/* Basic Info Tab */}
                <TabPanel>
                  <Grid style={{ marginTop: '1rem' }}>
                    <Column lg={16} md={8} sm={4}>
                      <TextInput
                        id="translation-title"
                        labelText="題目標題 *"
                        placeholder="輸入題目標題..."
                        value={translationTitle}
                        onChange={(e) => setTranslationTitle(e.target.value)}
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
                      <div style={{ marginBottom: '1rem' }}>
                        <label className="cds--label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                          標籤
                        </label>
                        <div style={{ marginBottom: '1rem' }}>
                          <FilterableMultiSelect
                            id="tag-selector"
                            titleText="選擇現有標籤"
                            placeholder="搜尋並選擇標籤..."
                            items={availableTags.map(tag => ({
                              id: tag.id,
                              label: tag.name
                            }))}
                            itemToString={(item) => item ? item.label : ''}
                            initialSelectedItems={availableTags
                              .filter(tag => selectedExistingTagIds.includes(Number(tag.id)))
                              .map(tag => ({ id: tag.id, label: tag.name }))}
                            onChange={({ selectedItems }) => {
                              setSelectedExistingTagIds(selectedItems.map(item => Number(item.id)));
                            }}
                            selectionFeedback="top-after-reopen"
                          />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                          <label className="cds--label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                            新增標籤 (New Tags)
                          </label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                            {pendingNewTagNames.map((name, index) => (
                              <CarbonTag
                                key={`new-${index}`}
                                type="green"
                                filter
                                onClose={() => setPendingNewTagNames(prev => prev.filter((_, i) => i !== index))}
                              >
                                {name} (新)
                              </CarbonTag>
                            ))}
                          </div>
                          <TextInput
                            id="new-tag-input"
                            labelText=""
                            hideLabel
                            placeholder="輸入新標籤名稱後按 Enter..."
                            value={tagInputValue}
                            onChange={(e) => setTagInputValue(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                              if (e.key === 'Enter') {
                                const value = tagInputValue.trim();
                                if (value) {
                                  // Check if it's an existing tag
                                  const existingTag = availableTags.find(t => t.name.toLowerCase() === value.toLowerCase());
                                  if (existingTag) {
                                    if (!selectedExistingTagIds.includes(Number(existingTag.id))) {
                                      setSelectedExistingTagIds(prev => [...prev, Number(existingTag.id)]);
                                    }
                                  } else {
                                    // It's a new tag
                                    if (!pendingNewTagNames.includes(value)) {
                                      setPendingNewTagNames(prev => [...prev, value]);
                                    }
                                  }
                                  setTagInputValue('');
                                }
                                e.preventDefault();
                              }
                            }}
                          />
                          <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                            提示：輸入標籤名稱後按 Enter 加入。綠色標籤為新增標籤，將在儲存時建立。
                          </div>
                        </div>
                      </div>
                    </Column>
                  </Grid>
                </TabPanel>

                {/* Content Tab with Language Selector */}
                <TabPanel>
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <Dropdown
                        id="language-selector"
                        titleText="語言 / Language"
                        label="選擇語言"
                        items={[
                          { id: 'zh-TW', label: '中文' },
                          { id: 'en', label: 'English' }
                        ]}
                        itemToString={(item) => item ? item.label : ''}
                        selectedItem={[
                          { id: 'zh-TW', label: '中文' },
                          { id: 'en', label: 'English' }
                        ].find(i => i.id === currentLang)}
                        onChange={({ selectedItem }) => setCurrentLang(selectedItem?.id as 'zh-TW' | 'en')}
                      />
                    </div>
                    
                    <TextInput
                      id="current-title"
                      labelText={currentLang === 'zh-TW' ? '標題 *' : 'Title *'}
                      placeholder={currentLang === 'zh-TW' ? '輸入標題...' : 'Enter title...'}
                      value={getCurrentTitle()}
                      onChange={(e) => setCurrentTitle(e.target.value)}
                      required={currentLang === 'zh-TW'}
                      style={{ marginBottom: '1rem' }}
                    />

                    <TextArea
                      id="current-description"
                      labelText={currentLang === 'zh-TW' ? '題目描述 * (支援 Markdown)' : 'Description * (Supports Markdown)'}
                      placeholder={currentLang === 'zh-TW' ? '輸入題目描述...' : 'Enter description...'}
                      value={getCurrentDescription()}
                      onChange={(e) => setCurrentDescription(e.target.value)}
                      rows={8}
                      required={currentLang === 'zh-TW'}
                      style={{ marginBottom: '1rem' }}
                    />
                    <TextArea
                      id="current-input-description"
                      labelText={currentLang === 'zh-TW' ? '輸入說明 *' : 'Input Description *'}
                      placeholder={currentLang === 'zh-TW' ? '描述輸入格式...' : 'Describe input format...'}
                      value={getCurrentInputDesc()}
                      onChange={(e) => setCurrentInputDesc(e.target.value)}
                      rows={4}
                      required={currentLang === 'zh-TW'}
                      style={{ marginBottom: '1rem' }}
                    />
                    <TextArea
                      id="current-output-description"
                      labelText={currentLang === 'zh-TW' ? '輸出說明 *' : 'Output Description *'}
                      placeholder={currentLang === 'zh-TW' ? '描述輸出格式...' : 'Describe output format...'}
                      value={getCurrentOutputDesc()}
                      onChange={(e) => setCurrentOutputDesc(e.target.value)}
                      rows={4}
                      required={currentLang === 'zh-TW'}
                      style={{ marginBottom: '1rem' }}
                    />
                    <TextArea
                      id="current-hint"
                      labelText={currentLang === 'zh-TW' ? '提示（選填）' : 'Hint (Optional)'}
                      placeholder={currentLang === 'zh-TW' ? '提供解題提示...' : 'Provide hints...'}
                      value={getCurrentHint()}
                      onChange={(e) => setCurrentHint(e.target.value)}
                      rows={3}
                      style={{ marginBottom: '1rem' }}
                    />
                  </div>
                </TabPanel>

                {/* Test Cases Tab */}
                <TabPanel>
                  <div style={{ marginTop: '1rem' }}>
                    {testCases.map((tc, index) => (
                      <div key={index} className="carbon-panel" style={{ padding: '1rem', marginBottom: '1rem', backgroundColor: 'var(--cds-layer-01)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <h4>測試案例 {index + 1}</h4>
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            onClick={() => removeTestCase(index)}
                            disabled={testCases.length === 1}
                          >
                            刪除
                          </Button>
                        </div>
                        <Grid>
                          <Column lg={8} md={8} sm={4}>
                            <TextArea
                              id={`input-${index}`}
                              labelText="輸入"
                              value={tc.input_data}
                              onChange={(e) => updateTestCase(index, 'input_data', e.target.value)}
                              rows={3}
                              style={{ marginBottom: '0.5rem' }}
                            />
                          </Column>
                          <Column lg={8} md={8} sm={4}>
                            <TextArea
                              id={`output-${index}`}
                              labelText="輸出"
                              value={tc.output_data}
                              onChange={(e) => updateTestCase(index, 'output_data', e.target.value)}
                              rows={3}
                              style={{ marginBottom: '0.5rem' }}
                            />
                          </Column>
                          <Column lg={4} md={4} sm={4}>
                            <NumberInput
                              id={`score-${index}`}
                              label="分數"
                              value={tc.score}
                              onChange={(e: any) => updateTestCase(index, 'score', e.imaginaryTarget?.value || tc.score)}
                              min={0}
                              style={{ marginBottom: '0.5rem' }}
                            />
                          </Column>
                          <Column lg={4} md={4} sm={4}>
                            <Toggle
                              id={`sample-${index}`}
                              labelText="範例"
                              labelA="否"
                              labelB="是"
                              toggled={tc.is_sample}
                              onToggle={(checked) => updateTestCase(index, 'is_sample', checked)}
                              style={{ marginBottom: '0.5rem' }}
                            />
                          </Column>
                          <Column lg={4} md={4} sm={4}>
                            <Toggle
                              id={`hidden-${index}`}
                              labelText="隱藏"
                              labelA="否"
                              labelB="是"
                              toggled={tc.is_hidden}
                              onToggle={(checked) => updateTestCase(index, 'is_hidden', checked)}
                              style={{ marginBottom: '0.5rem' }}
                            />
                          </Column>
                        </Grid>
                      </div>
                    ))}
                    <Button kind="secondary" onClick={addTestCase}>
                      新增測試案例
                    </Button>
                  </div>
                </TabPanel>

                {/* Language Config Tab */}
                <TabPanel>
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>允許的程式語言</h4>
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const config = languageConfigs.find(c => c.language === lang.id);
                      const isEnabled = config?.is_enabled ?? true;
                      
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
                                    ? { ...c, is_enabled: checked }
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
                                  value={config?.template_code || DEFAULT_TEMPLATES[lang.id]}
                                  theme="vs-dark"
                                  onChange={(value) => {
                                    setLanguageConfigs(prev =>
                                      prev.map(c =>
                                        c.language === lang.id
                                          ? { ...c, template_code: value || '' }
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
                </TabPanel>
              </TabPanels>
            </Tabs>



            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <Button
                type="submit"
                kind="primary"
                renderIcon={Save}
                disabled={loading}
              >
                {loading ? '儲存中...' : (isEditMode ? '更新題目' : '建立題目')}
              </Button>
            </div>
          </Form>
        </div>

        {/* Preview Section */}
        {showPreview && (
          <div style={{ flex: '1', borderLeft: '1px solid var(--cds-border-subtle)', paddingLeft: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>預覽</h2>
            <div className="carbon-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--cds-layer-01)', borderRadius: '4px' }}>
              <ProblemPreview
                title={translationTitle}
                difficulty={difficulty}
                timeLimit={timeLimit}
                memoryLimit={memoryLimit}
                translations={[
                  ...(translationTitle || description ? [{
                    language: 'zh-TW',
                    title: translationTitle,
                    description,
                    inputDescription: inputDescription,
                    outputDescription: outputDescription,
                    hint
                  }] : []),
                  ...(translationTitleEn || descriptionEn ? [{
                    language: 'en',
                    title: translationTitleEn,
                    description: descriptionEn,
                    inputDescription: inputDescriptionEn,
                    outputDescription: outputDescriptionEn,
                    hint: hintEn
                  }] : [])
                ]}
                testCases={testCases.map(tc => ({ 
                  ...tc, 
                  input: tc.input_data,
                  output: tc.output_data,
                  isSample: tc.is_sample || false 
                }))}
                defaultLang={currentLang === 'zh-TW' ? 'zh-TW' : 'en'}
                showLanguageToggle={!!(translationTitle && translationTitleEn)}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProblemForm;
