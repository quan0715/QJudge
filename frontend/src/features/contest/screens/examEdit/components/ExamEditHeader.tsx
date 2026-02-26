import React from "react";
import { Button } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";

interface ExamEditHeaderProps {
  title: string;
  onBack: () => void;
  globalSaveStatus?: React.ReactNode;
}

const ExamEditHeader: React.FC<ExamEditHeaderProps> = ({
  title,
  onBack,
  globalSaveStatus,
}) => {
  return (
    <header className="exam-edit-page__header">
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        iconDescription="返回"
        renderIcon={ArrowLeft}
        onClick={onBack}
        className="exam-edit-page__back-btn"
      />
      <span className="exam-edit-page__title">{title}</span>
      {globalSaveStatus && (
        <div className="exam-edit-page__header-status">
          {globalSaveStatus}
        </div>
      )}
    </header>
  );
};

export default ExamEditHeader;
