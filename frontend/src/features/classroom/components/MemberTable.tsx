import React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Tag,
  Select,
  SelectItem,
  Tile,
} from "@carbon/react";
import { Calendar, TrashCan } from "@carbon/icons-react";
import { formatDate } from "@/i18n/dateUtils";
import type { ClassroomMember } from "@/core/entities/classroom.entity";
import "./MemberTable.scss";

interface MemberTableProps {
  members: ClassroomMember[];
  isPrivileged: boolean;
  onRemove: (member: ClassroomMember) => void;
  onRoleChange?: (member: ClassroomMember, role: "student" | "ta") => void;
}

export const MemberTable: React.FC<MemberTableProps> = ({
  members,
  isPrivileged,
  onRemove,
  onRoleChange,
}) => {
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");

  const getInitials = (username: string): string => {
    const words = username
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  };

  return (
    <div className="classroom-member-card-grid">
      {members.map((member) => {
        const roleValue = member.role as "student" | "ta";
        const initials = getInitials(member.username);
        return (
          <Tile key={member.userId} className="classroom-member-card">
            <div className="classroom-member-card__header">
              <div className="classroom-member-card__identity">
                <span className="classroom-member-card__avatar">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.username} />
                  ) : (
                    <span className="classroom-member-card__avatar-fallback">{initials}</span>
                  )}
                </span>
                <div className="classroom-member-card__primary">
                  <p className="classroom-member-card__name">{member.username}</p>
                  <p className="classroom-member-card__email">{member.email}</p>
                </div>
              </div>
              <Tag type={roleValue === "ta" ? "purple" : "teal"} size="sm">
                {tc(`user.role.${roleValue}`)}
              </Tag>
            </div>

            <div className="classroom-member-card__meta">
              <span>
                <Calendar size={12} />
                {t("members.headers.joinedAt", "加入時間")} {formatDate(member.joinedAt)}
              </span>
            </div>

            {isPrivileged && (
              <div className="classroom-member-card__actions">
                <Select
                  id={`member-role-${member.userId}`}
                  hideLabel
                  labelText={t("members.headers.role")}
                  value={roleValue}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                    const nextRole = event.target.value as "student" | "ta";
                    if (nextRole !== roleValue && onRoleChange) {
                      onRoleChange(member, nextRole);
                    }
                  }}
                  size="sm"
                >
                  <SelectItem value="student" text={tc("user.role.student")} />
                  <SelectItem value="ta" text={tc("user.role.ta")} />
                </Select>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={TrashCan}
                  iconDescription={t("members.actions.remove")}
                  onClick={() => onRemove(member)}
                >
                  {t("members.actions.remove", "移除")}
                </Button>
              </div>
            )}
          </Tile>
        );
      })}
    </div>
  );
};
