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
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { UserAvatarDisplay } from "@/features/app/components/UserAvatarDisplay";
import { updateNickname } from "@/infrastructure/api/repositories";

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
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
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
      alert(t("avatar.updateFailed"));
    } finally {
      setLoading(false);
    }
  };

  const currentNickname = contest.myNickname || t("avatar.participant");
  const role =
    contest.currentUserRole === "admin" || contest.currentUserRole === "teacher"
      ? t("avatar.admin")
      : t("avatar.student");

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
                {t("avatar.editNickname")}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Modal
        open={showEditModal}
        modalHeading={t("avatar.editContestNickname")}
        primaryButtonText={
          loading ? (
            <InlineLoading description={t("refreshing")} />
          ) : (
            t("avatar.save")
          )
        }
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={loading}
        onRequestClose={() => setShowEditModal(false)}
        onRequestSubmit={handleUpdate}
        size="xs"
      >
        <TextInput
          id="nickname-input"
          labelText={t("avatar.nicknameLabel")}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t("avatar.nicknamePlaceholder")}
        />
      </Modal>
    </>
  );
};

export default UserAvatarDisplayWithEdit;
