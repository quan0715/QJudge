import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { ModelSelect } from "./ModelSelect";

describe("ModelSelect", () => {
  it("uses a neutral disabled placeholder when no models are available", () => {
    render(
      <ModelSelect models={[]} selectedModelId={null} onChange={vi.fn()} />,
    );

    const trigger = screen.getByRole("combobox", { name: /model|模型/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent(
      /modelUnavailable|unavailable|無可用模型/i,
    );
    expect(trigger).not.toHaveTextContent("gpt-5-nano");
  });
  it("selects with the keyboard and closes with Escape while retaining focus", () => {
    const onChange = vi.fn();
    render(<ModelSelect models={[{id: "a", label: "Alpha"}, {id: "b", label: "Beta"}]} selectedModelId="a" onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: /模型/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(trigger, { key: "End" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });
