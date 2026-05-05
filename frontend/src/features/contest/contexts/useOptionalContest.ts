import { useContext } from "react";

import ContestContext from "./ContestContext";

export const useOptionalContest = () => useContext(ContestContext) ?? null;
