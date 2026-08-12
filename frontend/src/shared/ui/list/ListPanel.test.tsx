import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ListItem, ListItemTitle } from "./ListPanel";

describe("ListItem", () => {
  it("uses a selected surface without shifting content behind a left border", () => {
    const stylesheet = readFileSync(
      resolve(process.cwd(), "src/shared/ui/list/ListPanel.module.scss"),
      "utf8",
    );

    const activeRule = stylesheet.match(/\.itemActive\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(activeRule).not.toContain("border-left");
    expect(activeRule).not.toContain("padding-left");
  });

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
