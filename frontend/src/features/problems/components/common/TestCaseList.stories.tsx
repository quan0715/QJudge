import { useEffect, useState } from "react";
import type { StoryModule } from "@/shared/types/story.types";
import TestCaseList, { type TestCaseItem } from "./TestCaseList";
import type { TestCaseMode } from "./TestCaseTypes";

const getInitialItems = (mode: TestCaseMode): TestCaseItem[] => {
  if (mode === "result") {
    return [
      {
        id: "r-1",
        input: "1 2",
        output: "3",
        actualOutput: "3",
        status: "AC",
        execTime: 12,
        memoryUsage: 1024,
      },
      {
        id: "r-2",
        input: "2 2",
        output: "4",
        actualOutput: "5",
        status: "WA",
        execTime: 15,
        memoryUsage: 1100,
        errorMessage: "Output mismatch",
      },
    ];
  }

  if (mode === "solver") {
    return [
      {
        id: "p-1",
        input: "1 1",
        output: "2",
        source: "public",
      },
      {
        id: "c-1",
        input: "3 4",
        output: "7",
        source: "custom",
      },
    ];
  }

  return [
    {
      id: "tc-1",
      input: "1 2",
      output: "3",
      isSample: true,
      isHidden: false,
      score: 10,
    },
    {
      id: "tc-2",
      input: "2 2",
      output: "4",
      isSample: false,
      isHidden: true,
      score: 20,
    },
  ];
};

const TestCaseListDemo = ({ mode, readOnly }: { mode: TestCaseMode; readOnly: boolean }) => {
  const [items, setItems] = useState<TestCaseItem[]>(() => getInitialItems(mode));

  useEffect(() => {
    setItems(getInitialItems(mode));
  }, [mode]);

  const handleAdd = (input: string, output: string, isHidden?: boolean, score?: number) => {
    const next: TestCaseItem = {
      id: `tc-${Date.now()}`,
      input,
      output,
      isHidden,
      score,
      source: mode === "solver" ? "custom" : undefined,
    };
    setItems((prev) => [...prev, next]);
  };

  const handleUpdate = (id: string, input: string, output: string, score?: number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, input, output, score } : item)));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleVisibility = (id: string, isHidden: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isHidden } : item)));
  };

  const handleToggleSample = (id: string, isSample: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isSample } : item)));
  };

  return (
    <TestCaseList
      items={items}
      mode={mode}
      readOnly={readOnly}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      onToggleVisibility={handleToggleVisibility}
      onToggleSample={handleToggleSample}
    />
  );
};

const storyModule: StoryModule<{ mode: TestCaseMode; readOnly: boolean }> = {
  meta: {
    title: "features/problems/components/common/TestCaseList",
    component: TestCaseList,
    category: "features",
    description: "題目與解題流程共用的測資列表（含新增/編輯/檢視）。",
    defaultArgs: {
      mode: "problem",
      readOnly: false,
    },
    argTypes: {
      mode: {
        control: "select",
        description: "顯示模式",
        options: ["problem", "solver", "result"],
        defaultValue: "problem",
      },
      readOnly: {
        control: "boolean",
        description: "是否只讀",
        defaultValue: false,
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "切換模式與只讀狀態。",
      render: (args) => <TestCaseListDemo mode={args.mode} readOnly={args.readOnly} />,
    },
    {
      name: "All Modes",
      description: "Problem / Solver / Result 三種模式對照。",
      render: () => (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          <div>
            <h4 style={{ margin: "0 0 0.5rem" }}>Problem Mode</h4>
            <TestCaseListDemo mode="problem" readOnly={false} />
          </div>
          <div>
            <h4 style={{ margin: "0 0 0.5rem" }}>Solver Mode</h4>
            <TestCaseListDemo mode="solver" readOnly={false} />
          </div>
          <div>
            <h4 style={{ margin: "0 0 0.5rem" }}>Result Mode</h4>
            <TestCaseListDemo mode="result" readOnly={true} />
          </div>
        </div>
      ),
    },
  ],
};

export default storyModule;
