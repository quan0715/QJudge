import {
  createProblem,
  getProblems,
} from "@/infrastructure/api/repositories/problem.repository";
import type { ProblemUpsertPayload } from "@/core/entities/problem.entity";

const buildProblemPayload = (title: string): ProblemUpsertPayload => ({
  title,
  difficulty: "easy",
  time_limit: 1000,
  memory_limit: 128,
  translations: [
    {
      language: "en",
      title,
      description: "Given two integers a and b, output a + b.",
      input_description: "Two integers a and b",
      output_description: "The sum of a and b",
      hint: "",
    },
  ],
  test_cases: [
    {
      input_data: "1 2\n",
      output_data: "3\n",
      is_sample: true,
      score: 100,
    },
  ],
  language_configs: [
    {
      language: "cpp",
      template_code: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  return 0;\n}\n",
      is_enabled: true,
      order: 0,
    },
  ],
  forbidden_keywords: [],
  required_keywords: [],
});

export const ensureProblemExists = async (
  preferredTitle: string
): Promise<{ id: string; title: string }> => {
  const existing = await getProblems();
  const preferred = existing.find((problem) => problem.title === preferredTitle);
  if (preferred) {
    return { id: preferred.id, title: preferred.title };
  }
  if (existing.length > 0) {
    return { id: existing[0].id, title: existing[0].title };
  }

  const title = `${preferredTitle} (${Date.now()})`;
  const created = await createProblem(buildProblemPayload(title));
  return { id: created.id, title: created.title };
};
