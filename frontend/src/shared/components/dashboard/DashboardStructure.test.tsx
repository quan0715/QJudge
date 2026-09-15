import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BlockHeader,
  DashboardBlock,
  DashboardPage,
  KPIBlock,
} from "./index";

describe("DashboardPage", () => {
  it("renders children inside main with aria-label", () => {
    render(<DashboardPage ariaLabel="page">x</DashboardPage>);
    expect(screen.getByRole("main", { name: "page" })).toHaveTextContent("x");
  });
});

describe("DashboardBlock", () => {
  it("renders as accessible section", () => {
    render(<DashboardBlock ariaLabel="block">body</DashboardBlock>);
    expect(screen.getByRole("region", { name: "block" })).toHaveTextContent(
      "body",
    );
  });
});

describe("BlockHeader", () => {
  it("renders title and description", () => {
    render(<BlockHeader title="Hello" description="desc" />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("desc")).toBeInTheDocument();
  });

  it("renders actions slot", () => {
    render(
      <BlockHeader title="t" actions={<button data-testid="a">A</button>} />,
    );
    expect(screen.getByTestId("a")).toBeInTheDocument();
  });

  it("uses h1 when titleSize=page", () => {
    render(<BlockHeader title="X" titleSize="page" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("uses h2 by default", () => {
    render(<BlockHeader title="X" />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("KPIBlock", () => {
  it("renders title and value", () => {
    render(<KPIBlock title="考生分佈總覽" value="126 人" />);
    expect(screen.getByText("考生分佈總覽")).toBeInTheDocument();
    expect(screen.getByText("126 人")).toBeInTheDocument();
  });

  it("renders visualization child", () => {
    render(
      <KPIBlock title="完成率" value="78%">
        <div data-testid="chart">chart</div>
      </KPIBlock>,
    );
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("derives aria-label from string title", () => {
    render(<KPIBlock title="違規事件" value={3} />);
    expect(
      screen.getByRole("region", { name: "違規事件" }),
    ).toBeInTheDocument();
  });

  it("respects explicit aria-label", () => {
    render(
      <KPIBlock title="x" value="y" ariaLabel="custom">
        body
      </KPIBlock>,
    );
    expect(screen.getByRole("region", { name: "custom" })).toBeInTheDocument();
  });
});
