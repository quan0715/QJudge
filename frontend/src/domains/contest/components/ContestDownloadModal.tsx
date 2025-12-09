import { useState } from 'react';
import { 
  Modal, 
  RadioButton, 
  RadioButtonGroup, 
  Dropdown,
  Button,
  InlineLoading
} from '@carbon/react';
import { Download } from '@carbon/icons-react';
import { downloadContestFile } from '@/services/contest';
import { useToast } from '@/ui/components/common/Toast/useToast';

interface ContestDownloadModalProps {
  contestId: string;
  contestName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Sanitize a string to be safe for use as a filename.
 */
const sanitizeFilename = (filename: string): string => {
  // Remove or replace invalid characters
  const sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  // Remove leading/trailing dots and spaces
  const trimmed = sanitized.trim().replace(/^[\s.]+|[\s.]+$/g, '');
  // Limit length
  const limited = trimmed.length > 200 ? trimmed.substring(0, 200) : trimmed;
  // Ensure not empty
  return limited || 'contest';
};

export const ContestDownloadModal = ({ 
  contestId, 
  contestName,
  open, 
  onClose 
}: ContestDownloadModalProps) => {
  const [format, setFormat] = useState<'pdf' | 'markdown'>('markdown');
  const [language, setLanguage] = useState<string>('zh-TW');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const languageOptions = [
    { id: 'zh-TW', label: '中文 (繁體)' },
    { id: 'en', label: 'English' }
  ];

  const handleDownload = async () => {
    setLoading(true);
    try {
      const blob = await downloadContestFile(contestId, format, language);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const extension = format === 'pdf' ? 'pdf' : 'md';
      const safeName = sanitizeFilename(contestName);
      const filename = `contest_${contestId}_${safeName}.${extension}`;
      link.setAttribute('download', filename);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      showToast({
        kind: 'success',
        title: 'Download successful',
        subtitle: `Contest file downloaded as ${format.toUpperCase()}`
      });
      
      onClose();
    } catch (error) {
      console.error('Download failed:', error);
      showToast({
        kind: 'error',
        title: 'Download failed',
        subtitle: error instanceof Error ? error.message : 'An error occurred during download'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading="Download Contest File"
      primaryButtonText="Download"
      secondaryButtonText="Cancel"
      onRequestSubmit={handleDownload}
      primaryButtonDisabled={loading}
      size="sm"
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
          Download the complete contest file including all problems and their descriptions.
        </p>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--cds-text-primary)'
          }}>
            File Format
          </label>
          <RadioButtonGroup
            name="format"
            valueSelected={format}
            onChange={(value) => setFormat(value as 'pdf' | 'markdown')}
            orientation="vertical"
          >
            <RadioButton
              id="format-markdown"
              labelText="Markdown (.md)"
              value="markdown"
            />
            <RadioButton
              id="format-pdf"
              labelText="PDF (.pdf)"
              value="pdf"
            />
          </RadioButtonGroup>
        </div>

        <div>
          <Dropdown
            id="language-selector"
            titleText="Language"
            label="Select language"
            items={languageOptions}
            itemToString={(item) => (item ? item.label : '')}
            selectedItem={languageOptions.find(l => l.id === language)}
            onChange={({ selectedItem }) => {
              if (selectedItem) {
                setLanguage(selectedItem.id);
              }
            }}
          />
        </div>

        {loading && (
          <div style={{ marginTop: '1rem' }}>
            <InlineLoading description="Generating file..." />
          </div>
        )}
      </div>
    </Modal>
  );
};
