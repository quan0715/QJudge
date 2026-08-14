import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageEditDialog } from "./ImageEditDialog";

describe("ImageEditDialog", () => {
  it("opens the Carbon modal without an application-managed portal", () => {
    render(
      <ImageEditDialog
        alt="Avatar"
        variant="avatar"
        emptyLabel="No image"
        modalHeading="Edit image"
        urlPlaceholder="https://example.com/image.png"
        uploadLabel="Upload"
        removeLabel="Remove"
        applyLabel="Apply"
        dropzoneLabel="Choose image"
        dropzoneHint="PNG or JPEG"
        onUpload={vi.fn()}
        onApplyUrl={vi.fn()}
        triggerDataTestId="image-trigger"
      />,
    );

    fireEvent.click(screen.getByTestId("image-trigger"));

    expect(screen.getByTestId("image-edit-dialog")).toBeInTheDocument();
    expect(screen.getByText("Edit image")).toBeInTheDocument();
  });

  it("rejects non-HTTP image URLs before applying them", () => {
    const onApplyUrl = vi.fn();
    render(
      <ImageEditDialog
        alt="Cover"
        emptyLabel="No image"
        modalHeading="Edit image"
        urlPlaceholder="https://example.com/image.png"
        uploadLabel="Upload"
        removeLabel="Remove"
        applyLabel="Apply"
        dropzoneLabel="Choose image"
        dropzoneHint="PNG or JPEG"
        onUpload={vi.fn()}
        onApplyUrl={onApplyUrl}
        triggerDataTestId="image-trigger"
      />,
    );

    fireEvent.click(screen.getByTestId("image-trigger"));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "javascript:alert(document.domain)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyUrl).not.toHaveBeenCalled();
    expect(screen.getByTestId("image-edit-dialog")).toBeInTheDocument();
  });

  it("normalizes an HTTP image URL before applying it", async () => {
    const onApplyUrl = vi.fn();
    render(
      <ImageEditDialog
        alt="Cover"
        emptyLabel="No image"
        modalHeading="Edit image"
        urlPlaceholder="https://example.com/image.png"
        uploadLabel="Upload"
        removeLabel="Remove"
        applyLabel="Apply"
        dropzoneLabel="Choose image"
        dropzoneHint="PNG or JPEG"
        onUpload={vi.fn()}
        onApplyUrl={onApplyUrl}
        triggerDataTestId="image-trigger"
      />,
    );

    fireEvent.click(screen.getByTestId("image-trigger"));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/cover image.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyUrl).toHaveBeenCalledOnce();
    expect(onApplyUrl).toHaveBeenCalledWith(
      "https://example.com/cover%20image.png",
    );
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toHaveValue("");
    });
  });
});
