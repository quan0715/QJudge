
import React, { useState } from 'react';
import { 
    Button, TextArea, FormLabel, NumberInput,
    Accordion, AccordionItem, Tag, Toggle, Modal
} from '@carbon/react';
import { Add, TrashCan, Edit, Locked } from '@carbon/icons-react';
import { SubmissionStatusBadge } from '@/ui/components/badges/SubmissionStatusBadge';

export interface TestCaseItem {
    id: string;
    input: string;
    output?: string; // Expected Output
    
    // For problem test cases (ProblemForm)
    isSample?: boolean;  // Is this a sample test case (shown to students)
    isHidden?: boolean;  // Is this test case hidden from students
    
    // For Solver custom test cases
    source?: 'public' | 'custom';
    
    // Result specific (SubmissionDetailModal)
    status?: string;
    execTime?: number; // ms
    memoryUsage?: number; // KB
    errorMessage?: string;
    actualOutput?: string;
    score?: number;
}

/**
 * TestCaseList Modes:
 * - 'solver': For ProblemCodingTab - shows public test cases (readonly) + custom test cases (editable/deletable)
 * - 'problem': For ProblemForm - all test cases editable, with public/hidden toggle
 * - 'result': For SubmissionDetailModal - readonly display with execution results
 */
type TestCaseMode = 'solver' | 'problem' | 'result';

interface TestCaseListProps {
    items: TestCaseItem[];
    mode?: TestCaseMode;
    readOnly?: boolean;
    
    // Edit actions
    onAdd?: (input: string, output: string, isHidden?: boolean, score?: number) => void;
    onDelete?: (id: string) => void;
    onUpdate?: (id: string, input: string, output: string, score?: number) => void;
    onToggleVisibility?: (id: string, isHidden: boolean) => void;
    onToggleSample?: (id: string, isSample: boolean) => void;
    
    // Add form control (for external control)
    isAdding?: boolean;
    onCancelAdd?: () => void;
}

