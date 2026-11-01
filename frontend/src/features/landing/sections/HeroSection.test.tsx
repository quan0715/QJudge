import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HeroSection from "./HeroSection";

afterEach(cleanup);

describe("hero photo slideshow", () => {
  it("keeps both decorative photos without exposing playback controls", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const { container } = render(<HeroSection
      content={{ eyebrow: "QJudge", title: "Online exams", subtitle: "Assessment", trust: [], primaryCta: "Get started", secondaryCta: "Book a demo" }}
      onPrimary={onPrimary}
      onSecondary={onSecondary}
    />);
    const photos = container.querySelectorAll("img");
    expect(photos).toHaveLength(2);
    photos.forEach((photo) => expect(photo).toHaveAttribute("aria-hidden", "true"));
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Get started", "Book a demo"]);
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    fireEvent.click(screen.getByRole("button", { name: "Book a demo" }));
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(onSecondary).toHaveBeenCalledOnce();
  });
});
