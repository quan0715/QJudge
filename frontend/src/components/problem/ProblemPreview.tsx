import { useState } from 'react';
import { Dropdown, Tag } from '@carbon/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import '@/styles/markdown.css';
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
}

const ProblemPreview = ({
  title,
  difficulty = 'medium',
  timeLimit = 1000,
  memoryLimit = 128,
  translations = [],
  testCases = [],
  tags = [],
  defaultLang = 'zh-TW',
  showLanguageToggle = true,
  compact = false
}: ProblemPreviewProps) => {
  const [currentLang, setCurrentLang] = useState<'zh-TW' | 'en'>(defaultLang);

  // Find translation with backward compatibility for zh-hant
  const translation = translations.find(t => t.language === currentLang) || 
                      (currentLang === 'zh-TW' ? translations.find(t => t.language === 'zh-hant') : null) ||
                      translations[0];

  const getDifficultyLabel = (diff: string) => {
    const labels: Record<string, string> = {
      'easy': '簡單',
      'medium': '中等',
      'hard': '困難'
    };
    return labels[diff] || diff;
  };

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
          <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            難度: <strong>{getDifficultyLabel(difficulty)}</strong> | 
            時間限制: <strong>{timeLimit}ms</strong> | 
            記憶體限制: <strong>{memoryLimit}MB</strong>
          </div>
          {tags && tags.length > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {tags.map(tag => (
                <Tag 
                  key={tag.id} 
                  type="outline"
                  size="sm"
                  style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color, borderColor: tag.color } : undefined}
                >
                  {tag.name}
                </Tag>
              ))}
            </div>
          )}
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
              <div className="markdown-body" style={{ fontSize: '0.875rem' }}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}
                >
                  {translation.description}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {translation.inputDescription && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '輸入說明' : 'Input Description'}
              </h4>
              <div className="markdown-body" style={{ fontSize: '0.875rem' }}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}
                >
                  {translation.inputDescription}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {translation.outputDescription && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {currentLang === 'zh-TW' ? '輸出說明' : 'Output Description'}
              </h4>
              <div className="markdown-body" style={{ fontSize: '0.875rem' }}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}
                >
                  {translation.outputDescription}
                </ReactMarkdown>
              </div>
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
              <div className="markdown-body" style={{ fontSize: '0.875rem' }}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeKatex]}
                >
                  {translation.hint}
                </ReactMarkdown>
              </div>
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
