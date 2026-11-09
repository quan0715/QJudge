import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Avatar } from "./Avatar";

it("prefers the actual avatar, uses an identicon on image errors, and recovers on a new URL", () => {
  const view = render(<Avatar identity={12} name="Student" url="/first.png" />);
  expect(screen.getByRole("img", {name:"Student"})).toHaveAttribute("src", "/first.png");
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img", {name:"Student"}).tagName).toBe("svg");
  view.rerender(<Avatar identity={12} name="Student" url="/second.png" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/second.png");
  view.rerender(<Avatar identity={12} name="Student" url="" />);
  expect(screen.getByRole("img", {name:"Student"}).tagName).toBe("svg");
});

it("keeps a user's identicon stable across renames and distinguishes users with the same initial", () => {
  const view = render(<Avatar identity={12} name="Student" />);
  const drawing = () => screen.getByRole("img").innerHTML;
  const original = drawing();
  view.rerender(<Avatar identity={12} name="Renamed student" />);
  expect(drawing()).toBe(original);
  expect(screen.getByRole("img", {name:"Renamed student"})).toBeInTheDocument();
  view.rerender(<Avatar identity={13} name="Student" />);
  expect(drawing()).not.toBe(original);
  view.rerender(<Avatar identity="12" name="Student" />);
  expect(drawing()).toBe(original);
});

it("draws a nonempty symmetric identicon even without an avatar, name or identity", () => {
  render(<Avatar />);
  const avatar = screen.getByRole("img", {name:"avatar"});
  const cells = Array.from(avatar.querySelectorAll("rect"));
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    const mirroredX = 32 - Number(cell.getAttribute("x")) - Number(cell.getAttribute("width"));
    expect(cells.some(other => Number(other.getAttribute("x")) === mirroredX && other.getAttribute("y") === cell.getAttribute("y"))).toBe(true);
  }
});
