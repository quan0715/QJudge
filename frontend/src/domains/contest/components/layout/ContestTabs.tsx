import React from "react";
import { useSearchParams } from "react-router-dom";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { StickyTabs } from "@/ui/components/StickyTabs";

interface ContestTabsProps {
  contest?: ContestDetail | null;
  maxWidth?: string;
}

const ContestTabs: React.FC<ContestTabsProps> = ({ contest, maxWidth }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Build tabs based on permissions and join status
  const buildTabs = () => {
    const permissions = contest?.permissions;
    const hasJoined = contest?.hasJoined || contest?.isRegistered;

    // Non-joined users can only see overview
    if (!hasJoined && !permissions?.canEditContest) {
      return [{ label: "Overview", key: "overview" }];
    }

    // Base tabs visible to all participants
    const tabs = [
      { label: "Overview", key: "overview" },
      { label: "Problems", key: "problems" },
      { label: "Submissions", key: "submissions" },
    ];

    // Standings - visible based on contest settings or permission
    if (
      permissions?.canViewFullScoreboard ||
      contest?.scoreboardVisibleDuringContest
    ) {
      tabs.push({ label: "Ranking", key: "standings" });
    }

    // Clarifications - always visible for joined users
    tabs.push({ label: "Clarifications", key: "clarifications" });

    // Admin tabs - based on permissions
    if (permissions?.canEditContest) {
      tabs.push({ label: "Settings", key: "settings" });
    }

    if (permissions?.canViewAllSubmissions) {
      tabs.push({ label: "Participants", key: "participants" });
      tabs.push({ label: "Logs", key: "logs" });
    }

    // Admins tab - only visible to those who can edit (owner/admins)
    if (permissions?.canEditContest) {
      tabs.push({ label: "Admins", key: "admins" });
    }

    return tabs;
  };

  const currentTabs = buildTabs();

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
