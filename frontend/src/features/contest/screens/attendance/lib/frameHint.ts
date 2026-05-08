export type FrameHintStatus =
  | "idle"
  | "detecting"
  | "valid"
  | "validating"
  | "error"
  | "photoReady"
  | "photoUnavailable";

export type FrameHintTokens = {
  outline: string;
  glow: string;
  pulse: boolean;
  shake: boolean;
};

export function getFrameHint(status: FrameHintStatus): FrameHintTokens {
  switch (status) {
    case "detecting":
      return {
        outline: "var(--cds-support-warning)",
        glow: "color-mix(in srgb, var(--cds-support-warning) 40%, transparent)",
        pulse: true,
        shake: false,
      };
    case "valid":
    case "photoReady":
      return {
        outline: "var(--cds-support-success)",
        glow: "color-mix(in srgb, var(--cds-support-success) 40%, transparent)",
        pulse: false,
        shake: false,
      };
    case "validating":
      return {
        outline: "var(--cds-support-info)",
        glow: "color-mix(in srgb, var(--cds-support-info) 40%, transparent)",
        pulse: true,
        shake: false,
      };
    case "error":
    case "photoUnavailable":
      return {
        outline: "var(--cds-support-error)",
        glow: "color-mix(in srgb, var(--cds-support-error) 40%, transparent)",
        pulse: false,
        shake: status === "error",
      };
    case "idle":
    default:
      return {
        outline: "var(--cds-border-strong-01)",
        glow: "transparent",
        pulse: false,
        shake: false,
      };
  }
}
