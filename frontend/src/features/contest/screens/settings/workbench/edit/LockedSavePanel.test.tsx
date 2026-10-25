import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LockedSavePanel } from "./LockedSavePanel";
it("saves subjective changes with mark_pending", () => {
  const onSave = vi.fn();
  render(
    <LockedSavePanel
      impact={{ kind: "subjective-review", affectedCount: 2 }}
      saving={false}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "標記為待批改" }));
  fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
  expect(onSave).toHaveBeenCalledWith("mark_pending");
});