export const TestCaseList: React.FC<TestCaseListProps> = ({
    items,
    mode = 'solver',
    readOnly = false,
    onAdd,
    onDelete,
    onUpdate,
    onToggleVisibility,
    onToggleSample,
    isAdding: externalIsAdding,
    onCancelAdd
}) => {
    // Add Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newInput, setNewInput] = useState('');
    const [newOutput, setNewOutput] = useState('');
    const [newScore, setNewScore] = useState(0);
    const [newIsHidden, setNewIsHidden] = useState(false);
    const [addError, setAddError] = useState('');
    
    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');
    const [editOutput, setEditOutput] = useState('');
    const [editScore, setEditScore] = useState(0);
    
    // Determine if external control is being used for the add button
    const hasExternalAddControl = externalIsAdding !== undefined || onCancelAdd !== undefined;
    
    // Modal open state: use external if provided, otherwise use internal state
    const isModalOpen = hasExternalAddControl ? (externalIsAdding ?? false) : isAddModalOpen;
    
    const openAddModal = () => {
        setIsAddModalOpen(true);
        setNewInput('');
        setNewOutput('');
        setNewScore(0);
        setNewIsHidden(false);
        setAddError('');
    };
    
    const closeAddModal = () => {
        setIsAddModalOpen(false);
        if (onCancelAdd) onCancelAdd();
    };

    const handleAdd = () => {
        // Validation: both input and output must not be empty
        if (!newInput.trim()) {
            setAddError('輸入不得為空');
            return;
        }
        if (!newOutput.trim()) {
            setAddError('預期輸出不得為空');
            return;
        }
        
        if (onAdd) {
            onAdd(newInput, newOutput, mode === 'problem' ? newIsHidden : undefined, newScore);
        }
        closeAddModal();
    };

    const startEdit = (item: TestCaseItem) => {
        setEditingId(item.id);
        setEditInput(item.input);
        setEditOutput(item.output || '');
        setEditScore(item.score || 0);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditInput('');
        setEditOutput('');
        setEditScore(0);
    };

    const saveEdit = (id: string) => {
        if (onUpdate) {
            onUpdate(id, editInput, editOutput, editScore);
        }
        cancelEdit();
    };

    const isProblemMode = mode === 'problem';
    const isSolverMode = mode === 'solver';
    const isResultMode = mode === 'result';

    // Determine if an item is editable
    const isItemEditable = (item: TestCaseItem) => {
        if (readOnly || isResultMode) return false;
        if (isProblemMode) return true; // All items editable in problem mode
        if (isSolverMode) return item.source === 'custom'; // Only custom in solver mode
        return false;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Add Button - Only show if not readOnly, not result mode, has onAdd, and NOT controlled externally */}
            {!readOnly && !isResultMode && onAdd && !hasExternalAddControl && (
                <div style={{ 
                    padding: '0.75rem 1rem', 
                    borderBottom: '1px solid var(--cds-border-subtle)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    backgroundColor: 'var(--cds-layer-01)'
                }}>
                    <Button 
                        kind="ghost" 
                        size="sm" 
                        renderIcon={Add}
                        onClick={openAddModal}
                    >
                        新增測資
                    </Button>
                </div>
            )}

            {/* Add Modal */}
            <Modal
                open={isModalOpen}
                modalHeading="新增測試案例"
                primaryButtonText="儲存"
                secondaryButtonText="取消"
                onRequestClose={closeAddModal}
                onRequestSubmit={handleAdd}
                size="md"
            >
                <div style={{ marginBottom: '1rem' }}>
                    <FormLabel>輸入 (Input) *</FormLabel>
                    <TextArea 
                        labelText="" 
                        rows={4} 
                        value={newInput} 
                        onChange={(e: any) => {
                            setNewInput(e.target.value);
                            setAddError('');
                        }} 
                        placeholder="請輸入測試資料..."
                        invalid={addError.includes('輸入')}
                        style={{ marginBottom: '1rem' }}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <FormLabel>預期輸出 (Expected Output) *</FormLabel>
                    <TextArea 
                        labelText="" 
                        rows={4} 
                        value={newOutput} 
                        onChange={(e: any) => {
                            setNewOutput(e.target.value);
                            setAddError('');
                        }} 
                        placeholder="請輸入預期輸出..."
                        invalid={addError.includes('輸出')}
                    />
                </div>

                {isProblemMode && (
                    <div style={{ marginBottom: '1rem' }}>
                         <NumberInput
                            id="new-tc-score"
                            label="分數 (Score)"
                            value={newScore}
                            onChange={(_e: any, { value }: { value: number | string }) => setNewScore(Number(value))}
                            min={0}
                            style={{ marginBottom: '1rem' }}
                        />
                    </div>
                )}
                
                
                {/* Visibility Toggle for Problem Mode */}
                {isProblemMode && (
                    <div style={{ marginBottom: '1rem' }}>
                        <Toggle
                            id="new-tc-visibility"
                            labelText="測資可見性"
                            labelA="公開 (學生可見)"
                            labelB="隱藏 (學生不可見)"
                            toggled={newIsHidden}
                            onToggle={(checked) => setNewIsHidden(checked)}
                            size="sm"
                        />
                    </div>
                )}
                
                {addError && (
                    <p style={{ color: 'var(--cds-support-error)', fontSize: '0.875rem' }}>
                        {addError}
                    </p>
                )}
            </Modal>

            {/* List */}
            <div>
                {items.length === 0 && (
                    <div style={{ 
                        padding: '2rem', 
                        textAlign: 'center', 
                        color: 'var(--cds-text-secondary)' 
                    }}>
                        無測試案例
                    </div>
                )}

                {items.length > 0 && (
                    <Accordion align="start" size="lg">
                        {items.map((item, index) => {
                            const isEditing = editingId === item.id;
                            const canEdit = isItemEditable(item);
                            const canDelete = canEdit && onDelete;
                            
                            return (
                                <AccordionItem 
                                    key={item.id} 
                                    title={
                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center', 
                                            width: '100%', 
                                            paddingRight: '1rem' 
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{ fontWeight: 600, minWidth: '60px' }}>
                                                  Case {index + 1}
                                                </span>

                                                {isProblemMode && (
                                                    <Tag type="cyan" size="sm">
                                                        {item.score ?? 0} 分
                                                    </Tag>
                                                )}
                                                
                                                
                                                {/* Tags for Problem Mode */}
                                                {isProblemMode && (
                                                    <Tag 
                                                        type={item.isHidden ? 'gray' : 'blue'} 
                                                        size="sm"
                                                    >
                                                        {item.isHidden ? '隱藏' : '公開'}
                                                    </Tag>
                                                )}

                                                {/* Tags for Solver Mode */}
                                                {isSolverMode && (
                                                    <Tag 
                                                        type={item.source === 'public' ? 'blue' : 'purple'} 
                                                        size="sm"
                                                    >
                                                        {item.source === 'public' ? '公開測資' : '自訂測資'}
                                                    </Tag>
                                                )}

                                                {/* Status for Result Mode */}
                                                {isResultMode && item.status && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                         <SubmissionStatusBadge status={item.status} size="sm" />
                                                         {item.execTime !== undefined && (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                                                                {item.execTime}ms / {item.memoryUsage}KB
                                                            </span>
                                                         )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    }
                                >
                                    <div style={{ padding: '0.5rem 0' }}>
                                        {/* Actions Row - Only show when editable */}
                                        {canEdit && (
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                marginBottom: '1rem', 
                                                paddingBottom: '0.5rem', 
                                                borderBottom: '1px solid var(--cds-border-subtle)' 
                                            }}>
                                                {/* Left side - Visibility Toggle (Problem Mode Only) */}
                                                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                                    {isProblemMode && onToggleVisibility && (
                                                        <Toggle
                                                            id={`tc-visibility-${item.id}`}
                                                            labelText="可見性"
                                                            labelA="隱藏"
                                                            labelB="公開"
                                                            toggled={!(item.isHidden ?? false)}
                                                            onToggle={(checked) => onToggleVisibility(item.id, !checked)}
                                                            size="sm"
                                                        />
                                                    )}
                                                    {isProblemMode && onToggleSample && (
                                                        <Toggle
                                                            id={`tc-sample-${item.id}`}
                                                            labelText="範例測資"
                                                            labelA="否"
                                                            labelB="是"
                                                            toggled={item.isSample ?? false}
                                                            onToggle={(checked) => onToggleSample(item.id, checked)}
                                                            size="sm"
                                                        />
                                                    )}
                                                </div>
                                                
                                                {/* Right side - Edit/Delete Actions */}
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {!isEditing && onUpdate && (
                                                        <Button
                                                            kind="ghost" 
                                                            size="sm" 
                                                            renderIcon={Edit}
                                                            onClick={() => startEdit(item)}
                                                        >
                                                            編輯
                                                        </Button>
                                                    )}
                                                    {canDelete && (
                                                        <Button
                                                            kind="danger--ghost" 
                                                            size="sm" 
                                                            renderIcon={TrashCan}
                                                            onClick={() => onDelete(item.id)}
                                                        >
                                                            刪除
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Message (Result Mode) */}
                                        {isResultMode && item.errorMessage && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                 <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-support-error)', marginBottom: '0.25rem' }}>Error Message</div>
                                                 <pre style={{
                                                    padding: '0.5rem',
                                                    backgroundColor: 'var(--cds-layer-02)',
                                                    color: 'var(--cds-support-error)',
                                                    fontSize: '0.8125rem',
                                                    borderRadius: '4px'
                                                 }}>{item.errorMessage}</pre>
                                            </div>
                                        )}

                                        {/* Content Grid - Edit Mode */}
                                        {isEditing ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <FormLabel style={{ marginBottom: '0.25rem' }}>輸入 (Input)</FormLabel>
                                                    <TextArea
                                                        labelText=""
                                                        rows={4}
                                                        value={editInput}
                                                        onChange={(e: any) => setEditInput(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <FormLabel style={{ marginBottom: '0.25rem' }}>預期輸出 (Expected Output)</FormLabel>
                                                    <TextArea
                                                        labelText=""
                                                        rows={4}
                                                        value={editOutput}
                                                        onChange={(e: any) => setEditOutput(e.target.value)}
                                                    />
                                                </div>
                                                {isProblemMode && (
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                         <NumberInput
                                                            id={`edit-tc-score-${item.id}`}
                                                            label="分數 (Score)"
                                                            value={editScore}
                                                            onChange={(_e: any, { value }: { value: number | string }) => setEditScore(Number(value))}
                                                            min={0}
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                    <Button kind="secondary" size="sm" onClick={cancelEdit}>取消</Button>
                                                    <Button size="sm" onClick={() => saveEdit(item.id)}>儲存變更</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Content Grid - View Mode */
                                            <>
                                                {/* Hidden Test Case Message */}
                                                {(item.isHidden || item.input === null || item.input === undefined) && isResultMode ? (
                                                    <div style={{ 
                                                        padding: '2rem', 
                                                        textAlign: 'center', 
                                                        backgroundColor: 'var(--cds-layer-01)',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--cds-border-subtle)'
                                                    }}>
                                                        <p style={{ 
                                                            color: 'var(--cds-text-secondary)',
                                                            fontSize: '0.875rem',
                                                            margin: 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '0.5rem'
                                                        }}>
                                                            <Locked size={16} /> 這是隱藏測資，無法查看詳細內容
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div style={{ 
                                                        display: 'grid', 
                                                        gridTemplateColumns: '1fr 1fr', 
                                                        gap: '1rem',
                                                        backgroundColor: isResultMode ? 'var(--cds-ui-02)' : 'transparent',
                                                        padding: isResultMode ? '1rem' : '0',
                                                        borderRadius: '4px'
                                                    }}>
                                                        <div>
                                                            <FormLabel style={{ marginBottom: '0.25rem' }}>輸入 (Input)</FormLabel>
                                                            <pre style={{ 
                                                                backgroundColor: 'var(--cds-layer-01)', 
                                                                padding: '0.75rem', 
                                                                margin: 0,
                                                                borderRadius: '4px',
                                                                fontFamily: 'var(--cds-code-01)',
                                                                fontSize: '0.8125rem',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-all',
                                                                minHeight: '40px',
                                                                border: '1px solid var(--cds-border-subtle)'
                                                            }}>
                                                                {item.input || '(empty)'}
                                                            </pre>
                                                        </div>

                                                        {/* Expected Output */}
                                                        <div>
                                                            <FormLabel style={{ marginBottom: '0.25rem' }}>預期輸出 (Expected Output)</FormLabel>
                                                            <pre style={{ 
                                                                backgroundColor: 'var(--cds-layer-01)', 
                                                                padding: '0.75rem', 
                                                                margin: 0,
                                                                borderRadius: '4px',
                                                                fontFamily: 'var(--cds-code-01)',
                                                                fontSize: '0.8125rem',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-all',
                                                                minHeight: '40px',
                                                                border: '1px solid var(--cds-border-subtle)'
                                                            }}>
                                                                {item.output || '(empty)'}
                                                            </pre>
                                                        </div>

                                                        {/* Actual Output (Result Mode) */}
                                                        {isResultMode && item.actualOutput !== undefined && (
                                                            <div style={{ gridColumn: '1 / -1' }}>
                                                                <FormLabel style={{ marginBottom: '0.25rem' }}>實際輸出 (Actual Output)</FormLabel>
                                                                <pre style={{ 
                                                                    backgroundColor: 'var(--cds-layer-01)', 
                                                                    padding: '0.75rem', 
                                                                    margin: 0,
                                                                    borderRadius: '4px',
                                                                    fontFamily: 'var(--cds-code-01)',
                                                                    fontSize: '0.8125rem',
                                                                    whiteSpace: 'pre-wrap',
                                                                    wordBreak: 'break-all',
                                                                    minHeight: '40px',
                                                                    border: '1px solid var(--cds-border-subtle)'
                                                                }}>
                                                                    {item.actualOutput || '(empty)'}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                )}
            </div>
        </div>
    );
};
