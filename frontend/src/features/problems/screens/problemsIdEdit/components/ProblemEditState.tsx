import React from "react";
import { Loading, Button } from "@carbon/react";

interface ProblemEditStateProps {
  header: React.ReactNode;
}

interface ProblemEditErrorProps extends ProblemEditStateProps {
  message: string;
  onBack: () => void;
}

interface ProblemEditPermissionDeniedProps extends ProblemEditStateProps {
  onBack: () => void;
}

export const ProblemEditLoading: React.FC<ProblemEditStateProps> = ({
  header,
}) => {
  return (
    <div className="problem-edit-page">
      {header}
      <div className="problem-edit-page__loading">
        <Loading />
      </div>
    </div>
  );
};

export const ProblemEditError: React.FC<ProblemEditErrorProps> = ({
  header,
  message,
  onBack,
}) => {
  return (
    <div className="problem-edit-page">
      {header}
      <div className="problem-edit-page__error">
        <h3>{message}</h3>
        <Button kind="secondary" onClick={onBack}>
          返回
        </Button>
      </div>
    </div>
  );
};

export const ProblemEditPermissionDenied: React.FC<
  ProblemEditPermissionDeniedProps
> = ({ header, onBack }) => {
  return (
    <div className="problem-edit-page">
      {header}
      <div className="problem-edit-page__error">
        <h3>權限不足</h3>
        <p>您沒有編輯題目的權限</p>
        <Button kind="secondary" onClick={onBack}>
          返回
        </Button>
      </div>
    </div>
  );
};
