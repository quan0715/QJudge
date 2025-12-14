
import { useState, useEffect } from 'react';
import { 
  Form, TextInput, TextArea, NumberInput, Dropdown, 
  Button, InlineNotification, Toggle, Grid, Column,
  ContentSwitcher, Switch,
  FormLabel, Accordion, AccordionItem
} from '@carbon/react';
import { Save, Upload } from '@carbon/icons-react';
import { useTranslation } from 'react-i18n';
import { TestCaseList } from './common/TestCaseList';
import { TagSelect } from './common/TagSelect';
import Editor from '@monaco-editor/react';
import { DEFAULT_TEMPLATES, LANGUAGE_OPTIONS } from '@/domains/problem/constants/codeTemplates';
import { getTags } from '@/services/problem';
import type { Tag, TestCase, Translation, LanguageConfig } from '@/core/entities/problem.entity';
import ProblemPreview from './ProblemPreview';
import ProblemImportModal from './ProblemImportModal';
import type { ProblemYAML } from '@/utils/problemYamlParser';

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
  // Keyword restrictions
  forbiddenKeywords?: string[];
  requiredKeywords?: string[];
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
  const { t } = useTranslation('problem');
  
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

  // Keyword Restrictions
  const [forbiddenKeywords, setForbiddenKeywords] = useState<string[]>([]);
  const [requiredKeywords, setRequiredKeywords] = useState<string[]>([]);
  const [newForbiddenKeyword, setNewForbiddenKeyword] = useState('');
  const [newRequiredKeyword, setNewRequiredKeyword] = useState('');

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

      // Load keyword restrictions
      if ((initialData as any).forbiddenKeywords) {
        setForbiddenKeywords((initialData as any).forbiddenKeywords);
      }
      if ((initialData as any).requiredKeywords) {
        setRequiredKeywords((initialData as any).requiredKeywords);
      }
    }
  }, [initialData]);

  // Test Case Handlers
  const handleAddTestCase = (input: string, output: string, isHidden?: boolean, score?: number) => {
    const newTestCase: TestCase = {
      input,
      output,
      isSample: !isHidden, // isSample = !isHidden (public tests are samples)
      score: score ?? 10,
      order: testCases.length,
      isHidden: isHidden ?? false
    };
    setTestCases(prev => [...prev, newTestCase]);
  };

  const handleDeleteTestCase = (id: string) => {
    const idx = parseInt(id);
    setTestCases(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateTestCase = (id: string, input: string, output: string, score?: number) => {
    const idx = parseInt(id);
    setTestCases(prev => prev.map((tc, i) => 
      i === idx ? { ...tc, input, output, score: score ?? tc.score ?? 0 } : tc
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
      testCases: testCases.map(tc => ({
        ...tc,
        input_data: tc.input,
        output_data: tc.output,
        is_sample: tc.isSample,
        is_hidden: tc.isHidden,
        score: tc.score
      }) as any),
      languageConfigs,
      existingTagIds: selectedExistingTagIds,
      newTagNames: pendingNewTagNames,
      forbiddenKeywords,
      requiredKeywords
    };

    await onSubmit(payload);
  };

  // Content Switcher State
  const [activeSection, setActiveSection] = useState('basic');

  // YAML Import State
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Handle YAML Import from ProblemImportModal
  const handleYamlPopulate = (yaml: ProblemYAML) => {
    // Populate form fields
    setTitle(yaml.title);
    setDifficulty(yaml.difficulty);
    setTimeLimit(yaml.time_limit);
    setMemoryLimit(yaml.memory_limit);
    if (yaml.is_visible !== undefined) setIsVisible(yaml.is_visible);

    // Populate translations
    const zhTrans = yaml.translations.find(t => t.language === 'zh-TW' || t.language === 'zh-hant');
    if (zhTrans) {
      setTranslationTitle(zhTrans.title);
      setDescription(zhTrans.description);
      setInputDescription(zhTrans.input_description);
      setOutputDescription(zhTrans.output_description);
      setHint(zhTrans.hint || '');
    }

    const enTrans = yaml.translations.find(t => t.language === 'en');
    if (enTrans) {
      setTranslationTitleEn(enTrans.title);
      setDescriptionEn(enTrans.description);
      setInputDescriptionEn(enTrans.input_description);
      setOutputDescriptionEn(enTrans.output_description);
      setHintEn(enTrans.hint || '');
    }

    // Populate test cases
    if (yaml.test_cases && yaml.test_cases.length > 0) {
      setTestCases(yaml.test_cases.map((tc, index) => ({
        input: tc.input_data,
        output: tc.output_data,
        isSample: tc.is_sample,
        isHidden: tc.is_hidden ?? false,
        score: tc.score ?? 0,
        order: tc.order ?? index
      })));
    }

    // Populate language configs
    if (yaml.language_configs && yaml.language_configs.length > 0) {
      setLanguageConfigs(prev => {
        const newConfigs = [...prev];
        yaml.language_configs!.forEach(lc => {
          const idx = newConfigs.findIndex(c => c.language === lc.language);
          if (idx !== -1) {
            newConfigs[idx] = {
              ...newConfigs[idx],
              templateCode: lc.template_code,
              isEnabled: lc.is_enabled ?? true
            };
          }
        });
        return newConfigs;
      });
    }

    // Populate keyword restrictions (always set, even if empty, to allow clearing)
    setForbiddenKeywords(yaml.forbidden_keywords || []);
    setRequiredKeywords(yaml.required_keywords || []);
  };

  return (
    <div style={{ width: '100%' }}>
      {externalError && (
        <InlineNotification
          kind="error"
          title={t('form.notification.error')}
          subtitle={externalError}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {externalSuccess && (
        <InlineNotification
          kind="success"
          title={t('form.notification.success')}
          subtitle={externalSuccess}
          style={{ marginBottom: '1rem' }}
        />
      )}

      <div style={{ display: 'flex', gap: '2rem' }}>
        {/* Form Section */}
        <div style={{ flex: '1 1 100%' }}>
          <Form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <ContentSwitcher 
                      size="lg"
                      selectedIndex={['basic', 'content', 'testcases', 'languages', 'restrictions', 'preview'].indexOf(activeSection)}
                      onChange={({ name }) => setActiveSection(name as string)}
                  >
                      <Switch name="basic" text={t('form.sections.basic')} />
                      <Switch name="content" text={t('form.sections.content')} />
                      <Switch name="testcases" text={t('form.sections.testcases')} />
                      <Switch name="languages" text={t('form.sections.languages')} />
                      <Switch name="restrictions" text={t('form.sections.restrictions')} />
                      <Switch name="preview" text={t('form.sections.preview')} />
                  </ContentSwitcher>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Upload}
                    onClick={() => setImportModalOpen(true)}
                  >
                    {t('form.actions.importYAML')}
                  </Button>
                </div>
            </div>

            {/* Basic Info Section */}
            <div style={{ display: activeSection === 'basic' ? 'block' : 'none' }}>
                  <Grid style={{ marginTop: '1rem' }}>
                    <Column lg={16} md={8} sm={4}>
                      <TextInput
                        id="problem-title"
                        labelText={t('form.basic.titleLabel')}
                        placeholder={t('form.basic.titlePlaceholder')}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>
                    <Column lg={4} md={4} sm={4}>
                      <Dropdown
                        id="difficulty"
                        titleText={t('form.basic.difficultyLabel')}
                        label={t('form.basic.difficultySelect')}
                        items={[
                          { id: 'easy', label: t('form.basic.difficultyEasy') },
                          { id: 'medium', label: t('form.basic.difficultyMedium') },
                          { id: 'hard', label: t('form.basic.difficultyHard') }
                        ]}
                        itemToString={(item) => item ? item.label : ''}
                        selectedItem={[
                          { id: 'easy', label: t('form.basic.difficultyEasy') },
                          { id: 'medium', label: t('form.basic.difficultyMedium') },
                          { id: 'hard', label: t('form.basic.difficultyHard') }
                        ].find(i => i.id === difficulty)}
                        onChange={({ selectedItem }) => setDifficulty(selectedItem?.id || 'medium')}
                        style={{ marginBottom: '1rem' }}
                      />
                    </Column>
                    <Column lg={4} md={4} sm={4}>
                      <NumberInput
                        id="time-limit"
                        label={t('form.basic.timeLimitLabel')}
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
                        label={t('form.basic.memoryLimitLabel')}
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
                        labelText={t('form.basic.visibilityLabel')}
                        labelA={t('form.basic.visibilityHidden')}
                        labelB={t('form.basic.visibilityVisible')}
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
                        titleText={t('form.basic.tagsLabel')}
                        placeholder={t('form.basic.tagsPlaceholder')}
                      />
                    </Column>
                  </Grid>
            </div>

            {/* Content Section - Using Accordion for Language Versions */}
            <div style={{ display: activeSection === 'content' ? 'block' : 'none' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <FormLabel style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>
                        {t('form.content.languageVersions')}
                    </FormLabel>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
                        {t('form.content.languageVersionsHelp')}
                    </p>
                    
                    <Accordion>
                        {/* Chinese Version */}
                        <AccordionItem title={t('form.content.chineseTraditional')} open>
                            <Grid>
                                <Column lg={16}>
                                    <TextInput
                                        id="title-zh"
                                        labelText={t('form.content.titleLabel')}
                                        placeholder={t('form.content.titlePlaceholder')}
                                        value={translationTitle}
                                        onChange={(e) => setTranslationTitle(e.target.value)}
                                        required
                                        style={{ marginBottom: '1rem' }}
                                    />
                                    <TextArea
                                        id="description-zh"
                                        labelText={t('form.content.descriptionLabel')}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={8}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={8}>
                                    <TextArea
                                        id="input-desc-zh"
                                        labelText={t('form.content.inputDescriptionLabel')}
                                        value={inputDescription}
                                        onChange={(e) => setInputDescription(e.target.value)}
                                        rows={4}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={8}>
                                    <TextArea
                                        id="output-desc-zh"
                                        labelText={t('form.content.outputDescriptionLabel')}
                                        value={outputDescription}
                                        onChange={(e) => setOutputDescription(e.target.value)}
                                        rows={4}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                                <Column lg={16}>
                                    <TextArea
                                        id="hint-zh"
                                        labelText={t('form.content.hintLabel')}
                                        value={hint}
                                        onChange={(e) => setHint(e.target.value)}
                                        rows={2}
                                        style={{ marginBottom: '1rem' }}
                                    />
                                </Column>
                            </Grid>
                        </AccordionItem>

                        {/* English Version */}
                        <AccordionItem title={t('form.content.english')}>
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
                        {t('form.testcases.description')}
                    </p>
                </div>
                <TestCaseList
                    mode="problem"
                    items={testCases.map((tc, index) => ({
                        id: String(index),
                        input: tc.input,
                        output: tc.output,
                        isSample: tc.isSample,
                        isHidden: tc.isHidden ?? false,
                        score: tc.score
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
                    <h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>{t('form.languages.title')}</h4>
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const config = languageConfigs.find(c => c.language === lang.id);
                      const isEnabled = config?.isEnabled ?? true;
                      
                      return (
                        <div key={lang.id} style={{ marginBottom: '2rem' }}>
                          <Toggle
                            id={`lang-${lang.id}`}
                            labelText={lang.label}
                            labelA={t('form.languages.disabled')}
                            labelB={t('form.languages.enabled')}
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
                                {t('form.languages.templateCode')}
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

            {/* Restrictions Section */}
            <div style={{ display: activeSection === 'restrictions' ? 'block' : 'none' }}>
                <div style={{ padding: '1rem' }}>
                    <h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>{t('form.restrictions.title')}</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>
                        {t('form.restrictions.description')}
                    </p>

                    {/* Required Keywords */}
                    <div style={{ marginBottom: '2rem' }}>
                        <FormLabel style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            {t('form.restrictions.requiredTitle')}
                        </FormLabel>
                        <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{__html: t('form.restrictions.requiredDescription')}}>
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <TextInput
                                id="new-required-keyword"
                                labelText=""
                                hideLabel
                                placeholder={t('form.restrictions.requiredPlaceholder')}
                                value={newRequiredKeyword}
                                onChange={(e) => setNewRequiredKeyword(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newRequiredKeyword.trim()) {
                                        e.preventDefault();
                                        setRequiredKeywords(prev => [...prev, newRequiredKeyword.trim()]);
                                        setNewRequiredKeyword('');
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                            <Button
                                kind="secondary"
                                size="md"
                                disabled={!newRequiredKeyword.trim()}
                                onClick={() => {
                                    if (newRequiredKeyword.trim()) {
                                        setRequiredKeywords(prev => [...prev, newRequiredKeyword.trim()]);
                                        setNewRequiredKeyword('');
                                    }
                                }}
                            >
                                {t('form.actions.add')}
                            </Button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {requiredKeywords.map((kw, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.25rem 0.5rem',
                                        backgroundColor: 'var(--cds-tag-background-green)',
                                        color: 'var(--cds-tag-color-green)',
                                        borderRadius: '4px',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    <code style={{ fontFamily: 'monospace' }}>{kw}</code>
                                    <button
                                        type="button"
                                        onClick={() => setRequiredKeywords(prev => prev.filter((_, i) => i !== index))}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.25rem',
                                            color: 'inherit',
                                            fontSize: '1rem'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Forbidden Keywords */}
                    <div>
                        <FormLabel style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>
                            {t('form.restrictions.forbiddenTitle')}
                        </FormLabel>
                        <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{__html: t('form.restrictions.forbiddenDescription')}}>
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <TextInput
                                id="new-forbidden-keyword"
                                labelText=""
                                hideLabel
                                placeholder={t('form.restrictions.forbiddenPlaceholder')}
                                value={newForbiddenKeyword}
                                onChange={(e) => setNewForbiddenKeyword(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newForbiddenKeyword.trim()) {
                                        e.preventDefault();
                                        setForbiddenKeywords(prev => [...prev, newForbiddenKeyword.trim()]);
                                        setNewForbiddenKeyword('');
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                            <Button
                                kind="secondary"
                                size="md"
                                disabled={!newForbiddenKeyword.trim()}
                                onClick={() => {
                                    if (newForbiddenKeyword.trim()) {
                                        setForbiddenKeywords(prev => [...prev, newForbiddenKeyword.trim()]);
                                        setNewForbiddenKeyword('');
                                    }
                                }}
                            >
                                {t('form.actions.add')}
                            </Button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {forbiddenKeywords.map((kw, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.25rem 0.5rem',
                                        backgroundColor: 'var(--cds-tag-background-red)',
                                        color: 'var(--cds-tag-color-red)',
                                        borderRadius: '4px',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    <code style={{ fontFamily: 'monospace' }}>{kw}</code>
                                    <button
                                        type="button"
                                        onClick={() => setForbiddenKeywords(prev => prev.filter((_, i) => i !== index))}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.25rem',
                                            color: 'inherit',
                                            fontSize: '1rem'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview Section */}
            <div style={{ display: activeSection === 'preview' ? 'block' : 'none' }}>
              <div style={{ 
                padding: '1.5rem',
                backgroundColor: 'var(--cds-layer-01)',
                borderRadius: '8px',
                border: '1px solid var(--cds-border-subtle)'
              }}>
                <ProblemPreview
                  title={title}
                  difficulty={difficulty}
                  timeLimit={timeLimit}
                  memoryLimit={memoryLimit}
                  translations={[
                    ...(translationTitle || description ? [{
                      language: 'zh-TW' as const,
                      title: translationTitle,
                      description,
                      inputDescription,
                      outputDescription,
                      hint
                    }] : []),
                    ...(translationTitleEn || descriptionEn ? [{
                      language: 'en' as const,
                      title: translationTitleEn,
                      description: descriptionEn,
                      inputDescription: inputDescriptionEn,
                      outputDescription: outputDescriptionEn,
                      hint: hintEn
                    }] : [])
                  ]}
                  testCases={testCases}
                  forbiddenKeywords={forbiddenKeywords}
                  requiredKeywords={requiredKeywords}
                  showLanguageToggle={true}
                  compact={false}
                />
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {isEditMode && onDelete ? (
                <Button kind="danger--tertiary" onClick={onDelete}>
                  {t('form.actions.delete')}
                </Button>
              ) : (
                <div />
              )}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button kind="secondary" onClick={onCancel}>{t('form.actions.cancel')}</Button>
                <Button
                  type="submit"
                  renderIcon={Save}
                  disabled={loading}
                >
                  {loading ? t('form.actions.saving') : (isEditMode ? t('form.actions.update') : t('form.actions.create'))}
                </Button>
              </div>
            </div>
          </Form>
        </div>
    </div>

    {/* YAML Import Modal */}
    <ProblemImportModal
      open={importModalOpen}
      onClose={() => setImportModalOpen(false)}
      mode="populateForm"
      onPopulate={handleYamlPopulate}
    />
    </div>
  );
};

export default ProblemForm;
