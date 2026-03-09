import React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Search,
  Stack,
  SkeletonText,
  SkeletonPlaceholder,
  Grid,
  Column,
} from "@carbon/react";
import { Filter } from "@carbon/icons-react";
import InfiniteScroll from "react-infinite-scroll-component";
import { PageHeader } from "@/shared/layout/PageHeader";
import { ProblemFilterSection } from "./section/ProblemFilterSection";
import {
  ProblemFilterSidebarSection,
  type ProblemFilters,
} from "./section/ProblemFilterSidebarSection";
import {
  ProblemPreviewSection,
  ProblemPreviewSectionSkeleton,
} from "./section/ProblemPreviewSection";
import { LoadingIndicator } from "./section/LoadingIndicator";
import { useInfiniteProblemList, useProblemTags } from "@/features/problems/hooks";
import type { Problem } from "@/core/entities/problem.entity";
import "./screen.scss";
import { useNavigate } from "react-router-dom";

const ProblemListScreen: React.FC = () => {
  const { t } = useTranslation("problem");
  const { t: tc } = useTranslation("common");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [pageSize] = React.useState(20);
  const [filters, setFilters] = React.useState<ProblemFilters>({
    search: "",
    difficulties: [],
    tagSlugs: [],
    status: [],
  });
  const deferredSearch = React.useDeferredValue(filters.search);
  const deferredFilters = React.useMemo(
    () => ({ ...filters, search: deferredSearch }),
    [filters, deferredSearch]
  );
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteProblemList(deferredFilters, pageSize);

  const problems = React.useMemo(
    () => data?.pages.flatMap((page) => page.problems) || [],
    [data]
  );
  const totalCount = data?.pages[0]?.totalCount || 0;
  const { data: tags = [], isLoading: tagsLoading } = useProblemTags();
  const navigate = useNavigate();

  const activeFilterCount =
    filters.difficulties.length +
    filters.tagSlugs.length +
    filters.status.length;

  const sidebarSkeleton = (
    <Stack gap={4}>
      <SkeletonText heading width="60%" />
      <SkeletonPlaceholder style={{ height: "160px", width: "100%" }} />
      <SkeletonPlaceholder style={{ height: "160px", width: "100%" }} />
    </Stack>
  );

  const listSkeleton = (
    <Stack gap={5}>
      {Array.from({ length: 5 }).map((_, idx) => (
        <ProblemPreviewSectionSkeleton key={idx} />
      ))}
    </Stack>
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value }));
  };

  const handleFiltersChange = (next: ProblemFilters) => {
    setFilters(next);
  };

  const handleProblemSelect = (problem: Problem) => {
    navigate(`/problems/${problem.id}/solve`);
  };

  // 當篩選變更時，重置捲動位置
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [deferredFilters]);

  const listContent =
    problems.length > 0 ? (
      <InfiniteScroll
        dataLength={problems.length}
        next={fetchNextPage}
        hasMore={!!hasNextPage}
        loader={<LoadingIndicator />}
        endMessage={
          <div style={{ textAlign: "center", marginTop: "2rem", color: "gray" }}>
            <p>{t("list.totalLoaded", { count: totalCount })}</p>
          </div>
        }
        scrollThreshold={0.9}
      >
        <Stack gap={5}>
          {problems.map((problem: Problem) => (
            <ProblemPreviewSection
              key={problem.id}
              problem={problem}
              onSelect={handleProblemSelect}
            />
          ))}
        </Stack>
      </InfiniteScroll>
    ) : (
      <div className="problem-empty">
        <p className="problem-empty__title">
          {t("list.noResults")}
        </p>
        <p className="problem-empty__subtitle">
          {t("list.tryAdjustFilters")}
        </p>
      </div>
    );

  const statusSlot = isLoading ? listSkeleton : undefined;

  return (
    <div className="problem-list-page">
      <Grid fullWidth className="problem-list-page__grid">
        <Column lg={16} md={8} sm={4}>
          <div className="problem-list-page__header">
            <PageHeader
              title={t("list.title")}
              subtitle={t("list.subtitle")}
              action={
                <Button
                  kind="ghost"
                  size="md"
                  renderIcon={Filter}
                  className="problem-list-page__mobile-toggle"
                  onClick={() => setDrawerOpen(true)}
                >
                  {tc("filter.title")}
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Button>
              }
            />
          </div>
        </Column>

        <Column lg={12} md={8} sm={4}>
          <Stack gap={5}>
            <Search
              id="problem-search"
              labelText=""
              placeholder={t("list.searchPlaceholder")}
              size="lg"
              value={filters.search}
              onChange={handleSearchChange}
            />
            {statusSlot ?? listContent}
          </Stack>
        </Column>

        <Column lg={4} md={0} sm={0}>
          <div className="problem-list-page__sidebar">
            {isLoading ? (
              sidebarSkeleton
            ) : (
              <ProblemFilterSidebarSection
                filters={filters}
                onFiltersChange={handleFiltersChange}
                availableTags={tags}
                tagsLoading={tagsLoading}
              />
            )}
          </div>
        </Column>
      </Grid>

      <ProblemFilterSection
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onApply={() => setDrawerOpen(false)}
        availableTags={tags}
        tagsLoading={tagsLoading}
      />
    </div>
  );
};

export default ProblemListScreen;
