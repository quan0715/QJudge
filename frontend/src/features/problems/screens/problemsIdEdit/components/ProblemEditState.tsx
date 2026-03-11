import React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("problem");
  return (
    <div className="problem-edit-page">
      {header}
      <div className="problem-edit-page__error">
        <h3>{message}</h3>
        <Button kind="secondary" onClick={onBack}>
          {t("edit.actions.back")}
        </Button>
      </div>
    </div>
  );
};

export const ProblemEditPermissionDenied: React.FC<
  ProblemEditPermissionDeniedProps
> = ({ header, onBack }) => {
  const { t } = useTranslation("problem");
  return (
    <div className="problem-edit-page">
      {header}
      <div className="problem-edit-page__error">
        <h3>{t("edit.messages.noPermissionTitle")}</h3>
        <p>{t("edit.messages.noPermission")}</p>
        <Button kind="secondary" onClick={onBack}>
          {t("edit.actions.back")}
        </Button>
      </div>
    </div>
  );
};
