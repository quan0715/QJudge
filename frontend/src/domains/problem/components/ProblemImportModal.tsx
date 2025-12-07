import { useState } from 'react';
import {
  Modal,
  FileUploader,
  InlineNotification,
  AccordionItem,
  Accordion,
  Tag,
  TextArea
} from '@carbon/react';
import { parseProblemYAML, convertYAMLToProblemData, type ProblemYAML, type ValidationError } from '@/utils/problemYamlParser';
import { useNavigate } from 'react-router-dom';

interface ProblemImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (problemData: any) => Promise<any>; // Returns problem ID or object
}

const ProblemImportModal: React.FC<ProblemImportModalProps> = ({ open, onClose, onImport }) => {
  const navigate = useNavigate();
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ProblemYAML | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleFileChange = (event: any) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    setParsedData(null);
    setErrors([]);
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setParsing(true);

      try {
        const result = parseProblemYAML(content);
        
        if (result.success && result.data) {
          setParsedData(result.data);
          setErrors([]);
        } else {
          setErrors(result.errors || []);
          setParsedData(null);
        }
      } catch (err: any) {
        setErrors([{ field: 'parse', message: err.message }]);
      } finally {
        setParsing(false);
      }
    };

    reader.readAsText(uploadedFile);
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setImporting(true);
    try {
      const problemData = convertYAMLToProblemData(parsedData);
      const result: any = await onImport(problemData); // Changed to capture result
      const problemId = typeof result === 'object' ? result.id : result;
      const contestId = typeof result === 'object' ? result.contest_id : undefined;
      
      setImportSuccess(true);
      setTimeout(() => {
        onClose();
        resetState();
        // Navigate to problem preview
        if (contestId) {
          navigate(`/contests/${contestId}/problems/${problemId}`);
        } else {
          navigate(`/problems/${problemId}`);
        }
      }, 800); // Changed delay to 800ms
    } catch (error: any) {
      setErrors([{ field: 'import', message: error.message || '匯入失敗' }]); // Translated error message
    } finally {
      setImporting(false);
    }
  };

  const resetState = () => {
    setParsedData(null);
    setErrors([]);
    setImporting(false);
    setImportSuccess(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <Modal
      open={open}
      modalHeading="從 YAML 匯入題目"
      primaryButtonText={parsedData ? "匯入題目" : "關閉"}
      secondaryButtonText={parsedData ? "取消" : undefined}
      onRequestClose={handleClose}
      onRequestSubmit={parsedData ? handleImport : handleClose}
      primaryButtonDisabled={!parsedData || importing || importSuccess}
      size="lg"
    >
      <div style={{ marginBottom: '1rem' }}>
        <p style={{ marginBottom: '1rem' }}>
          上傳包含題目定義、測試案例和元數據的 YAML 文件。
          <a 
            href="/docs/problem-import-format.md" 
            target="_blank" 
            style={{ marginLeft: '0.5rem', color: 'var(--cds-link-primary)' }}
          >
            查看格式規範 →
          </a>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FileUploader
            labelTitle="上傳 YAML 文件"
            labelDescription="最大文件大小為 5MB。僅支援 .yaml 或 .yml 文件。"
            buttonLabel="選擇文件"
            filenameStatus="edit"
            accept={['.yaml', '.yml']}
            onChange={handleFileChange}
            disabled={importing}
          />

          <div style={{ textAlign: 'center', margin: '0.5rem 0', color: 'var(--cds-text-secondary)' }}>
            — 或 —
          </div>

          <TextArea
            labelText="直接貼上 YAML 內容"
            placeholder="在此貼上您的 YAML 內容..."
            rows={10}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              const content = e.target.value;
              if (!content.trim()) {
                setParsedData(null);
                setErrors([]);
                return;
              }
              
              setParsing(true);
              setErrors([]);
              
              // Debounce parsing
              const timer = setTimeout(() => {
                const result = parseProblemYAML(content);
                setParsing(false);
                
                if (result.success && result.data) {
                  setParsedData(result.data);
                  setErrors([]);
                } else if (result.errors) {
                  setParsedData(null);
                  setErrors(result.errors);
                }
              }, 500);
              
              return () => clearTimeout(timer);
            }}
            disabled={importing}
          />
        </div>
      </div>

      {parsing && (
        <InlineNotification
          kind="info"
          title="解析中..."
          subtitle="請稍候，正在驗證您的文件"
          lowContrast
        />
      )}

      {errors.length > 0 && (
        <InlineNotification
          kind="error"
          title="驗證錯誤"
          subtitle={`在 YAML 文件中發現 ${errors.length} 個錯誤`}
          lowContrast
          style={{ marginTop: '1rem' }}
        >
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
            {errors.map((error, index) => (
              <li key={index}>
                <strong>{error.field}:</strong> {error.message}
              </li>
            ))}
          </ul>
        </InlineNotification>
      )}

      {importSuccess && (
        <InlineNotification
          kind="success"
          title="匯入成功"
          subtitle="題目已成功創建，正在跳轉到題目預覽..."
          lowContrast
          style={{ marginTop: '1rem' }}
        />
      )}

      {parsedData && !importing && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ marginBottom: '1rem' }}>預覽</h4>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong>標題:</strong> {parsedData.title}
            <br />
            <strong>難度:</strong> <Tag type={
              parsedData.difficulty === 'easy' ? 'green' : 
              parsedData.difficulty === 'medium' ? 'cyan' : 'red'
            }>{parsedData.difficulty === 'easy' ? '簡單' : parsedData.difficulty === 'medium' ? '中等' : '困難'}</Tag>
            <br />
            <strong>時間限制:</strong> {parsedData.time_limit}ms
            <br />
            <strong>記憶體限制:</strong> {parsedData.memory_limit}MB
            <br />
            <strong>測試案例:</strong> {parsedData.test_cases?.length || 0} 個
            {parsedData.test_cases && parsedData.test_cases.length > 0 && (
              <>
                {' '}({parsedData.test_cases.filter(tc => tc.is_sample).length} 範例)
              </>
            )}
            <br />
            <strong>翻譯:</strong> {parsedData.translations.length} 個語言
            {parsedData.language_configs && parsedData.language_configs.length > 0 && (
              <>
                <br />
                <strong>程式語言模板:</strong> {parsedData.language_configs.map(lc => lc.language).join(', ')}
              </>
            )}
          </div>

          <Accordion>
            <AccordionItem title={`翻譯 (${parsedData.translations.length})`}>
              {parsedData.translations.map((trans, index) => (
                <div key={index} style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'var(--cds-layer-01)' }}>
                  <strong>{trans.language}</strong>: {trans.title}
                  <br />
                  <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                    {trans.description.substring(0, 100)}...
                  </span>
                </div>
              ))}
            </AccordionItem>
            
            {parsedData.test_cases && parsedData.test_cases.length > 0 && (
              <AccordionItem title={`測試案例 (${parsedData.test_cases.length})`}>
                {parsedData.test_cases.slice(0, 5).map((tc, index) => (
                  <div key={index} style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--cds-layer-01)' }}>
                    <strong>案例 {index + 1}</strong> 
                    {tc.is_sample && <Tag size="sm" type="blue" style={{ marginLeft: '0.5rem' }}>範例</Tag>}
                    <br />
                    <span style={{ fontSize: '0.875rem' }}>
                      分數: {tc.score} | 順序: {tc.order}
                    </span>
                  </div>
                ))}
                {parsedData.test_cases.length > 5 && (
                  <p style={{ fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>
                    ... 還有 {parsedData.test_cases.length - 5} 個
                  </p>
                )}
              </AccordionItem>
            )}

            {parsedData.language_configs && parsedData.language_configs.length > 0 && (
              <AccordionItem title={`程式語言模板 (${parsedData.language_configs.length})`}>
                {parsedData.language_configs.map((lc, index) => (
                  <div key={index} style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--cds-layer-01)' }}>
                    <strong>{lc.language}</strong>
                    {lc.is_enabled && <Tag size="sm" type="green" style={{ marginLeft: '0.5rem' }}>啟用</Tag>}
                  </div>
                ))}
              </AccordionItem>
            )}
          </Accordion>
        </div>
      )}
    </Modal>
  );
};

export default ProblemImportModal;
