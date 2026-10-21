import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import LanguageConfigSection from "./LanguageConfigSection";

vi.mock("@monaco-editor/react", () => ({ default: () => null }));
vi.mock("@/features/problems/contexts/ProblemEditContext", () => ({
  useProblemEdit: () => ({ handleFieldChange: vi.fn() }),
}));

type Form = UseFormReturn<ProblemFormSchema>;

function Harness({ configs, onForm }: { configs: ProblemFormSchema["languageConfigs"]; onForm: (form: Form) => void }) {
  const form = useForm<ProblemFormSchema>({
    defaultValues: { languageConfigs: configs, forbiddenKeywords: [], requiredKeywords: [] } as unknown as ProblemFormSchema,
  });
  onForm(form);
  return (
    <FormProvider {...form}>
      <LanguageConfigSection />
    </FormProvider>
  );
}

describe("LanguageConfigSection", () => {
  it("does not add a language entry for a language the question has no config for", () => {
    let form!: Form;
    render(<Harness configs={[{ language: "python", isEnabled: true, templateCode: "" }]} onForm={(f) => { form = f; }} />);

    expect(screen.getAllByText("C++").length).toBeGreaterThan(0);
    expect(form.getValues("languageConfigs")).toEqual([{ language: "python", isEnabled: true, templateCode: "" }]);
  });

  it("adds one complete entry when a missing language is turned on", () => {
    let form!: Form;
    render(<Harness configs={[{ language: "python", isEnabled: true, templateCode: "" }]} onForm={(f) => { form = f; }} />);

    fireEvent.click(document.getElementById("lang-toggle-cpp")!);

    const configs = form.getValues("languageConfigs");
    expect(configs).toHaveLength(2);
    expect(configs[1]).toMatchObject({ language: "cpp", isEnabled: true });
  });
});
