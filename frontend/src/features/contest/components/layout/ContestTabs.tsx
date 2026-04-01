import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { StickyTabs } from "@/shared/ui/navigation/StickyTabs";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import { useTabWithUrlParam } from "@/shared/hooks";

interface ContestTabsProps {
  contest?: ContestDetail | null;
  maxWidth?: string;
}

const ContestTabs: React.FC<ContestTabsProps> = ({ contest, maxWidth }) => {
  const { t } = useTranslation("contest");
  const contestModule = getContestTypeModule(contest?.contestType);
  const currentTabs = contestModule.student.getTabs(contest).map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
  }));

  const tabKeys = useMemo(() => currentTabs.map((tab) => tab.key), [currentTabs]);
  const { activeIndex, setActiveIndex } = useTabWithUrlParam({
    param: "tab",
    keys: tabKeys,
    defaultKey: "overview",
  });

  return (
    <StickyTabs
      items={currentTabs.map((tab) => ({ label: tab.label, key: tab.key }))}
      selectedIndex={activeIndex}
      onChange={setActiveIndex}
      ariaLabel="Contest navigation"
      maxWidth={maxWidth}
      sticky={false}
    />
  );
};

export default ContestTabs;
