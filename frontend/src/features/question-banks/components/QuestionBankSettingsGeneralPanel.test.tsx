import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import { QuestionBankSettingsGeneralPanel } from "./QuestionBankSettingsGeneralPanel";
import { update } from "@/infrastructure/api/repositories/questionBank.repository";
vi.mock("@/infrastructure/api/repositories/questionBank.repository", () => ({ update: vi.fn().mockResolvedValue({}), uploadCover: vi.fn() }));
vi.mock("@/shared/contexts/ToastContext", () => {
  const showToast = vi.fn();
  return { useToast: () => ({showToast}) };
});
vi.mock("react-i18next", () => {
  const t = (key: string, fallback?: string) => fallback ?? key;
  return { useTranslation: () => ({t}) };
});
vi.mock("@/shared/ui/image", () => ({ ImageEditDialog: () => null }));
it("exposes named and described fields and saves edits", async () => {
  render(<QuestionBankSettingsGeneralPanel bank={{id:"bank",name:"Original",description:"Notes"} as QuestionBank} onRefresh={vi.fn().mockResolvedValue(undefined)} />);
  const name = screen.getByRole("textbox", {name:"題庫名稱"});
  expect(name).toHaveAccessibleDescription("顯示在題庫列表和頁首的名稱");
  expect(screen.getByRole("textbox", {name:"題庫描述"})).toHaveAccessibleDescription("簡短描述，出現在題庫概覽頁面");
  fireEvent.change(name, {target:{value:"Updated"}});
  await waitFor(() => expect(update).toHaveBeenCalledWith("bank", expect.objectContaining({name:"Updated"})), {timeout:2000});
});
