import React from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { StickyTabs } from "@/ui/components/StickyTabs";

interface ContestTabsProps {
  contest?: ContestDetail | null;
  maxWidth?: string;
}

const ContestTabs: React.FC<ContestTabsProps> = ({ contest, maxWidth }) => {
  const { t } = useTranslation("contest");
  const [searchParams, setSearchParams] = useSearchParams();

  // Build tabs based on permissions and join status
  const buildTabs = () => {
    const permissions = contest?.permissions;
    const hasJoined = contest?.hasJoined || contest?.isRegistered;

    // Non-joined users can only see overview
    if (!hasJoined && !permissions?.canEditContest) {
      return [{ label: t("tabs.overview"), key: "overview" }];
    }

    // Base tabs visible to all participants
    const tabs = [
      { label: t("tabs.overview"), key: "overview" },
      { label: t("tabs.problems"), key: "problems" },
      { label: t("tabs.submissions"), key: "submissions" },
    ];

    // Standings - visible based on contest settings or permission
    if (
      permissions?.canViewFullScoreboard ||
      contest?.scoreboardVisibleDuringContest
    ) {
      tabs.push({ label: t("tabs.ranking"), key: "standings" });
    }

    // Clarifications - always visible for joined users
    tabs.push({ label: t("tabs.clarifications"), key: "clarifications" });

    // Admin tabs - based on permissions
    if (permissions?.canEditContest) {
      tabs.push({ label: t("tabs.settings"), key: "settings" });
    }

    if (permissions?.canViewAllSubmissions) {
      tabs.push({ label: t("tabs.participants"), key: "participants" });
      tabs.push({ label: t("tabs.logs"), key: "logs" });
    }

    // Admins tab - only visible to those who can edit (owner/admins)
    if (permissions?.canEditContest) {
      tabs.push({ label: t("tabs.admins"), key: "admins" });
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
