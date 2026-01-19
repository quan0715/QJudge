import React, { useState } from "react";
import type { StoryModule, Story } from "@/shared/types/story.types";
import {
  SubmissionDataTable,
  type SubmissionDataTableProps,
  type FilterState,
} from "./SubmissionDataTable";
import {
  mockSubmissionList,
  mockSubmissionListLarge,
} from "@/features/storybook/mocks";

const meta = {
  title: "shared/ui/submission/SubmissionDataTable",
  component: SubmissionDataTable,
  category: "shared" as const,
  description:
    "繳交記錄資料表格，支援狀態篩選、時間範圍篩選、「只看我的」切換、分頁功能",
  defaultArgs: {
    submissions: mockSubmissionListLarge.slice(0, 10),
    loading: false,
    totalItems: 50,
    page: 1,
    pageSize: 10,
    showProblem: true,
    showUser: true,
    showScore: true,
    showMemory: true,
    showToolbar: true,
    showOnlyMineToggle: true,
  },
  argTypes: {
    showProblem: {
      control: "boolean" as const,
      label: "Show Problem",
      description: "是否顯示題目欄位",
    },
    showUser: {
      control: "boolean" as const,
      label: "Show User",
      description: "是否顯示用戶欄位",
    },
    showScore: {
      control: "boolean" as const,
      label: "Show Score",
      description: "是否顯示分數欄位",
    },
    showMemory: {
      control: "boolean" as const,
      label: "Show Memory",
      description: "是否顯示記憶體欄位",
    },
    showToolbar: {
      control: "boolean" as const,
      label: "Show Toolbar",
      description: "是否顯示工具列（篩選器）",
    },
    loading: {
      control: "boolean" as const,
      label: "Loading",
      description: "載入中狀態",
    },
  },
};

// Default filter state
const DEFAULT_FILTERS: FilterState = {
  status: "all",
  dateRange: "all",
  onlyMine: false,
};

