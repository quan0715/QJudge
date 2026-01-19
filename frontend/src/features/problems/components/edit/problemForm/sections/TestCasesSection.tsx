import React, { useState, useCallback, useMemo } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import {
  Button,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  Modal,
  TextArea,
  NumberInput,
  Toggle,
  Tag,
  IconButton,
  Layer,
} from "@carbon/react";
import { Add, Edit, TrashCan, Checkmark, Warning } from "@carbon/icons-react";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import styles from "./TestCasesSection.module.scss";

interface TestCaseRow {
  id: string;
  index: number;
  input: string;
  output: string;
  isSample: boolean;
  isHidden: boolean;
  score: number;
  hasError: boolean;
}

/**
 * TestCasesSection - Clean Carbon-based test case management
 * 
 * Features:
 * - DataTable for list view with status indicators
 * - Modal for adding/editing test cases
 * - Auto-save integration via useProblemEdit
 */
const TestCasesSection: React.FC = () => {
  const { control, watch, getValues } = useFormContext<ProblemFormSchema>();
  const { handleFieldChange } = useProblemEdit();
  
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "testCases",
  });

  const testCases = watch("testCases") || [];

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    input: "",
    output: "",
    isSample: false,
    isHidden: false,
    score: 0,
  });

  // Prepare table rows
  const rows: TestCaseRow[] = useMemo(() => {
    return fields.map((field, index) => {
      const tc = testCases[index];
      const hasError = !tc?.input?.trim() || !tc?.output?.trim();
      return {
        id: field.id,
        index,
        input: tc?.input || "",
        output: tc?.output || "",
        isSample: tc?.isSample || false,
        isHidden: tc?.isHidden || false,
        score: tc?.score || 0,
        hasError,
      };
    });
  }, [fields, testCases]);

  // Table headers
  const headers = [
    { key: "index", header: "#" },
    { key: "type", header: "類型" },
    { key: "score", header: "分數" },
    { key: "status", header: "狀態" },
    { key: "actions", header: "" },
  ];

  // Open modal for new test case
  const handleAdd = useCallback(() => {
    setEditingIndex(null);
    setEditForm({
      input: "",
      output: "",
      isSample: false,
      isHidden: false,
      score: 0,
    });
    setModalOpen(true);
  }, []);

  // Open modal for editing
  const handleEdit = useCallback((index: number) => {
    const tc = testCases[index];
    setEditingIndex(index);
    setEditForm({
      input: tc?.input || "",
      output: tc?.output || "",
      isSample: tc?.isSample || false,
      isHidden: tc?.isHidden || false,
      score: tc?.score || 0,
    });
    setModalOpen(true);
  }, [testCases]);

  // Delete test case
  const handleDelete = useCallback((index: number) => {
    remove(index);
    // Trigger auto-save
    setTimeout(() => {
      const currentTestCases = getValues("testCases");
      handleFieldChange("testCases", currentTestCases);
    }, 0);
  }, [remove, getValues, handleFieldChange]);

  // Save from modal
  const handleModalSave = useCallback(() => {
    if (editingIndex !== null) {
      // Update existing - use `update` from useFieldArray for proper re-render
      update(editingIndex, editForm);
    } else {
      // Add new
      append(editForm);
    }
    setModalOpen(false);
    
    // Trigger auto-save after state update
    setTimeout(() => {
      const currentTestCases = getValues("testCases");
      handleFieldChange("testCases", currentTestCases);
    }, 0);
  }, [editingIndex, editForm, update, append, getValues, handleFieldChange]);

  // Render type tag
  const renderTypeTag = (row: TestCaseRow) => {
    if (row.isSample) {
      return <Tag type="cyan" size="sm">範例</Tag>;
    }
    if (row.isHidden) {
      return <Tag type="gray" size="sm">隱藏</Tag>;
    }
    return <Tag type="green" size="sm">公開</Tag>;
  };

  // Render status
  const renderStatus = (row: TestCaseRow) => {
    if (row.hasError) {
      return (
        <span className={styles.statusError}>
          <Warning size={16} />
          <span>資料不完整</span>
        </span>
      );
    }
    return (
      <span className={styles.statusOk}>
        <Checkmark size={16} />
        <span>完整</span>
      </span>
    );
  };

  return (
    <div className={styles.container}>
      <DataTable rows={rows} headers={headers} size="lg">
        {({ headers: tableHeaders, getTableProps, getHeaderProps }) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent>
                <Button
                  renderIcon={Add}
                  kind="primary"
                  onClick={handleAdd}
                >
                  新增測試案例
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className={styles.emptyState}>
                      <p>尚無測試案例</p>
                      <p className={styles.emptyHint}>點擊上方按鈕新增第一個測試案例</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((rowData) => (
                    <TableRow key={rowData.id}>
                      <TableCell>{rowData.index + 1}</TableCell>
                      <TableCell>{renderTypeTag(rowData)}</TableCell>
                      <TableCell>
                        <Tag type="purple" size="sm">{rowData.score}</Tag>
                      </TableCell>
                      <TableCell>{renderStatus(rowData)}</TableCell>
                      <TableCell>
                        <div className={styles.actionsCell}>
                          <IconButton
                            kind="ghost"
                            size="sm"
                            label="編輯"
                            onClick={() => handleEdit(rowData.index)}
                          >
                            <Edit />
                          </IconButton>
                          <IconButton
                            kind="ghost"
                            size="sm"
                            label="刪除"
                            onClick={() => handleDelete(rowData.index)}
                            className={styles.deleteButton}
                          >
                            <TrashCan />
                          </IconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      {/* Edit Modal */}
      <Modal
        open={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={handleModalSave}
        modalHeading={editingIndex !== null ? `編輯測試案例 #${editingIndex + 1}` : "新增測試案例"}
        primaryButtonText="儲存"
        secondaryButtonText="取消"
        size="lg"
        className={styles.modal}
      >
        <Layer className={styles.modalContent}>
          <div className={styles.ioGrid}>
            <TextArea
              id="tc-input"
              labelText="輸入 (Input)"
              placeholder="輸入測試資料..."
              value={editForm.input}
              onChange={(e) => setEditForm((prev) => ({ ...prev, input: e.target.value }))}
              rows={6}
              invalid={!editForm.input.trim()}
              invalidText="Input 為必填欄位"
            />
            <TextArea
              id="tc-output"
              labelText="預期輸出 (Expected Output)"
              placeholder="輸入預期輸出..."
              value={editForm.output}
              onChange={(e) => setEditForm((prev) => ({ ...prev, output: e.target.value }))}
              rows={6}
              invalid={!editForm.output.trim()}
              invalidText="Output 為必填欄位"
            />
          </div>

          <div className={styles.optionsRow}>
            <NumberInput
              id="tc-score"
              label="分數"
              value={editForm.score}
              min={0}
              step={10}
              onChange={(_, { value }) => {
                setEditForm((prev) => ({
                  ...prev,
                  score: typeof value === "string" ? parseInt(value) || 0 : value,
                }));
              }}
            />
            <Toggle
              id="tc-sample"
              labelText="範例測資"
              labelA="否"
              labelB="是"
              toggled={editForm.isSample}
              onToggle={(checked) => {
                setEditForm((prev) => ({
                  ...prev,
                  isSample: checked,
                  isHidden: checked ? false : prev.isHidden,
                }));
              }}
            />
            <Toggle
              id="tc-hidden"
              labelText="隱藏測資"
              labelA="否"
              labelB="是"
              toggled={editForm.isHidden}
              onToggle={(checked) => {
                setEditForm((prev) => ({
                  ...prev,
                  isHidden: checked,
                  isSample: checked ? false : prev.isSample,
                }));
              }}
            />
          </div>
        </Layer>
      </Modal>
    </div>
  );
};

export default TestCasesSection;
