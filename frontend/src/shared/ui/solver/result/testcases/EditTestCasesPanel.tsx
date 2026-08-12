import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer } from "@carbon/react";
import type { TestCaseData, TestCaseItem } from "@/core/entities/testcase.entity";
import { TestCaseDetail } from "@/shared/ui/testcase/TestCaseDetail";
import {
  TestCaseSidebarList,
  type TestCaseGroup,
} from "../execution";
import styles from "./EditTestCasesPanel.module.scss";

const TEST_CASE_SIDEBAR_LABELS = { addAction: "新增測資" };

interface EditTestCasesPanelProps {
  testCases: TestCaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onAddTestCase: (input: string, output: string) => void;
  onDeleteTestCase: (id: string) => void;
  onUpdateTestCase?: (id: string, input: string, output: string) => void;
}

const toSidebarItem = (
  testCase: TestCaseItem,
  index: number,
  type: "sample" | "custom",
) => ({
  id: testCase.id,
  label: type === "sample" ? `Sample ${index + 1}` : `Custom ${index + 1}`,
  isHidden: testCase.isHidden,
});

const toTestCaseData = (testCase: TestCaseItem): TestCaseData => ({
  id: testCase.id,
  input: testCase.input,
  output: testCase.output ?? "",
  source: testCase.isHidden
    ? "hidden"
    : testCase.source === "custom" && !testCase.isSample
      ? "custom"
      : "sample",
  isHidden: testCase.isHidden,
});

export const EditTestCasesPanel = ({
  testCases,
  selectedCaseId,
  onSelectCase,
  onAddTestCase,
  onDeleteTestCase,
  onUpdateTestCase,
}: EditTestCasesPanelProps) => {
  const previousCount = useRef(testCases.length);
  const [selection, setSelection] = useState(() => ({
    externalId: selectedCaseId,
    activeId: selectedCaseId,
  }));

  const sampleCases = useMemo(
    () => testCases.filter((testCase) => testCase.source === "public" || testCase.isSample),
    [testCases],
  );
  const customCases = useMemo(
    () => testCases.filter((testCase) => testCase.source === "custom" && !testCase.isSample),
    [testCases],
  );
  const orderedCases = useMemo(
    () => [...sampleCases, ...customCases],
    [sampleCases, customCases],
  );

  const groupedCases: TestCaseGroup = useMemo(
    () => ({
      sample: sampleCases.map((testCase, index) =>
        toSidebarItem(testCase, index, "sample"),
      ),
      custom: customCases.map((testCase, index) =>
        toSidebarItem(testCase, index, "custom"),
      ),
    }),
    [sampleCases, customCases],
  );

  useEffect(() => {
    if (testCases.length > previousCount.current) {
      const target = orderedCases.at(-1);
      if (target) {
        onSelectCase(target.id);
      }
    }
    previousCount.current = testCases.length;
  }, [onSelectCase, orderedCases, testCases.length]);

  const effectiveSelectedId =
    selection.externalId === selectedCaseId
      ? selection.activeId
      : selectedCaseId;
  const matchedSelectedIndex = orderedCases.findIndex(
    (testCase) => testCase.id === effectiveSelectedId,
  );
  const selectedIndex = Math.max(0, matchedSelectedIndex);
  const selectedCase = orderedCases[selectedIndex];
  const isCustomCase = selectedCase?.source === "custom";

  const handleSelectCase = useCallback(
    (index: number) => {
      const nextCase = orderedCases[index];
      if (nextCase) {
        setSelection({ externalId: selectedCaseId, activeId: nextCase.id });
        onSelectCase(nextCase.id);
      }
    },
    [onSelectCase, orderedCases, selectedCaseId],
  );

  const handleAddNew = useCallback(() => {
    onAddTestCase("", "");
  }, [onAddTestCase]);

  const handleDuplicate = useCallback(() => {
    if (selectedCase) {
      onAddTestCase(selectedCase.input, selectedCase.output ?? "");
    }
  }, [onAddTestCase, selectedCase]);

  const handleDelete = useCallback(() => {
    if (!selectedCase || !isCustomCase) return;
    const remainingCases = orderedCases.filter(
      (testCase) => testCase.id !== selectedCase.id,
    );
    const fallbackCase =
      remainingCases[Math.max(0, selectedIndex - 1)] ?? remainingCases[0];
    onDeleteTestCase(selectedCase.id);
    if (fallbackCase) {
      setSelection({ externalId: selectedCaseId, activeId: fallbackCase.id });
      onSelectCase(fallbackCase.id);
    }
  }, [
    isCustomCase,
    onDeleteTestCase,
    onSelectCase,
    orderedCases,
    selectedCase,
    selectedCaseId,
    selectedIndex,
  ]);

  const handleUpdate = useCallback(
    (field: "input" | "expectedOutput", value: string) => {
      if (!selectedCase || !isCustomCase || !onUpdateTestCase) return;
      onUpdateTestCase(
        selectedCase.id,
        field === "input" ? value : selectedCase.input,
        field === "expectedOutput" ? value : selectedCase.output ?? "",
      );
    },
    [isCustomCase, onUpdateTestCase, selectedCase],
  );

  return (
    <Layer level={0} className={styles.panel}>
      <div className={styles.content}>
        <div className={styles.sidebar}>
          <TestCaseSidebarList
            selectedIndex={selectedIndex}
            onSelect={handleSelectCase}
            groupedCases={groupedCases}
            onAdd={handleAddNew}
            labels={TEST_CASE_SIDEBAR_LABELS}
          />
        </div>

        <div className={styles.detail}>
          <TestCaseDetail
            testCase={selectedCase ? toTestCaseData(selectedCase) : null}
            mode={
              selectedCase?.isHidden
                ? "hidden"
                : isCustomCase
                  ? "writable"
                  : "readonly"
            }
            onInputChange={(value) => handleUpdate("input", value)}
            onOutputChange={(value) => handleUpdate("expectedOutput", value)}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </div>
      </div>
    </Layer>
  );
};

export default EditTestCasesPanel;
