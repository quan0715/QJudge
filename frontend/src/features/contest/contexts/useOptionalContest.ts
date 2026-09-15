import { useContext } from "react";

import ContestContext from "./ContestValueContext";

export const useOptionalContest = () => useContext(ContestContext) ?? null;
