import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import BasicInfoSection from "./BasicInfoSection";
const save = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth", () => ({useAuth: () => ({user: {role: "teacher"}})}));
vi.mock("./ContentSection", () => ({HintField: () => null}));
vi.mock("@/features/problems/components/edit/common", () => ({
  AutoSaveField: ({name, children}: {name: string; children: (props: object) => ReactNode}) => children({
    field: {value: name === "title" ? "Original" : name === "difficulty" ? "easy" : 128, onChange: vi.fn(), onBlur: vi.fn()},
    onAutoSaveChange: (value: unknown) => save(name, value), onAutoSaveBlur: vi.fn(), invalid: false,
  }),
}));
it("names problem controls and preserves their editing callbacks", () => {
  render(<BasicInfoSection showTags={false} />);
  const title = screen.getByRole("textbox", {name: "題目標題"});
  expect(title).toHaveAccessibleDescription("顯示於題目列表與題目頁面的標題");
  fireEvent.change(title, {target:{value:"New title"}});
  expect(save).toHaveBeenCalledWith("title", "New title");
  const difficulty = screen.getByRole("combobox", {name:"難度"});
  expect(difficulty).toHaveAccessibleDescription("顯示於題庫與競賽列表中");
  fireEvent.change(difficulty, {target:{value:"hard"}});
  expect(save).toHaveBeenCalledWith("difficulty", "hard");
});
