import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Avatar } from "./Avatar";

it("uses the supplied avatar and falls back on image errors, recovering when the URL changes", () => {
  const view = render(<Avatar name="Student" url="/first.png" />);
  expect(screen.getByRole("img", {name:"Student"})).toHaveAttribute("src", "/first.png");
  fireEvent.error(screen.getByRole("img"));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("S")).toBeInTheDocument();
  view.rerender(<Avatar name="Student" url="/second.png" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/second.png");
  view.rerender(<Avatar name="Student" url="" />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("S")).toBeInTheDocument();
});
