import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QJudgeEditor } from "./QJudgeEditor";

const mocks = vi.hoisted(() => ({
  editorProps: vi.fn(),
}));

vi.mock("@monaco-editor/react", () => ({
  default: (props: { value?: string; defaultValue?: string }) => {
    mocks.editorProps(props);
    return <div data-testid="monaco-editor" />;
  },
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: () => ({ theme: "white" }),
}));

describe("QJudgeEditor", () => {
  it("passes changing code to Monaco as a controlled value", () => {
    const { rerender } = render(
      <QJudgeEditor value="// problem A" language="cpp" />,
    );

    expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    expect(mocks.editorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: "// problem A" }),
    );

    rerender(<QJudgeEditor value="// problem B" language="cpp" />);

    expect(mocks.editorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: "// problem B" }),
    );
  });
});
