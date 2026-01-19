import React, { useState } from "react";
import { Button, Tag, InlineNotification } from "@carbon/react";
import { Login, Checkmark } from "@carbon/icons-react";

import type { ContestDetail } from "@/core/entities/contest.entity";
import { HeroBase } from "@/shared/layout/HeroBase";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ContestRegistrationModal } from "@/features/contest/components/modals/ContestRegistrationModal";
import { formatDate } from "@/shared/utils/format";

interface ContestPreRegistrationScreenProps {
  contest: ContestDetail;
  loading?: boolean;
  onJoin?: (data?: { nickname?: string; password?: string }) => void;
}

/**
 * 競賽預報名頁面
 * 當競賽尚未開始 (upcoming) 時顯示此頁面
 * 根據 hasJoined 狀態顯示報名按鈕或已報名提示
 */
const ContestPreRegistrationScreen: React.FC<ContestPreRegistrationScreenProps> = ({
  contest,
  loading,
  onJoin,
}) => {
  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Loading state
  if (loading || !contest) {
    return <HeroBase title="" loading={true} maxWidth="1056px" />;
  }

  // --- Badges ---
  const badges = (
    <>
      <Tag type="blue">即將開始</Tag>
      <Tag type={contest.visibility === "public" ? "green" : "purple"}>
        {contest.visibility === "public" ? "公開" : "私有"}
      </Tag>
      {contest.examModeEnabled && <Tag type="red">考試模式</Tag>}
      {contest.hasJoined && (
        <Tag type="teal" renderIcon={Checkmark}>
          已報名
        </Tag>
      )}
    </>
  );

  // --- Metadata (Time Info) ---
  const metadata = (
    <>
      <div>
        <div style={{ marginBottom: "0.25rem" }}>開始時間</div>
        <div style={{ color: "var(--cds-text-primary)", fontWeight: 600 }}>
          {formatDate(contest.startTime, { includeSeconds: false })}
        </div>
      </div>
      <div>
        <div style={{ marginBottom: "0.25rem" }}>結束時間</div>
        <div style={{ color: "var(--cds-text-primary)", fontWeight: 600 }}>
          {formatDate(contest.endTime, { includeSeconds: false })}
        </div>
      </div>
    </>
  );

  // --- Actions (Register Button or Registered Status) ---
  const handleRegisterClick = () => {
    setShowRegisterModal(true);
  };

  const handleRegisterSubmit = (data: { nickname?: string; password?: string }) => {
    setShowRegisterModal(false);
    onJoin?.(data);
  };

  const renderActions = () => {
    if (contest.hasJoined) {
      // Already registered - show waiting status
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "8px",
            border: "1px solid var(--cds-border-subtle)",
          }}
        >
          <Checkmark size={20} style={{ color: "var(--cds-support-success)" }} />
          <span style={{ color: "var(--cds-text-primary)", fontWeight: 500 }}>
            已報名，等待競賽開始
          </span>
        </div>
      );
    }

    // Not registered - show register button
    return (
      <Button
        kind="primary"
        size="lg"
        renderIcon={Login}
        onClick={handleRegisterClick}
      >
        立即報名
      </Button>
    );
  };

  return (
    <>
      {/* Hero Section */}
      <HeroBase
        title={contest.name}
        description={
          contest.description ? (
            <MarkdownRenderer>{contest.description}</MarkdownRenderer>
          ) : (
            "暫無描述"
          )
        }
        badges={badges}
        metadata={
          <>
            {metadata}
            <div style={{ width: "100%", marginTop: "1.5rem" }}>{renderActions()}</div>
          </>
        }
        maxWidth="1056px"
      />

      {/* Content Section */}
      <SurfaceSection maxWidth="1056px" style={{ minHeight: "400px", flex: 1 }}>
        <div className="cds--grid" style={{ padding: 0 }}>
          <div className="cds--row">
            {/* Rules & Notifications */}
            <div className="cds--col-lg-16 cds--col-md-8">
              {/* Exam Mode Warning */}
              {contest.examModeEnabled && (
                <InlineNotification
                  kind="warning"
                  title="考試模式已啟用"
                  subtitle="此競賽啟用考試模式。進入競賽後將啟動監控機制，包括全螢幕鎖定、分頁切換偵測等。違規行為將被記錄並可能導致作答被鎖定。"
                  lowContrast
                  hideCloseButton
                  style={{ marginBottom: "1.5rem", maxWidth: "100%" }}
                />
              )}

              {/* Private Contest Hint */}
              {contest.visibility === "private" && !contest.hasJoined && (
                <InlineNotification
                  kind="info"
                  title="私有競賽"
                  subtitle="此競賽為私有競賽，報名時需要輸入加入密碼。"
                  lowContrast
                  hideCloseButton
                  style={{ marginBottom: "1.5rem" }}
                />
              )}

              {/* Anonymous Mode Hint */}
              {contest.anonymousModeEnabled && (
                <InlineNotification
                  kind="info"
                  title="匿名模式"
                  subtitle="本競賽已啟用匿名模式，報名時可設定暱稱。排行榜和提交列表將顯示暱稱而非真實帳號。"
                  lowContrast
                  hideCloseButton
                  style={{ marginBottom: "1.5rem" }}
                />
              )}

              {/* Contest Rules */}
              {contest.rules && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <h4
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      marginBottom: "1rem",
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    競賽規則
                  </h4>
                  <MarkdownRenderer>{contest.rules}</MarkdownRenderer>
                </div>
              )}
            </div>
          </div>
        </div>
      </SurfaceSection>

      {/* Registration Modal */}
      <ContestRegistrationModal
        open={showRegisterModal}
        contest={contest}
        onClose={() => setShowRegisterModal(false)}
        onSubmit={handleRegisterSubmit}
      />
    </>
  );
};

export default ContestPreRegistrationScreen;
