import MarkdownRenderer from '@/ui/components/common/MarkdownRenderer';
import type { TestCase, Translation, Tag as TagType } from '@/core/entities/problem.entity';
import { useContentLanguage } from '@/contexts/ContentLanguageContext';
import { useTranslation } from 'react-i18next';

interface ProblemPreviewProps {
  title?: string;
  difficulty?: string;
  timeLimit?: number;
  memoryLimit?: number;
  translations?: Translation[];
  testCases?: TestCase[];
  tags?: TagType[];
  showLanguageToggle?: boolean;
  compact?: boolean;
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
  showLanguageToggle: _showLanguageToggle = true,
  compact = false,
  forbiddenKeywords = [],
  requiredKeywords = []
}: ProblemPreviewProps) => {
  const { contentLanguage } = useContentLanguage();
  const { t } = useTranslation(['problem', 'common']);
  const currentLang = contentLanguage;

  const translation = translations.find(trans => trans.language === currentLang) || 
                      (currentLang === 'zh-TW' ? translations.find(trans => trans.language === 'zh-hant') : null) ||
                      translations[0];

  const sampleCases = testCases.filter(tc => tc.isSample);

  return (
    <div className="problem-preview">
      {!compact && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              {translation?.title || title || t('common:message.noData')}
            </h3>
          </div>
        </div>
      )}

      {translation && (
        <>
          {translation.description && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {t('problem:section.description')}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.description}
              </MarkdownRenderer>
            </div>
          )}

          {translation.inputDescription && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {t('problem:section.inputDescription')}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.inputDescription}
              </MarkdownRenderer>
            </div>
          )}

          {translation.outputDescription && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                {t('problem:section.outputDescription')}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.outputDescription}
              </MarkdownRenderer>
            </div>
          )}

          {sampleCases.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '1rem', fontSize: '1rem' }}>
                {t('problem:section.sampleTestCases')}
              </h4>
              {sampleCases.map((tc, index) => (
                <div key={index} style={{ 
                  marginBottom: '1.25rem',
                  border: '1px solid var(--cds-border-subtle)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--cds-layer-01)'
                }}>
                  <div style={{ 
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--cds-layer-02)',
                    borderBottom: '1px solid var(--cds-border-subtle)',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'var(--cds-text-primary)'
                  }}>
                    {t('problem:sample.example', { index: index + 1 })}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    <div style={{ padding: '1rem', borderRight: '1px solid var(--cds-border-subtle)' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8125rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('problem:sample.input')}
                      </div>
                      <pre style={{ background: 'var(--cds-field)', padding: '0.75rem', borderRadius: '4px', margin: 0, overflowX: 'auto', fontSize: '0.8125rem', lineHeight: '1.5', border: '1px solid var(--cds-border-subtle)', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {tc.input || t('problem:sample.empty')}
                      </pre>
                    </div>
                    
                    <div style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8125rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('problem:sample.output')}
                      </div>
                      <pre style={{ background: 'var(--cds-field)', padding: '0.75rem', borderRadius: '4px', margin: 0, overflowX: 'auto', fontSize: '0.8125rem', lineHeight: '1.5', border: '1px solid var(--cds-border-subtle)', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {tc.output || t('problem:sample.empty')}
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
                {t('problem:section.hint')}
              </h4>
              <MarkdownRenderer enableMath enableHighlight style={{ fontSize: '0.875rem' }}>
                {translation.hint}
              </MarkdownRenderer>
            </div>
          )}

          {(requiredKeywords.length > 0 || forbiddenKeywords.length > 0) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '1rem' }}>
                {t('problem:section.codeRestrictions')}
              </h4>
              
              {requiredKeywords.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    {t('problem:section.requiredKeywords')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {requiredKeywords.map((kw, index) => (
                      <span key={index} style={{ display: 'inline-block', padding: '0.25rem 0.5rem', backgroundColor: 'var(--cds-tag-background-green, #a7f0ba)', color: 'var(--cds-tag-color-green, #044317)', borderRadius: '4px', fontSize: '0.875rem', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {forbiddenKeywords.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    {t('problem:section.forbiddenKeywords')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {forbiddenKeywords.map((kw, index) => (
                      <span key={index} style={{ display: 'inline-block', padding: '0.25rem 0.5rem', backgroundColor: 'var(--cds-tag-background-red, #ffd7d9)', color: 'var(--cds-tag-color-red, #750e13)', borderRadius: '4px', fontSize: '0.875rem', fontFamily: "'IBM Plex Mono', monospace" }}>
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
          {t('common:message.noData')}
        </div>
      )}
    </div>
  );
};

export default ProblemPreview;
