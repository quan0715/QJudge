export const getClassroomBackPath = (classroomId?: string | null) =>
  classroomId ? `/classrooms/${classroomId}` : "/dashboard";

export const getContestSettingsBackPath = (
  _contestId: string,
  classroomId?: string | null,
) => getClassroomBackPath(classroomId);
