import { useState, useEffect } from 'react';
import {
  Form,
  TextInput,
  TextArea,
  Select,
  SelectItem,
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
  Column
} from '@carbon/react';
import { Save, View } from '@carbon/icons-react';
import ProblemPreview from './ProblemPreview';
import Editor from '@monaco-editor/react';
import { DEFAULT_TEMPLATES, LANGUAGE_OPTIONS } from '../constants/codeTemplates';

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
}

const ProblemForm = ({
  initialData,
  onSubmit,
  onCancel,
  isEditMode,
  // isContestMode = false,
  loading = false,
  error: externalError,
  success: externalSuccess
}: ProblemFormProps) => {
  const [showPreview, setShowPreview] = useState(false);
  const [currentLang, setCurrentLang] = useState<'zh-hant' | 'en'>('zh-hant');

  // Basic Info
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [timeLimit, setTimeLimit] = useState(1000);
  const [memoryLimit, setMemoryLimit] = useState(128);
  const [isVisible, setIsVisible] = useState(true);

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

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDifficulty(initialData.difficulty || 'medium');
      setTimeLimit(initialData.time_limit || 1000);
      setMemoryLimit(initialData.memory_limit || 128);
      setIsVisible(initialData.is_visible ?? true);

      // Load translations
      const transZh = initialData.translations?.find((t: Translation) => t.language === 'zh-hant');
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
        language: 'zh-hant',
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
      language_configs: languageConfigs
    };

    await onSubmit(payload);
  };

  const getCurrentTitle = () => currentLang === 'zh-hant' ? translationTitle : translationTitleEn;
  const getCurrentDescription = () => currentLang === 'zh-hant' ? description : descriptionEn;
  const getCurrentInputDesc = () => currentLang === 'zh-hant' ? inputDescription : inputDescriptionEn;
  const getCurrentOutputDesc = () => currentLang === 'zh-hant' ? outputDescription : outputDescriptionEn;
  const getCurrentHint = () => currentLang === 'zh-hant' ? hint : hintEn;

  const setCurrentTitle = (value: string) => currentLang === 'zh-hant' ? setTranslationTitle(value) : setTranslationTitleEn(value);
  const setCurrentDescription = (value: string) => currentLang === 'zh-hant' ? setDescription(value) : setDescriptionEn(value);
  const setCurrentInputDesc = (value: string) => currentLang === 'zh-hant' ? setInputDescription(value) : setInputDescriptionEn(value);
  const setCurrentOutputDesc = (value: string) => currentLang === 'zh-hant' ? setOutputDescription(value) : setOutputDescriptionEn(value);
  const setCurrentHint = (value: string) => currentLang === 'zh-hant' ? setHint(value) : setHintEn(value);

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          {isEditMode ? '編輯題目' : '新增題目'}
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button
            kind="tertiary"
            renderIcon={View}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? '隱藏預覽' : '顯示預覽'}
          </Button>
          <Button
            kind="secondary"
            onClick={onCancel}
          >
            取消
          </Button>
        </div>
      </div>

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
                      <Select
                        id="difficulty"
                        labelText="難度"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        style={{ marginBottom: '1rem' }}
                      >
                        <SelectItem value="easy" text="簡單" />
                        <SelectItem value="medium" text="中等" />
                        <SelectItem value="hard" text="困難" />
                      </Select>
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
                  </Grid>
                </TabPanel>

                {/* Content Tab with Language Selector */}
                <TabPanel>
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <Select
                        id="language-selector"
                        labelText="語言 / Language"
                        value={currentLang}
                        onChange={(e) => setCurrentLang(e.target.value as 'zh-hant' | 'en')}
                      >
                        <SelectItem value="zh-hant" text="中文" />
                        <SelectItem value="en" text="English" />
                      </Select>
                    </div>
                    
                    <TextInput
                      id="current-title"
                      labelText={currentLang === 'zh-hant' ? '標題 *' : 'Title *'}
                      placeholder={currentLang === 'zh-hant' ? '輸入標題...' : 'Enter title...'}
                      value={getCurrentTitle()}
                      onChange={(e) => setCurrentTitle(e.target.value)}
                      required={currentLang === 'zh-hant'}
                      style={{ marginBottom: '1rem' }}
                    />

                    <TextArea
                      id="current-description"
                      labelText={currentLang === 'zh-hant' ? '題目描述 * (支援 Markdown)' : 'Description * (Supports Markdown)'}
                      placeholder={currentLang === 'zh-hant' ? '輸入題目描述...' : 'Enter description...'}
                      value={getCurrentDescription()}
                      onChange={(e) => setCurrentDescription(e.target.value)}
                      rows={8}
                      required={currentLang === 'zh-hant'}
                      style={{ marginBottom: '1rem' }}
                    />
                    <TextArea
                      id="current-input-description"
                      labelText={currentLang === 'zh-hant' ? '輸入說明 *' : 'Input Description *'}
                      placeholder={currentLang === 'zh-hant' ? '描述輸入格式...' : 'Describe input format...'}
                      value={getCurrentInputDesc()}
                      onChange={(e) => setCurrentInputDesc(e.target.value)}
                      rows={4}
                      required={currentLang === 'zh-hant'}
                      style={{ marginBottom: '1rem' }}
                    />
                    <TextArea
                      id="current-output-description"
                      labelText={currentLang === 'zh-hant' ? '輸出說明 *' : 'Output Description *'}
                      placeholder={currentLang === 'zh-hant' ? '描述輸出格式...' : 'Describe output format...'}
                      value={getCurrentOutputDesc()}
                      onChange={(e) => setCurrentOutputDesc(e.target.value)}
                      rows={4}
                      required={currentLang === 'zh-hant'}
                      style={{ marginBottom: '1rem' }}
                    />
                    <TextArea
                      id="current-hint"
                      labelText={currentLang === 'zh-hant' ? '提示（選填）' : 'Hint (Optional)'}
                      placeholder={currentLang === 'zh-hant' ? '提供解題提示...' : 'Provide hints...'}
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
                    language: 'zh-hant',
                    title: translationTitle,
                    description,
                    input_description: inputDescription,
                    output_description: outputDescription,
                    hint
                  }] : []),
                  ...(translationTitleEn || descriptionEn ? [{
                    language: 'en',
                    title: translationTitleEn,
                    description: descriptionEn,
                    input_description: inputDescriptionEn,
                    output_description: outputDescriptionEn,
                    hint: hintEn
                  }] : [])
                ]}
                testCases={testCases}
                defaultLang={currentLang}
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
