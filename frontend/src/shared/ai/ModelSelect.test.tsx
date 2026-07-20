import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModelSelect } from "./ModelSelect";

describe("ModelSelect", () => {
  it("uses a neutral disabled placeholder when no models are available", () => {
    render(
      <ModelSelect models={[]} selectedModelId={null} onChange={vi.fn()} />,
    );

    const trigger = screen.getByRole("button", { name: /model|模型/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent(
      /modelUnavailable|unavailable|無可用模型/i,
    );
    expect(trigger).not.toHaveTextContent("gpt-5-nano");
  });
});
