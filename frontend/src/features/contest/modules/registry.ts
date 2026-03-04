import type { ContestType } from "@/core/entities/contest.entity";
import { codingContestModule } from "./CodingModule";
import { paperExamContestModule } from "./PaperExamModule";
import type { ContestTypeModule } from "./types";

const MODULE_MAP: Record<ContestType, ContestTypeModule> = {
  coding: codingContestModule,
  paper_exam: paperExamContestModule,
};

export const getContestTypeModule = (
  contestType?: ContestType | null,
): ContestTypeModule => {
  if (!contestType) return codingContestModule;
  return MODULE_MAP[contestType] ?? codingContestModule;
};
