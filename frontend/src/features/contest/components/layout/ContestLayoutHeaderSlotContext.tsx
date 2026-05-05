import { createContext, useContext } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

type ContestLayoutHeaderSlot = ReactNode | null;

interface ContestLayoutHeaderSlotContextValue {
  setHeaderActions: Dispatch<SetStateAction<ContestLayoutHeaderSlot>>;
}

export const ContestLayoutHeaderSlotContext =
  createContext<ContestLayoutHeaderSlotContextValue | null>(null);

export function useContestLayoutHeaderSlot() {
  return useContext(ContestLayoutHeaderSlotContext);
}
