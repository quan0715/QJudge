import { fireEvent, render, screen } from "@testing-library/react";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import CheatDetectionPanel from "./CheatDetectionPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

const createProps = (
  form: Record<string, unknown>,
  overrides?: Partial<ContestSettingsPanelProps>,
): ContestSettingsPanelProps => ({
  t: stubT,
  tc: stubT,
  contest: createMockContest(),
  form,
  getState: () => undefined,
  onRetry: () => {},
  onChange: vi.fn(),
  onConfirmedChange: vi.fn(),
  ...overrides,
});

describe("CheatDetectionPanel", () => {
  it("saves webcamRequired when the webcam switch changes", () => {
    const onChange = vi.fn();
    render(
      <CheatDetectionPanel
        {...createProps({ cheatDetectionEnabled: true, webcamRequired: false }, { onChange })}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "要求 Webcam" }));

    expect(onChange).toHaveBeenCalledWith("webcamRequired", true);
  });

  it("locks the webcam switch while strict mode is off", () => {
    render(<CheatDetectionPanel {...createProps({ cheatDetectionEnabled: false, webcamRequired: true })} />);

    expect(screen.getByRole("switch", { name: "要求 Webcam" })).toBeDisabled();
  });

  it("confirms before turning strict mode on", () => {
    const onConfirmedChange = vi.fn();
    render(
      <CheatDetectionPanel
        {...createProps({ cheatDetectionEnabled: false, webcamRequired: false }, { onConfirmedChange })}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "enableExamMode" }));

    expect(onConfirmedChange).toHaveBeenCalledWith(
      "cheatDetectionEnabled",
      true,
      "啟用後考生須使用可分享螢幕的電腦作答，確定啟用？",
    );
  });
});
