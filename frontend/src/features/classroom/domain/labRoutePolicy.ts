export interface ClassroomLabRouteContext {
  classroomId?: string;
  labId?: string;
}

export const isClassroomLabRouteContext = (
  value: ClassroomLabRouteContext,
): value is { classroomId: string; labId: string } =>
  Boolean(value.classroomId && value.labId);

export const getClassroomLabDashboardPath = (
  classroomId: string,
  labId: string,
): string => `/classrooms/${classroomId}/labs/${labId}`;

export const getClassroomLabSolveRootPath = (
  classroomId: string,
  labId: string,
): string => `/classrooms/${classroomId}/labs/${labId}/solve`;

export const getClassroomLabSolvePath = (
  classroomId: string,
  labId: string,
  problemId: string,
): string => `/classrooms/${classroomId}/labs/${labId}/solve/${problemId}`;
