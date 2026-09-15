import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ListItem, ListItemTitle } from "./ListPanel";

describe("ListItem", () => {

  it("keeps the row action separate from the row selection button", () => {
    const onSelect = vi.fn();
    const onFlag = vi.fn();

    render(
      <ListItem
        onClick={onSelect}
        secondaryAction={
          <button type="button" aria-label="標記" onClick={onFlag}>
            Flag
          </button>
        }
      >
        <ListItemTitle>Q1</ListItemTitle>
      </ListItem>,
    );

    const selectButton = screen.getByRole("button", { name: "Q1" });
    const flagButton = screen.getByRole("button", { name: "標記" });

    expect(selectButton.contains(flagButton)).toBe(false);

    fireEvent.click(flagButton);
    expect(onFlag).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(selectButton);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
