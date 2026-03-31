import React from "react";
import "./MemberTable.scss";

export interface MemberCardData {
  key: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  role: "owner" | "manager" | "member";
}

interface MemberGridProps {
  members: MemberCardData[];
}

function getInitials(username: string): string {
  const words = username.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export const MemberGrid: React.FC<MemberGridProps> = ({ members }) => {
  if (members.length === 0) return null;

  return (
    <div className="classroom-member-grid">
      {members.map((member) => (
        <div key={member.key} className="classroom-member-card">
          <div className="classroom-member-card__avatar">
            {member.avatarUrl ? (
              <img src={member.avatarUrl} alt={member.username} />
            ) : (
              <span className="classroom-member-card__avatar-fallback">
                {getInitials(member.username)}
              </span>
            )}
          </div>
          <div className="classroom-member-card__info">
            <span className="classroom-member-card__name">{member.username}</span>
            {member.email && (
              <span className="classroom-member-card__email">{member.email}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Backward-compat alias
export const MemberTable = MemberGrid;
