import { Route } from "react-router-dom";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";
import QuestionBankMarketplaceScreen from "./screens/QuestionBankMarketplaceScreen";
import MarketplaceBankPreviewScreen from "./screens/MarketplaceBankPreviewScreen";

export const questionBankMarketplaceRoute = (
  <>
    <Route path="/marketplace" element={<QuestionBankMarketplaceScreen />} />
    <Route path="/marketplace/:bankId" element={<MarketplaceBankPreviewScreen />} />
  </>
);

export const questionBankDetailRoute = (
  <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
);
