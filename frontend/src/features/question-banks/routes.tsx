import { Route } from "react-router-dom";
import QuestionBanksScreen from "./screens/QuestionBanksScreen";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";

export const questionBankListRoute = (
  <>
    <Route path="/question-banks" element={<QuestionBanksScreen />} />
  </>
);

export const questionBankDetailRoute = (
  <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
);
