
import React, { useState } from 'react';
import { 
    Tile, Button, TextArea, FormLabel,
    Accordion, AccordionItem, Tag, IconButton
} from '@carbon/react';
import { Add, TrashCan, Play } from '@carbon/icons-react';

export interface TestCase {
    id: string; // 'public_1' or 'custom_timestamp'
    input: string;
    output?: string; // Optional for public cases if hidden? Or usually required for custom
    isSample?: boolean;
    source: 'public' | 'custom';
    enabled: boolean;
}

interface TestCasePanelProps {
    testCases: TestCase[];
    onAddTestCase: (input: string, output: string) => void;
    onDeleteTestCase: (id: string) => void;
    onToggleTestCase: (id: string, enabled: boolean) => void;
    onRunTest: () => void;
    running?: boolean;
}

const TestCasePanel: React.FC<TestCasePanelProps> = ({
    testCases,
    onAddTestCase,
    onDeleteTestCase,
    onToggleTestCase,
    onRunTest,
    running
}) => {
    const [newInput, setNewInput] = useState('');
    const [newOutput, setNewOutput] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = () => {
        if (!newInput.trim()) return;
        onAddTestCase(newInput, newOutput);
        setNewInput('');
        setNewOutput('');
        setIsAdding(false);
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ 
                padding: '1rem', 
                borderBottom: '1px solid var(--cds-border-subtle-01)',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                backgroundColor: 'var(--cds-layer-01)'
            }}>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>測試案例</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                     {!isAdding ? (
                        <Button 
                            kind="ghost" 
                            size="sm" 
                            renderIcon={Add}
                            onClick={() => setIsAdding(true)}
                        >
                            新增測資
                        </Button>
                     ) : (
                         <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button kind="secondary" size="sm" onClick={() => setIsAdding(false)}>取消</Button>
                            <Button size="sm" onClick={handleAdd}>儲存</Button>
                         </div>
                     )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {isAdding && (
                    <Tile style={{ margin: '1rem', border: '1px dashed var(--cds-border-strong-01)' }}>
                        <FormLabel>輸入</FormLabel>
                        <TextArea 
                            labelText="" 
                            rows={3} 
                            value={newInput} 
                            onChange={(e: any) => setNewInput(e.target.value)} 
                            placeholder="請輸入測試資料..."
                            style={{ marginBottom: '1rem' }}
                        />
                        <FormLabel>預期輸出</FormLabel>
                        <TextArea 
                            labelText="" 
                            rows={3} 
                            value={newOutput} 
                            onChange={(e: any) => setNewOutput(e.target.value)} 
                            placeholder="請輸入預期輸出..." 
                        />
                    </Tile>
                )}

                <Accordion align="start">
                    {testCases.map((tc, index) => (
                        <AccordionItem 
                            key={tc.id} 
                            title={
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={tc.enabled}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => onToggleTestCase(tc.id, e.target.checked)}
                                            style={{ marginRight: '0.5rem' }}
                                        />
                                        <span>Case {index + 1}</span>
                                        {tc.source === 'public' ? (
                                            <Tag type="blue" size="sm">Public</Tag>
                                        ) : (
                                            <Tag type="purple" size="sm">Custom</Tag>
                                        )}
                                    </div>
                                    {tc.source === 'custom' && !tc.isSample && (
                                        <IconButton
                                            kind="ghost" 
                                            size="sm" 
                                            label="Delete"
                                            onClick={(e: any) => {
                                                e.stopPropagation();
                                                onDeleteTestCase(tc.id);
                                            }}
                                        >
                                            <TrashCan />
                                        </IconButton>
                                    )}
                                </div>
                            }
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <FormLabel>Input</FormLabel>
                                    <div style={{ 
                                        backgroundColor: 'var(--cds-layer-02)', 
                                        padding: '0.5rem', 
                                        whiteSpace: 'pre-wrap', 
                                        fontFamily: 'monospace',
                                        fontSize: '0.875rem' 
                                    }}>
                                        {tc.input}
                                    </div>
                                </div>
                                {tc.output && (
                                    <div>
                                        <FormLabel>Expected Output</FormLabel>
                                        <div style={{ 
                                            backgroundColor: 'var(--cds-layer-02)', 
                                            padding: '0.5rem', 
                                            whiteSpace: 'pre-wrap', 
                                            fontFamily: 'monospace',
                                            fontSize: '0.875rem'
                                        }}>
                                            {tc.output}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </AccordionItem>
                    ))}
                </Accordion>
                
                {testCases.length === 0 && !isAdding && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                        無測試案例
                    </div>
                )}
            </div>

            <div style={{ 
                padding: '1rem', 
                borderTop: '1px solid var(--cds-border-subtle-01)',
                display: 'flex', 
                justifyContent: 'flex-end',
                backgroundColor: 'var(--cds-layer-01)'
            }}>
                <Button 
                    renderIcon={Play} 
                    onClick={onRunTest}
                    disabled={running || testCases.filter(t => t.enabled).length === 0}
                >
                    {running ? '執行中...' : '測試執行'}
                </Button>
            </div>
        </div>
    );
};

export default TestCasePanel;
