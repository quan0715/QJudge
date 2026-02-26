import React from "react";
import { ClickableTile, Tag } from "@carbon/react";
import { Education, UserMultiple } from "@carbon/icons-react";
import type { Classroom } from "@/core/entities/classroom.entity";
import "./ClassroomCard.scss";

interface ClassroomCardProps {
  classroom: Classroom;
  onClick: () => void;
}

const roleTagType: Record<string, string> = {
  admin: "red",
  teacher: "purple",
  ta: "cyan",
  student: "teal",
};

export const ClassroomCard: React.FC<ClassroomCardProps> = ({
  classroom,
  onClick,
}) => {
  const role = classroom.currentUserRole || "student";
  return (
    <ClickableTile onClick={onClick} className="classroom-card">
      <div className="classroom-card__header">
        <Education size={20} className="classroom-card__icon" />
        <h4 className="classroom-card__name">{classroom.name}</h4>
      </div>
      {classroom.description && (
        <p className="classroom-card__desc">{classroom.description}</p>
      )}
      <div className="classroom-card__footer">
        <Tag type={roleTagType[role] || "gray"} size="sm">
          {role}
        </Tag>
        <Tag type="cool-gray" size="sm">
          <UserMultiple size={12} style={{ marginRight: 4 }} />
          {classroom.memberCount}
        </Tag>
        <Tag type="high-contrast" size="sm">
          {classroom.ownerUsername}
        </Tag>
      </div>
    </ClickableTile>
  );
};
