import React from "react";
import { Header, HeaderName, Button } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";

interface ProblemEditHeaderProps {
  title: string;
  onBack: () => void;
  globalSaveStatus?: React.ReactNode;
  actions?: React.ReactNode;
}

const ProblemEditHeader: React.FC<ProblemEditHeaderProps> = ({
  title,
  onBack,
  globalSaveStatus,
  actions,
}) => {
  return (
    <Header aria-label="Problem Editor" className="problem-edit-page__header">
      <Button
        kind="ghost"
        hasIconOnly
        renderIcon={ArrowLeft}
        iconDescription="返回"
        onClick={onBack}
        className="problem-edit-page__back-btn"
      />
      <HeaderName prefix="" className="problem-edit-page__title">
        {title}
      </HeaderName>
      <div className="problem-edit-page__header-actions">
        {globalSaveStatus}
        {actions}
      </div>
    </Header>
  );
};

export default ProblemEditHeader;
