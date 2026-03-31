import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  SubmissionDataTable,
  type FilterState,
} from "./SubmissionDataTable";
import {
  mockSubmissionList,
  mockSubmissionListLarge,
} from "@/shared/mocks";

const meta: Meta<typeof SubmissionDataTable> = {
  title: "shared/ui/submission/SubmissionDataTable",
  component: SubmissionDataTable,
  
  args: {
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
            description: "是否顯示題目欄位",
    },
    showUser: {
      control: "boolean" as const,
            description: "是否顯示用戶欄位",
    },
    showScore: {
      control: "boolean" as const,
            description: "是否顯示分數欄位",
    },
    showMemory: {
      control: "boolean" as const,
            description: "是否顯示記憶體欄位",
    },
    showToolbar: {
      control: "boolean" as const,
            description: "是否顯示工具列（篩選器）",
    },
    loading: {
      control: "boolean" as const,
            description: "載入中狀態",
    },
  },

  parameters: {
    docs: { description: { component: '繳交記錄資料表格，支援狀態篩選、時間範圍篩選、「只看我的」切換、分頁功能' } },
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
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => <InteractiveStory />,
};

export const AllStatuses: Story = {
  render: () => (
    <SubmissionDataTable
      submissions={mockSubmissionList}
      showToolbar={false}
      onRowClick={(id) => console.log("Clicked:", id)}
    />
  ),
};

export const WithFilterPopover: Story = {
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
      onFilterApply={(f) => console.log("Filter:", f)}
      onFilterReset={() => console.log("Reset")}
      onRefresh={() => console.log("Refresh")}
    />
  ),
};

export const LoadingState: Story = {
  render: () => <SubmissionDataTable submissions={[]} loading={true} showToolbar={false} />,
};

export const EmptyState: Story = {
  render: () => (
    <SubmissionDataTable
      submissions={[]}
      loading={false}
      showToolbar
      filters={DEFAULT_FILTERS}
      onFilterApply={(f) => console.log("Filter:", f)}
      onFilterReset={() => console.log("Reset")}
      emptyTitle="\u5c1a\u7121\u7e73\u4ea4\u8a18\u9304"
      emptySubtitle="\u958b\u59cb\u89e3\u984c\u5f8c\uff0c\u60a8\u7684\u7e73\u4ea4\u8a18\u9304\u5c07\u6703\u986f\u793a\u5728\u9019\u88e1"
    />
  ),
};

export const WithPagination: Story = {
  render: () => (
    <SubmissionDataTable
      submissions={mockSubmissionListLarge.slice(0, 10)}
      totalItems={50}
      page={1}
      pageSize={10}
      pageSizes={[5, 10, 20]}
      showToolbar={false}
      onRowClick={(id) => console.log("Clicked:", id)}
      onPageChange={(page, pageSize) => console.log("Page change:", page, pageSize)}
    />
  ),
};