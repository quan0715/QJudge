import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import { Layer } from "@carbon/react";
import { 
  TestCaseSidebarList, 
  TEST_CASE_SIDEBAR_LABELS,
  type TestCaseGroup,
  type CaseResultDisplay,
} from "../execution";
import { TestCaseDetail } from "./TestCaseDetail";

interface EditTestCasesPanelProps {
  testCases: TestCaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onAddTestCase: (input: string, output: string) => void;
  onDeleteTestCase: (id: string) => void;
  onUpdateTestCase?: (id: string, input: string, output: string) => void;
}

// Convert TestCaseItem to CaseResultDisplay for shared components
const toCaseResultDisplay = (tc: TestCaseItem, idx: number, type: 'sample' | 'custom'): CaseResultDisplay => ({
  id: tc.id,
  status: 'pending',
  label: type === 'sample' ? `Sample ${idx}` : `Custom ${idx}`,
  isHidden: tc.isHidden,
  input: tc.input,
  expectedOutput: tc.output,
});

export const EditTestCasesPanel: React.FC<EditTestCasesPanelProps> = ({
  testCases,
  onSelectCase,
  onAddTestCase,
  onDeleteTestCase,
  onUpdateTestCase,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prevCount = useRef(testCases.length);

  // Separate cases by source
  const publicCases = useMemo(() => 
    testCases.filter((tc) => tc.source === "public" || tc.isSample),
    [testCases]
  );
  const customCases = useMemo(() => 
    testCases.filter((tc) => tc.source === "custom" && !tc.isSample),
    [testCases]
  );

  // Convert to CaseResultDisplay format for shared components
  const allCasesDisplay: CaseResultDisplay[] = useMemo(() => [
    ...publicCases.map((tc, idx) => toCaseResultDisplay(tc, idx, 'sample')),
    ...customCases.map((tc, idx) => toCaseResultDisplay(tc, idx, 'custom')),
  ], [publicCases, customCases]);

  const groupedCases: TestCaseGroup = useMemo(() => ({
    sample: publicCases.map((tc, idx) => toCaseResultDisplay(tc, idx, 'sample')),
    custom: customCases.map((tc, idx) => toCaseResultDisplay(tc, idx, 'custom')),
  }), [publicCases, customCases]);

  // Auto-select new test case when added
  useEffect(() => {
    if (testCases.length > prevCount.current) {
        // New case added, select the last one
        const newIndex = allCasesDisplay.length - 1;
        if (newIndex >= 0) {
            setSelectedIndex(newIndex);
            const target = allCasesDisplay[newIndex];
            if (target) {
                onSelectCase(target.id);
            }
        }
    }
    prevCount.current = testCases.length;
  }, [testCases.length, allCasesDisplay, onSelectCase]);

  // Sync internal selectedIndex with props if needed/desired (or just rely on internal State for now)
  // But strictly we should respect if selectedCaseId changes from outside. 
  // For now the requirement is "on Add", which is covered above.

  const selectedCase = testCases[selectedIndex];
  const isCustomCase = selectedCase?.source === "custom";
  const selectedCaseDisplay = allCasesDisplay[selectedIndex];

  // Handle case selection
  const handleSelectCase = useCallback((idx: number) => {
    setSelectedIndex(idx);
    const caseItem = testCases[idx];
    if (caseItem) {
      onSelectCase(caseItem.id);
    }
  }, [testCases, onSelectCase]);

  // Handle add new case - Immediately create
  const handleAddNew = useCallback(() => {
    onAddTestCase("", "");
  }, [onAddTestCase]);

  // Handle duplicate sample as custom
  const handleDuplicate = useCallback(() => {
    if (selectedCase) {
      onAddTestCase(selectedCase.input || "", selectedCase.output || "");
    }
  }, [selectedCase, onAddTestCase]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (selectedCase && isCustomCase) {
      onDeleteTestCase(selectedCase.id);
      // Select previous or next case
      const newIndex = Math.max(0, selectedIndex - 1);
      setSelectedIndex(newIndex);
    }
  }, [selectedCase, isCustomCase, onDeleteTestCase, selectedIndex]);

  // Handle direct update
  const handleUpdate = useCallback((field: 'input' | 'expectedOutput', value: string) => {
    if (selectedCase && isCustomCase && onUpdateTestCase) {
        const input = field === 'input' ? value : (selectedCase.input || "");
        const output = field === 'expectedOutput' ? value : (selectedCase.output || "");
        onUpdateTestCase(selectedCase.id, input, output);
    }
  }, [selectedCase, isCustomCase, onUpdateTestCase]);

  return (
    <Layer level={0} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
       <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {/* Sidebar - Using shared component */}
        <div style={{ 
          width: "160px",
          minWidth: "160px",
          maxWidth: "160px",
          flexShrink: 0,
          overflowY: "auto", 
          borderRight: "1px solid var(--cds-border-subtle)" 
        }}>
          <TestCaseSidebarList
            selectedIndex={selectedIndex}
            onSelect={handleSelectCase}
            groupedCases={groupedCases}
            onAdd={handleAddNew}
            isAddingNew={false} // Always false as we add immediately
            labels={TEST_CASE_SIDEBAR_LABELS}
          />
        </div>

        {/* Detail - Using shared component with edit mode */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          <TestCaseDetail
            result={selectedCaseDisplay}
            editable={true}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            isCustomCase={isCustomCase}
          />
        </div>
      </div>
    </Layer>
  );
};

export default EditTestCasesPanel;
