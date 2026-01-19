import { useQuery } from "@tanstack/react-query";
import { getTags } from "@/infrastructure/api/repositories/problem.repository";
import type { Tag } from "@/core/entities/problem.entity";

export const useProblemTags = () => {
  return useQuery<Tag[]>({
    queryKey: ["problem-tags"],
    queryFn: async () => {
      const tags = await getTags();
      return Array.isArray(tags) ? (tags as Tag[]) : [];
    },
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
  });
};

export default useProblemTags;
