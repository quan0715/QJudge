import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CopilotError, CopilotPendingAttachment } from "@copilot";

import { ComposerBar } from "./ComposerBar";

const baseProps = {
  value: "Retry upload",
  onValueChange: vi.fn(),
  onAddAttachments: vi.fn(),
  onRemoveAttachment: vi.fn(),
  onSend: vi.fn().mockResolvedValue(true),
  canSend: true,
  models: [{ id: "fast", displayName: "Fast" }],
  selectedModelId: "fast",
  onModelChange: vi.fn(),
  isStreaming: false,
};

describe("ComposerBar run activity", () => {
  it("shows activity only during tool execution and preserves the stop action", () => {
    const onStop = vi.fn();
    const props = { ...baseProps, attachments: [], isStreaming: true, onStop };
    const { rerender } = render(<ComposerBar {...props} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stopGenerating|停止生成/i }));
    expect(onStop).toHaveBeenCalledOnce();

    rerender(<ComposerBar {...props} messages={[{
      id: "assistant-1", role: "assistant", createdAt: new Date(),
      parts: [{
        type: "tool", toolCallId: "read-unit", toolName: "get_grading_unit",
        state: "input-ready",
      }],
    }]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/activityExecuting|正在執行操作/i);

    rerender(<ComposerBar {...props} isStreaming={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ComposerBar model notice", () => {
  it("shows the model notice as an inline warning", () => {
    render(
      <ComposerBar
        {...baseProps}
        attachments={[]}
        modelNotice="此站台尚未設定 AI 模型，請聯絡站台管理員。"
      />,
    );
    expect(screen.getByText("此站台尚未設定 AI 模型，請聯絡站台管理員。")).toBeInTheDocument();
  });
});

function attachment(
  status: CopilotPendingAttachment["status"],
  error?: CopilotError,
): CopilotPendingAttachment {
  return {
    id: `attachment-${status}`,
    file: new File(["data"], "grade.csv", { type: "text/csv" }),
    status,
    error,
  };
}

describe("ComposerBar attachment state", () => {
  it("announces upload progress and blocks remove and resubmit", () => {
    const onRemoveAttachment = vi.fn();
    const onSend = vi.fn().mockResolvedValue(true);
    render(
      <ComposerBar
        {...baseProps}
        attachments={[attachment("uploading")]}
        onRemoveAttachment={onRemoveAttachment}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /uploading|上傳中/i,
    );
    const remove = screen.getByRole("button", {
      name: /removeAttachment|移除附件/i,
    });
    expect(remove).toBeDisabled();
    expect(screen.getByRole("button", { name: /send|送出/i })).toBeDisabled();
    fireEvent.click(remove);
    expect(onRemoveAttachment).not.toHaveBeenCalled();
  });

  it("locks every attachment removal while any attachment is uploading", () => {
    render(
      <ComposerBar
        {...baseProps}
        attachments={[attachment("uploading"), attachment("pending")]}
      />,
    );

    expect(
      screen.getAllByRole("button", {
        name: /removeAttachment|移除附件/i,
      }),
    ).toSatisfy((buttons: HTMLButtonElement[]) =>
      buttons.every((button) => button.disabled),
    );
  });

  it("announces upload errors and allows remove or retry send", () => {
    const onRemoveAttachment = vi.fn();
    const onSend = vi.fn().mockResolvedValue(true);
    const error: CopilotError = {
      code: "transport-error",
      operation: "upload-attachment",
      message: "Upload offline",
      recoverable: true,
    };
    render(
      <ComposerBar
        {...baseProps}
        attachments={[attachment("error", error)]}
        onRemoveAttachment={onRemoveAttachment}
        onSend={onSend}
      />,
    );

    expect(screen.getByText("Upload offline").closest('[role="alert"]')).toBeInTheDocument();
    const remove = screen.getByRole("button", {
      name: /removeAttachment|移除附件/i,
    });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(onRemoveAttachment).toHaveBeenCalledWith("attachment-error");
    const send = screen.getByRole("button", { name: /send|送出/i });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("disables attachment removal with the rest of a locked composer", () => {
    render(
      <ComposerBar
        {...baseProps}
        attachments={[attachment("pending")]}
        disabled
      />,
    );

    expect(
      screen.getByRole("button", { name: /removeAttachment|移除附件/i }),
    ).toBeDisabled();
  });
});

describe("ComposerBar fluid input", () => {
  it("sends with Enter while preserving Shift+Enter and IME composition", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const onValueChange = vi.fn();
    render(<ComposerBar {...baseProps} attachments={[]} onSend={onSend} onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", {name: /輸入訊息|inputAriaLabel/});
    fireEvent.change(input, {target: {value: "第一行\n第二行"}});
    expect(onValueChange).toHaveBeenCalledWith("第一行\n第二行");
    fireEvent.keyDown(input, {key: "Enter", shiftKey: true});
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, {key: "Enter"});
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, {key: "Enter"});
    expect(onSend).toHaveBeenCalledOnce();
  });
  it("respects canSend for keyboard submission as well as the action button", () => {
    const onSend = vi.fn();
    render(<ComposerBar {...baseProps} attachments={[]} canSend={false} onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), {key: "Enter"});
    expect(screen.getByRole("button", {name: /send|送出/i})).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("ComposerBar page context chip", () => {
  it("shows the attached page and lets the user drop it", () => {
    const onDismissPageContext = vi.fn();
    render(
      <ComposerBar
        {...baseProps}
        attachments={[]}
        pageContextLabel="資工一甲 / 期中考"
        onDismissPageContext={onDismissPageContext}
      />,
    );

    expect(screen.getByText("資工一甲 / 期中考")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "不附帶目前頁面" }));
    expect(onDismissPageContext).toHaveBeenCalledTimes(1);
  });

  it("keeps the full attached context available on hover when the chip is truncated", () => {
    const label = "資工一甲 / 期中考 / 3. 請回答下列關於刑事訴訟法強制處分之問題";
    render(
      <ComposerBar
        {...baseProps}
        attachments={[]}
        pageContextLabel={label}
        onDismissPageContext={vi.fn()}
      />,
    );

    expect(screen.getByText(label)).toHaveAttribute("title", label);
  });

  it("hides the chip when nothing is attached", () => {
    render(
      <ComposerBar
        {...baseProps}
        attachments={[]}
        pageContextLabel={null}
        onDismissPageContext={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "不附帶目前頁面" }),
    ).not.toBeInTheDocument();
  });
});
