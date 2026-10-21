import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import LanguageConfigSection from "./LanguageConfigSection";

vi.mock("@monaco-editor/react", () => ({ default: () => null }));
vi.mock("@/features/problems/contexts/ProblemEditContext", () => ({
  useProblemEdit: () => ({ handleFieldChange: vi.fn() }),
}));

let form: UseFormReturn<ProblemFormSchema>;

function Harness({ configs }: { configs: ProblemFormSchema["languageConfigs"] }) {
  form = useForm<ProblemFormSchema>({
    defaultValues: { languageConfigs: configs, forbiddenKeywords: [], requiredKeywords: [] } as unknown as ProblemFormSchema,
  });
  return (
    <FormProvider {...form}>
      <LanguageConfigSection />
    </FormProvider>
  );
}

describe("LanguageConfigSection", () => {
  it("does not add a language entry for a language the question has no config for", () => {
    render(<Harness configs={[{ language: "python", isEnabled: true, templateCode: "" }]} />);

    expect(screen.getAllByText("C++").length).toBeGreaterThan(0);
    expect(form.getValues("languageConfigs")).toEqual([{ language: "python", isEnabled: true, templateCode: "" }]);
  });

  it("adds one complete entry when a missing language is turned on", () => {
    render(<Harness configs={[{ language: "python", isEnabled: true, templateCode: "" }]} />);

    fireEvent.click(document.getElementById("lang-toggle-cpp")!);

    const configs = form.getValues("languageConfigs");
    expect(configs).toHaveLength(2);
    expect(configs[1]).toMatchObject({ language: "cpp", isEnabled: true });
  });
});
