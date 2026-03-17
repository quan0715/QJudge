import { Route } from "react-router-dom";
import QuestionBanksScreen from "./screens/QuestionBanksScreen";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";

export const questionBankRoutes = (
  <>
    <Route path="/question-banks" element={<QuestionBanksScreen />} />
    <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
  </>
);
