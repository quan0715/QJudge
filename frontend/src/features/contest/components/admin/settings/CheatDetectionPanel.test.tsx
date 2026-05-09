import { fireEvent, render, screen } from "@testing-library/react";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import CheatDetectionPanel from "./CheatDetectionPanel";
import type { ContestSettingsPanelProps } from "./ContestSettingsPanelProps";

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
      warningTimeoutSeconds: contest.warningTimeoutSeconds,
      screenShareRecoveryGraceMs: contest.screenShareRecoveryGraceMs,
      maxCheatWarnings: contest.maxCheatWarnings,
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

  it("writes evidence toggles back to the legacy anticheat device policy", () => {
    const onChange = vi.fn();
    render(<CheatDetectionPanel {...createProps({ onChange })} />);

    fireEvent.click(screen.getByRole("switch", { name: "啟用證據追蹤" }));

    expect(onChange).toHaveBeenCalledWith(
      "anticheatDevicePolicy",
      expect.objectContaining({
        desktop: expect.objectContaining({
          sources: expect.objectContaining({
            screenShare: expect.objectContaining({ enabled: false }),
            webcam: expect.objectContaining({ enabled: false }),
          }),
        }),
        tablet: expect.objectContaining({
          sources: expect.objectContaining({
            screenShare: expect.objectContaining({ enabled: false }),
            webcam: expect.objectContaining({ enabled: false }),
          }),
        }),
      }),
    );
  });
});
