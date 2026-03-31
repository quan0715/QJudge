import { useEffect, useState } from "react";
import { getClassroom } from "@/infrastructure/api/repositories/classroom.repository";

/**
 * Lightweight hook to fetch only the classroom name by ID.
 * Returns empty string while loading or on error.
 */
export function useClassroomName(classroomId: string | undefined): string {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!classroomId) {
      setName("");
      return;
    }

    let cancelled = false;
    void getClassroom(classroomId).then((data) => {
      if (!cancelled && data) setName(data.name);
    });

    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  return name;
}
