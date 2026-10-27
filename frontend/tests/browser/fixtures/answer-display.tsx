import { createRoot } from "react-dom/client";
import { Theme } from "@carbon/react";
import "@/i18n";
import "@/styles/globals.scss";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";

// Synthetic text only: never copy student submissions into regression fixtures.
const text =
  'a * b * c; *value*\n    cout << "< >";\n\na*=2; i++; j=i;\n' +
  '<span style="color:red">literal</span><script>alert(1)</script>\n' +
  "long_token_".repeat(30);

document.documentElement.dataset.carbonTheme = "white";
createRoot(document.getElementById("root")!).render(
  <Theme theme="white">
    <main style={{ margin: "24px", maxWidth: "720px" }}>
      <h1>Synthetic plain-text answer</h1>
      <AnswerDisplay
        questionType="essay"
        answerContent={{ text }}
        answerFormat="plain_text"
        options={[]}
        correctAnswer="**Reference stays bold**"
      />
    </main>
  </Theme>,
);
