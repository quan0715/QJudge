import type { ContestType } from "@/core/entities/contest.entity";
import { codingContestModule } from "@/features/contest/modules/coding.module";
import { paperExamContestModule } from "@/features/contest/modules/paperExam.module";
import type { ContestTypeModule } from "@/features/contest/modules/types";

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
