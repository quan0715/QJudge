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

    expect(screen.getByRole("alert")).toHaveTextContent("Upload offline");
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
