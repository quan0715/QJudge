import { useState } from "react";
import { Add } from "@carbon/icons-react";
import { Button, Popover, PopoverContent } from "@carbon/react";
import { useTranslation } from "react-i18next";
import styles from "./WorkTree.module.scss";

interface AddQuestionMenuButtonProps {
  onCreate: () => void;
  onImportFromBank?: () => void;
  disabled?: boolean;
}

const AddQuestionMenuButton = ({
  onCreate,
  onImportFromBank,
  disabled = false,
}: AddQuestionMenuButtonProps) => {
  const { t } = useTranslation("contest");
  const [open, setOpen] = useState(false);

  const closeAndRun = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <Popover
      open={open}
      align="bottom-right"
      onRequestClose={() => setOpen(false)}
    >
      <Button
        kind="ghost"
        hasIconOnly
        renderIcon={Add}
        iconDescription={t("examEditor.addQuestion", "建立題目")}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      />
      <PopoverContent>
        <div className={styles.addMenu}>
          {onImportFromBank && (
            <button
              type="button"
              className={styles.addMenuItem}
              onClick={() => closeAndRun(onImportFromBank)}
            >
              {t("examEditor.importFromBank", "從題庫匯入")}
            </button>
          )}
          <button
            type="button"
            className={styles.addMenuItem}
            onClick={() => closeAndRun(onCreate)}
          >
            {t("examEditor.createQuestion", "直接建立新題目")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AddQuestionMenuButton;
