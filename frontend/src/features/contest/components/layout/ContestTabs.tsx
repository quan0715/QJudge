import React from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { StickyTabs } from "@/shared/ui/navigation/StickyTabs";
import {
  type ContestTabKey,
} from "@/features/contest/tabConfig";
import { getContestTypeModule } from "@/features/contest/modules/registry";

interface ContestTabsProps {
  contest?: ContestDetail | null;
  maxWidth?: string;
}

const ContestTabs: React.FC<ContestTabsProps> = ({ contest, maxWidth }) => {
  const { t } = useTranslation("contest");
  const [searchParams, setSearchParams] = useSearchParams();
  const contestModule = getContestTypeModule(contest?.contestType);

  const tabLabelMap: Record<ContestTabKey, string> = {
    overview: t("tabs.overview"),
    problems: t("tabs.problems"),
    submissions: t("tabs.submissions"),
    standings: t("tabs.ranking"),
    clarifications: t("tabs.clarifications"),
  };

  const currentTabs = contestModule.student.getAvailableTabs(contest).map((key) => ({
    key,
    label: tabLabelMap[key],
  }));

  // Determine active tab index
  const getCurrentTabIndex = () => {
    const currentTab = searchParams.get("tab") || "overview";
    const index = currentTabs.findIndex((tab) => tab.key === currentTab);
    return index !== -1 ? index : 0;
  };

  const handleTabChange = (selectedIndex: number) => {
    const key = currentTabs[selectedIndex].key;
    setSearchParams((prev) => {
      prev.set("tab", key);
      return prev;
    });
  };

  return (
    <StickyTabs
      items={currentTabs.map((t) => ({ label: t.label, key: t.key }))}
      selectedIndex={getCurrentTabIndex()}
      onChange={handleTabChange}
      ariaLabel="Contest navigation"
      maxWidth={maxWidth}
      sticky={false} // Sticky is handled by ContentPage's stickyHeader
    />
  );
};

export default ContestTabs;