// Interactive story component with filter popover
const InteractiveStory: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Filter submissions based on status
  const filteredSubmissions =
    filters.status === "all"
      ? mockSubmissionListLarge
      : mockSubmissionListLarge.filter((s) => s.status === filters.status);

  // Paginate
  const startIndex = (page - 1) * pageSize;
  const paginatedSubmissions = filteredSubmissions.slice(
    startIndex,
    startIndex + pageSize
  );

  const handleFilterApply = (newFilters: FilterState) => {
    console.log("Filters applied:", newFilters);
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handleFilterReset = () => {
    console.log("Filters reset");
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  return (
    <SubmissionDataTable
      submissions={paginatedSubmissions}
      totalItems={filteredSubmissions.length}
      page={page}
      pageSize={pageSize}
      showProblem
      showUser
      showScore
      showMemory
      showToolbar
      filters={filters}
      showOnlyMineToggle
      onRowClick={(id) => console.log("Row clicked:", id)}
      onPageChange={(newPage, newPageSize) => {
        setPage(newPage);
        setPageSize(newPageSize);
      }}
      onFilterApply={handleFilterApply}
      onFilterReset={handleFilterReset}
      onRefresh={() => console.log("Refresh clicked")}
    />
  );
};

const stories: Story<SubmissionDataTableProps>[] = [
  {
    name: "Playground",
    description: "互動式 Playground，點擊篩選圖標選擇篩選條件",
    render: () => <InteractiveStory />,
    code: `const [filters, setFilters] = useState({
  status: "all",
  dateRange: "all",
  onlyMine: false,
});

<SubmissionDataTable
  submissions={submissions}
  totalItems={100}
  page={page}
  pageSize={10}
  showToolbar
  filters={filters}
  onFilterApply={(newFilters) => setFilters(newFilters)}
  onFilterReset={() => setFilters(DEFAULT_FILTERS)}
  onRowClick={(id) => handleViewSubmission(id)}
  onPageChange={(newPage, newPageSize) => setPage(newPage)}
/>`,
  },
  {
    name: "All Statuses",
    description: "顯示各種狀態的提交記錄",
    render: () => (
      <SubmissionDataTable
        submissions={mockSubmissionList}
        showToolbar={false}
        onRowClick={(id) => console.log("Clicked:", id)}
      />
    ),
    code: `<SubmissionDataTable
  submissions={submissionsWithVariousStatuses}
  showToolbar={false}
  onRowClick={(id) => handleClick(id)}
/>`,
  },
  {
    name: "With Filter Popover",
    description: "點擊篩選圖標顯示篩選選項",
    render: () => (
      <SubmissionDataTable
        submissions={mockSubmissionListLarge.slice(0, 5)}
        totalItems={50}
        page={1}
        pageSize={5}
        showToolbar
        filters={DEFAULT_FILTERS}
        showOnlyMineToggle
        onRowClick={(id) => console.log("Clicked:", id)}
        onPageChange={(p, ps) => console.log("Page:", p, ps)}
        onFilterApply={(f) => console.log("Filter applied:", f)}
        onFilterReset={() => console.log("Filter reset")}
        onRefresh={() => console.log("Refresh")}
      />
    ),
    code: `<SubmissionDataTable
  submissions={submissions}
  totalItems={100}
  showToolbar
  filters={filters}
  onFilterApply={handleFilterApply}
  onFilterReset={handleFilterReset}
  onRefresh={handleRefresh}
/>`,
  },
  {
    name: "Minimal Columns",
    description: "只顯示基本欄位（狀態、語言、執行時間、提交時間）",
    render: () => (
      <SubmissionDataTable
        submissions={mockSubmissionListLarge.slice(0, 5)}
        showProblem={false}
        showUser={false}
        showScore={false}
        showMemory={false}
        showToolbar={false}
        onRowClick={(id) => console.log("Clicked:", id)}
      />
    ),
    code: `<SubmissionDataTable
  submissions={submissions}
  showProblem={false}
  showUser={false}
  showScore={false}
  showMemory={false}
  showToolbar={false}
/>`,
  },
  {
    name: "Loading State",
    description: "載入中狀態顯示骨架屏",
    render: () => (
      <SubmissionDataTable
        submissions={[]}
        loading={true}
        showToolbar={false}
      />
    ),
    code: `<SubmissionDataTable
  submissions={[]}
  loading={true}
/>`,
  },
  {
    name: "Empty State",
    description: "無資料時的空狀態（表格結構保持完整）",
    render: () => (
      <SubmissionDataTable
        submissions={[]}
        loading={false}
        showToolbar
        filters={DEFAULT_FILTERS}
        onFilterApply={(f) => console.log("Filter applied:", f)}
        onFilterReset={() => console.log("Filter reset")}
        emptyTitle="尚無繳交記錄"
        emptySubtitle="開始解題後，您的繳交記錄將會顯示在這裡"
      />
    ),
    code: `<SubmissionDataTable
  submissions={[]}
  showToolbar
  filters={filters}
  onFilterApply={handleFilterApply}
  emptyTitle="尚無繳交記錄"
  emptySubtitle="開始解題後，您的繳交記錄將會顯示在這裡"
/>`,
  },
  {
    name: "With Pagination",
    description: "包含分頁功能",
    render: () => (
      <SubmissionDataTable
        submissions={mockSubmissionListLarge.slice(0, 10)}
        totalItems={50}
        page={1}
        pageSize={10}
        pageSizes={[5, 10, 20]}
        showToolbar={false}
        onRowClick={(id) => console.log("Clicked:", id)}
        onPageChange={(page, pageSize) =>
          console.log("Page change:", page, pageSize)
        }
      />
    ),
    code: `<SubmissionDataTable
  submissions={submissions}
  totalItems={100}
  page={page}
  pageSize={10}
  pageSizes={[5, 10, 20]}
  onPageChange={(newPage, newPageSize) => {
    setPage(newPage);
    setPageSize(newPageSize);
  }}
/>`,
  },
];

const storyModule: StoryModule<SubmissionDataTableProps> = {
  meta,
  stories,
};

export default storyModule;
