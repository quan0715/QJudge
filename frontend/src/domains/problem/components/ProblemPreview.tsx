import { useState } from 'react';
import { Dropdown } from '@carbon/react';
import MarkdownRenderer from '@/ui/components/common/MarkdownRenderer';
import type { TestCase, Translation, Tag as TagType } from '@/core/entities/problem.entity';

interface ProblemPreviewProps {
  title?: string;
  difficulty?: string;
  timeLimit?: number;
  memoryLimit?: number;
  translations?: Translation[];
  testCases?: TestCase[];
  tags?: TagType[];
  defaultLang?: 'zh-TW' | 'en';
  showLanguageToggle?: boolean;
  compact?: boolean;
  // Keyword restrictions
  forbiddenKeywords?: string[];
  requiredKeywords?: string[];
}

const ProblemPreview = ({
  title,
  difficulty: _difficulty = 'medium',
  timeLimit: _timeLimit = 1000,
  memoryLimit: _memoryLimit = 128,
  translations = [],
  testCases = [],
  tags: _tags = [],
  defaultLang = 'zh-TW',
  showLanguageToggle = true,
  compact = false,
  forbiddenKeywords = [],
  requiredKeywords = []
}: ProblemPreviewProps) => {
  const [currentLang, setCurrentLang] = useState<'zh-TW' | 'en'>(defaultLang);

  // Find translation with backward compatibility for zh-hant
  const translation = translations.find(t => t.language === currentLang) || 
                      (currentLang === 'zh-TW' ? translations.find(t => t.language === 'zh-hant') : null) ||
                      translations[0];

  const languageOptions = [
    { id: 'zh-TW', label: '中文' },
    { id: 'en', label: 'English' }
  ].filter(lang => {
    if (lang.id === 'zh-TW') {
      // Accept both zh-TW and zh-hant for Chinese
      return translations.some(t => t.language === 'zh-TW' || t.language === 'zh-hant');
    }
    return translations.some(t => t.language === lang.id);
  });

  const sampleCases = testCases.filter(tc => tc.isSample);

  return (
    <div className="problem-preview">
      {/* Header */}
      {!compact && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              {translation?.title || title || '未命名題目'}
            </h3>
            {showLanguageToggle && languageOptions.length > 1 && (
              <div style={{ width: '150px' }}>
                <Dropdown
                  id="language-selector"
                  label="選擇語言"
                  titleText=""
                  items={languageOptions}
                  itemToString={(item) => (item ? item.label : '')}
                  selectedItem={languageOptions.find(l => l.id === currentLang)}
                  onChange={({ selectedItem }) => selectedItem && setCurrentLang(selectedItem.id as 'zh-TW' | 'en')}
                  size="sm"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {translation && (
        <>
          {translation.description && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '題目描述' : 'Description'}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.description}
              </MarkdownRenderer>
            </div>
          )}

          {translation.inputDescription && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '輸入說明' : 'Input Description'}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.inputDescription}
              </MarkdownRenderer>
            </div>
          )}

          {translation.outputDescription && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '輸出說明' : 'Output Description'}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.outputDescription}
              </MarkdownRenderer>
            </div>
          )}

          {sampleCases.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '1rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '範例測試' : 'Sample Test Cases'}
              </h4>
              {sampleCases.map((tc, index) => (
                <div key={index} style={{ 
                  marginBottom: '1.25rem',
                  border: '1px solid var(--cds-border-subtle)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--cds-layer-01)'
                }}>
                  {/* Header */}
                  <div style={{ 
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--cds-layer-02)',
                    borderBottom: '1px solid var(--cds-border-subtle)',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'var(--cds-text-primary)'
                  }}>
                    {currentLang === 'zh-TW' ? `範例 ${index + 1}` : `Example ${index + 1}`}
                  </div>
                  
                  {/* Content */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {/* Input */}
                    <div style={{ 
                      padding: '1rem',
                      borderRight: '1px solid var(--cds-border-subtle)'
                    }}>
                      <div style={{ 
                        fontWeight: 600, 
                        marginBottom: '0.5rem',
                        fontSize: '0.8125rem',
                        color: 'var(--cds-text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {currentLang === 'zh-TW' ? '輸入' : 'Input'}
                      </div>
                      <pre style={{ 
                        background: 'var(--cds-field)',
                        padding: '0.75rem', 
                        borderRadius: '4px',
                        margin: 0,
                        overflowX: 'auto',
                        fontSize: '0.8125rem',
                        lineHeight: '1.5',
                        border: '1px solid var(--cds-border-subtle)',
                        fontFamily: "'IBM Plex Mono', monospace"
                      }}>
                        {tc.input || '(空)'}
                      </pre>
                    </div>
                    
                    {/* Output */}
                    <div style={{ 
                      padding: '1rem'
                    }}>
                      <div style={{ 
                        fontWeight: 600, 
                        marginBottom: '0.5rem',
                        fontSize: '0.8125rem',
                        color: 'var(--cds-text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {currentLang === 'zh-TW' ? '輸出' : 'Output'}
                      </div>
                      <pre style={{ 
                        background: 'var(--cds-field)',
                        padding: '0.75rem', 
                        borderRadius: '4px',
                        margin: 0,
                        overflowX: 'auto',
                        fontSize: '0.8125rem',
                        lineHeight: '1.5',
                        border: '1px solid var(--cds-border-subtle)',
                        fontFamily: "'IBM Plex Mono', monospace"
                      }}>
                        {tc.output || '(空)'}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {translation.hint && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '提示' : 'Hint'}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.hint}
              </MarkdownRenderer>
            </div>
          )}

          {/* Keyword Restrictions */}
          {(requiredKeywords.length > 0 || forbiddenKeywords.length > 0) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '程式碼限制' : 'Code Restrictions'}
              </h4>
              
              {requiredKeywords.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ 
                    fontWeight: 600, 
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--cds-text-secondary)'
                  }}>
                    {currentLang === 'zh-TW' ? '必須包含的關鍵字：' : 'Required Keywords:'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {requiredKeywords.map((kw, index) => (
                      <span
                        key={index}
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'var(--cds-tag-background-green, #a7f0ba)',
                          color: 'var(--cds-tag-color-green, #044317)',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          fontFamily: "'IBM Plex Mono', monospace"
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {forbiddenKeywords.length > 0 && (
                <div>
                  <div style={{ 
                    fontWeight: 600, 
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--cds-text-secondary)'
                  }}>
                    {currentLang === 'zh-TW' ? '禁止使用的關鍵字：' : 'Forbidden Keywords:'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {forbiddenKeywords.map((kw, index) => (
                      <span
                        key={index}
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'var(--cds-tag-background-red, #ffd7d9)',
                          color: 'var(--cds-tag-color-red, #750e13)',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          fontFamily: "'IBM Plex Mono', monospace"
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!translation && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
          暫無內容
        </div>
      )}
    </div>
  );
};

export default ProblemPreview;
