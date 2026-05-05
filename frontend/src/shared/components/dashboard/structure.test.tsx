import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  DashboardPage,
  KPIBlock,
} from "./index";

describe("DashboardPage", () => {
  it("renders children inside main with aria-label", () => {
    render(<DashboardPage ariaLabel="page">x</DashboardPage>);
    expect(screen.getByRole("main", { name: "page" })).toHaveTextContent("x");
  });
});

describe("DashboardContainer", () => {
  it("renders children for stack layout", () => {
    render(
      <DashboardContainer layout="stack">
        <div>a</div>
        <div>b</div>
      </DashboardContainer>,
    );
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("renders children for split layout", () => {
    render(
      <DashboardContainer layout="split" dividers="auto" bordered>
        <div>l</div>
        <div>r</div>
      </DashboardContainer>,
    );
    expect(screen.getByText("l")).toBeInTheDocument();
    expect(screen.getByText("r")).toBeInTheDocument();
  });

  it("renders children for grid layout with columns", () => {
    render(
      <DashboardContainer layout="grid" columns={3} dividers="auto">
        <div>1</div>
        <div>2</div>
        <div>3</div>
      </DashboardContainer>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
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
