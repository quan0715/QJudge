import { describe, expect, it } from "vitest";
import { mapBankQuestionDto } from "@/infrastructure/mappers/questionBank.mapper";
import { bankQuestionToForm, bankQuestionFormPayload } from "./codingQuestionForm";

describe("bank coding editor persistence", () => {
  it("round trips canonical content, hidden samples, weights and disabled language templates", () => {
    const question = mapBankQuestionDto({
      id: "asset", bank_item_id: "membership", question_type: "coding", title: "Original",
      time_limit: 2000, memory_limit: 256,
      coding_ext: {
        description: "Keep description", input_description: "Input", output_description: "Output", hint: "Hint",
        test_cases: [{ input_data: "1", output_data: "2", is_sample: false, is_hidden: true, weight_percent: 100 }],
        language_configs: [{ language: "python", template_code: "print(1)", is_enabled: false }],
        forbidden_keywords: ["eval"], required_keywords: ["print"],
      },
    });
    const form = bankQuestionToForm(question);
    expect(form.translationZh.description).toBe("Keep description");
    form.title = "Renamed";
    const payload = bankQuestionFormPayload(form);
    expect(payload.title).toBe("Renamed");
    expect(payload.coding_ext.description).toBe("Keep description");
    expect(payload.coding_ext.test_cases[0]).toMatchObject({ input_data: "1", output_data: "2", is_hidden: true, weight_percent: 100 });
    expect(payload.coding_ext.language_configs[0]).toMatchObject({ is_enabled: false, template_code: "print(1)" });
    expect(payload.coding_ext.forbidden_keywords).toEqual(["eval"]);
    expect(payload).not.toHaveProperty("score");
    expect(payload).not.toHaveProperty("order");
  });
});
