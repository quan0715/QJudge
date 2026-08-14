import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MetricBlock,
  PageTitle,
  SectionTitle,
  TimeDisplay,
} from "./index";

describe("PageTitle", () => {
  it("defaults to h1", () => {
    render(<PageTitle>Hello</PageTitle>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
  });

  it("respects as prop", () => {
    render(<PageTitle as="h2">Hello</PageTitle>);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("SectionTitle", () => {
  it("defaults to h2", () => {
    render(<SectionTitle>Section</SectionTitle>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Section");
  });

  it("respects as prop", () => {
    render(<SectionTitle as="h3">S</SectionTitle>);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });
});

describe("MetricBlock", () => {
  it("renders label and value", () => {
    render(<MetricBlock label="參賽人數" value={42} />);
    expect(screen.getByText("參賽人數")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders trailing slot", () => {
    render(
      <MetricBlock
        label="x"
        value="y"
        trailing={<span data-testid="trail">T</span>}
      />,
    );
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });
});

describe("TimeDisplay", () => {
  it("renders value", () => {
    render(<TimeDisplay value="01:23:45" />);
    expect(screen.getByText("01:23:45")).toBeInTheDocument();
  });

  it("renders optional label", () => {
    render(<TimeDisplay value="01:23:45" label="剩餘時間" />);
    expect(screen.getByText("剩餘時間")).toBeInTheDocument();
  });
});
