import { fireEvent, render, screen } from "@testing-library/react";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import CheatDetectionPanel from "./CheatDetectionPanel";
import { sanitizeAnticheatPolicy } from "./anticheatPolicyUtils";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

const createProps = (
  overrides?: Partial<ContestSettingsPanelProps>,
): ContestSettingsPanelProps => {
  const contest = createMockContest();
  return {
    t: stubT,
    tc: stubT,
    contest,
    form: {
      cheatDetectionEnabled: contest.cheatDetectionEnabled,
      anticheatDevicePolicy: contest.anticheatDevicePolicy,
    },
    getState: () => undefined,
    onRetry: () => {},
    onChange: vi.fn(),
    onConfirmedChange: vi.fn(),
    ...overrides,
  };
};

describe("CheatDetectionPanel", () => {
  it("renders the simplified policy sections", () => {
    render(<CheatDetectionPanel {...createProps()} />);

    expect(screen.getByText("Access Policy")).toBeInTheDocument();
    expect(screen.getByText("Evidence Policy")).toBeInTheDocument();
    expect(screen.queryByText("Penalty Policy")).not.toBeInTheDocument();
    expect(screen.queryByText("核心偵測器")).not.toBeInTheDocument();
    expect(screen.queryByText("監控來源")).not.toBeInTheDocument();
    expect(screen.queryByText("螢幕分享恢復時限")).not.toBeInTheDocument();
  });

  it("names each switch by its row title without repeating it beside the switch", () => {
    render(<CheatDetectionPanel {...createProps()} />);

    expect(screen.getByRole("switch", { name: "啟用螢幕分享" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "啟用 Webcam" })).toBeInTheDocument();
    expect(screen.getAllByText("啟用 Webcam")).toHaveLength(1);
    expect(screen.queryByRole("switch", { name: "allowMultipleJoins" })).not.toBeInTheDocument();
  });

  it("applies the webcam switch to desktop and tablet together", () => {
    const onChange = vi.fn();
    render(<CheatDetectionPanel {...createProps({ onChange })} />);

    fireEvent.click(screen.getByRole("switch", { name: "啟用 Webcam" }));

    expect(onChange).toHaveBeenCalledWith(
      "anticheatDevicePolicy",
      expect.objectContaining({
        desktop: expect.objectContaining({
          sources: expect.objectContaining({
            webcam: expect.objectContaining({ enabled: false }),
          }),
        }),
        tablet: expect.objectContaining({
          sources: expect.objectContaining({
            webcam: expect.objectContaining({ enabled: false }),
          }),
        }),
      }),
    );
  });

  it("explains that tablets cannot share their screen", () => {
    const contest = createMockContest();
    const policy = sanitizeAnticheatPolicy(contest.anticheatDevicePolicy);
    render(
      <CheatDetectionPanel
        {...createProps({
          form: {
            cheatDetectionEnabled: true,
            anticheatDevicePolicy: {
              ...policy,
              tablet: {
                ...policy.tablet,
                sources: { ...policy.tablet.sources, webcam: { enabled: false } },
              },
            },
          },
        })}
      />,
    );

    expect(screen.getByText("平板暫時無法使用螢幕分享")).toBeInTheDocument();
    expect(screen.getByText("平板考生目前沒有任何證據來源，建議開啟 Webcam。")).toBeInTheDocument();
  });

  it("shows the policy save state only in the section that was edited", () => {
    render(
      <CheatDetectionPanel
        {...createProps({
          getState: (field) =>
            field === "anticheatDevicePolicy" ? { status: "saving" } : undefined,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "啟用螢幕分享" }));

    expect(screen.getAllByText("儲存中...")).toHaveLength(1);
    const evidenceHeading = screen.getByRole("heading", { name: "Evidence Policy" });
    expect(evidenceHeading.closest("div")?.parentElement).toHaveTextContent("儲存中...");
  });
});
