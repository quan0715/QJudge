import { fireEvent, render, screen } from "@testing-library/react";
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
});
