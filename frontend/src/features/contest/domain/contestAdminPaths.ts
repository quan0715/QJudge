import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";

export const getContestSettingsBackPath = (contestId: string, classroomId?: string | null) =>
  classroomId ? getClassroomContestDashboardPath(classroomId, contestId) : "/dashboard";
