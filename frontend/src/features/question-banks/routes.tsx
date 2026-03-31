import { Route } from "react-router-dom";
import QuestionBanksScreen from "./screens/QuestionBanksScreen";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";
import QuestionBankMarketplaceScreen from "./screens/QuestionBankMarketplaceScreen";

export const questionBankListRoute = (
  <>
    <Route path="/question-banks" element={<QuestionBanksScreen />} />
    <Route path="/marketplace" element={<QuestionBankMarketplaceScreen />} />
  </>
);

export const questionBankDetailRoute = (
  <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
);
