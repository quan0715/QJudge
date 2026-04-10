import { Route } from "react-router-dom";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";
import QuestionBankMarketplaceScreen from "./screens/QuestionBankMarketplaceScreen";

export const questionBankMarketplaceRoute = (
  <Route path="/marketplace" element={<QuestionBankMarketplaceScreen />} />
);

export const questionBankDetailRoute = (
  <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
);
