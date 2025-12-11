import React, { useState } from "react";
import {
  Modal,
  TextInput,
  InlineLoading,
  Popover,
  PopoverContent,
  Button,
} from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { UserAvatarDisplay } from "@/ui/components/UserAvatarDisplay";
import { updateNickname } from "@/services/contest";

interface UserAvatarDisplayWithEditProps {
  contest: ContestDetail;
  onRefresh: () => void;
}

/**
 * User avatar display with nickname editing capability for anonymous contests.
 * Shows a popover with user info and edit option when clicked.
 */
const UserAvatarDisplayWithEdit: React.FC<UserAvatarDisplayWithEditProps> = ({
  contest,
  onRefresh,
}) => {
  const [open, setOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [nickname, setNickname] = useState(contest.myNickname || "");
  const [loading, setLoading] = useState(false);

  const avatarRef = React.useRef<HTMLDivElement>(null);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await updateNickname(contest.id, nickname);
      await onRefresh();
      setShowEditModal(false);
      setOpen(false);
    } catch (error) {
      console.error("Failed to update nickname", error);
      alert("更新暱稱失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const currentNickname = contest.myNickname || "參賽者";
  const role =
    contest.currentUserRole === "admin" || contest.currentUserRole === "teacher"
      ? "管理員"
      : "學生";

  // Can edit if registered, anonymous mode is enabled, and exam not in progress (unless admin)
  const canEdit =
    (contest.anonymousModeEnabled && contest.examStatus !== "in_progress") ||
    contest.currentUserRole === "admin";

  return (
    <>
      <div
        ref={avatarRef}
        style={{
          cursor: "pointer",
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
        onClick={() => setOpen(!open)}
      >
        <UserAvatarDisplay />
      </div>

      <Popover open={open} align="bottom-right" isTabTip>
        <PopoverContent className="p-3">
          <div style={{ minWidth: "200px", padding: "1rem" }}>
            <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>
              {currentNickname}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
                marginBottom: "1rem",
              }}
            >
              {role}
            </div>

            {canEdit && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Edit}
                onClick={() => setShowEditModal(true)}
                style={{ width: "100%" }}
              >
                編輯暱稱
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Modal
        open={showEditModal}
        modalHeading="編輯比賽暱稱"
        primaryButtonText={
          loading ? <InlineLoading description="更新中..." /> : "儲存"
        }
        secondaryButtonText="取消"
        primaryButtonDisabled={loading}
        onRequestClose={() => setShowEditModal(false)}
        onRequestSubmit={handleUpdate}
        size="xs"
      >
        <TextInput
          id="nickname-input"
          labelText="暱稱 (Nickname)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="請輸入新的暱稱"
        />
      </Modal>
    </>
  );
};

export default UserAvatarDisplayWithEdit;
