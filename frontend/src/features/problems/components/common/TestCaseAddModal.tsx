import { useEffect, useState } from "react";
import { Modal, TextArea, FormLabel, NumberInput, Toggle } from "@carbon/react";
import type { TestCaseMode } from "./TestCaseTypes";

interface TestCaseAddModalProps {
  open: boolean;
  mode: TestCaseMode;
  onClose: () => void;
  onSubmit: (payload: { input: string; output: string; isHidden?: boolean; score?: number }) => void;
}

const TestCaseAddModal: React.FC<TestCaseAddModalProps> = ({
  open,
  mode,
  onClose,
  onSubmit,
}) => {
  const [newInput, setNewInput] = useState("");
  const [newOutput, setNewOutput] = useState("");
  const [newScore, setNewScore] = useState(0);
  const [newIsHidden, setNewIsHidden] = useState(false);
  const [addError, setAddError] = useState("");

  const isProblemMode = mode === "problem";

  useEffect(() => {
    if (!open) return;
    setNewInput("");
    setNewOutput("");
    setNewScore(0);
    setNewIsHidden(false);
    setAddError("");
  }, [open]);

  const handleAdd = () => {
    if (!newInput.trim()) {
      setAddError("輸入不得為空");
      return;
    }
    if (!newOutput.trim()) {
      setAddError("預期輸出不得為空");
      return;
    }

    onSubmit({
      input: newInput,
      output: newOutput,
      isHidden: isProblemMode ? newIsHidden : undefined,
      score: newScore,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      modalHeading="新增測試案例"
      primaryButtonText="儲存"
      secondaryButtonText="取消"
      onRequestClose={onClose}
      onRequestSubmit={handleAdd}
      size="md"
    >
      <div style={{ marginBottom: "1rem" }}>
        <FormLabel>輸入 (Input) *</FormLabel>
        <TextArea
          labelText=""
          rows={4}
          value={newInput}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setNewInput(e.target.value);
            setAddError("");
          }}
          placeholder="請輸入測試資料..."
          invalid={addError.includes("輸入")}
          style={{ marginBottom: "1rem" }}
        />
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <FormLabel>預期輸出 (Expected Output) *</FormLabel>
        <TextArea
          labelText=""
          rows={4}
          value={newOutput}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setNewOutput(e.target.value);
            setAddError("");
          }}
          placeholder="請輸入預期輸出..."
          invalid={addError.includes("輸出")}
        />
      </div>

      {isProblemMode && (
        <div style={{ marginBottom: "1rem" }}>
          <NumberInput
            id="new-tc-score"
            label="分數 (Score)"
            value={newScore}
            onChange={(_e, { value }) => setNewScore(Number(value))}
            min={0}
            style={{ marginBottom: "1rem" }}
          />
        </div>
      )}

      {isProblemMode && (
        <div style={{ marginBottom: "1rem" }}>
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
        <p style={{ color: "var(--cds-support-error)", fontSize: "0.875rem" }}>
          {addError}
        </p>
      )}
    </Modal>
  );
};

export default TestCaseAddModal;
