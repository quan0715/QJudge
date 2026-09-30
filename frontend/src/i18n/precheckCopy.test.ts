import { describe, expect, it } from "vitest";
import en from "./locales/en/contest.json";
import ja from "./locales/ja/contest.json";
import ko from "./locales/ko/contest.json";
import zhTW from "./locales/zh-TW/contest.json";

// What students read before an exam says what to do, never how a check works.
const DETECTION_DETAILS = /llvmpipe|webgl|\bgpu\b|software render|軟體繪圖|顯示卡|ソフトウェア.?レンダ|소프트웨어 렌더/i;

// Key names may mention the mechanism; only the text students read matters.
const textOf = (node: unknown): string[] =>
  typeof node === "string"
    ? [node]
    : node && typeof node === "object"
      ? Object.values(node).flatMap(textOf)
      : [];

describe("pre-check copy", () => {
  it.each([
    ["en", en],
    ["ja", ja],
    ["ko", ko],
    ["zh-TW", zhTW],
  ])("does not explain how the environment is detected (%s)", (_language, locale) => {
    expect(textOf(locale.precheck).filter((text) => DETECTION_DETAILS.test(text))).toEqual([]);
  });
});
