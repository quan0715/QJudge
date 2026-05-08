type HapticPattern = "scan-success" | "shutter" | "submit-success" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  "scan-success": 40,
  "shutter": 20,
  "submit-success": [60, 40, 60],
  "error": [100, 50, 100],
};

export function useHaptics() {
  return (pattern: HapticPattern) => {
    if (typeof navigator === "undefined") return;
    navigator.vibrate?.(PATTERNS[pattern]);
  };
}
