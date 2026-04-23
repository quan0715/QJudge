import { Button } from "@carbon/react";
import type { NextTurnOption } from "@/core/types/chatbot.types";
import styles from "./NextTurnChips.module.scss";

interface NextTurnChipsProps {
  options: NextTurnOption[];
  onSelect: (message: string) => void;
  disabled?: boolean;
}

export function NextTurnChips({ options, onSelect, disabled }: NextTurnChipsProps) {
  if (!options.length) return null;

  return (
    <div className={styles.wrapper}>
      {options.map((option, idx) => (
        <Button
          key={idx}
          kind="ghost"
          size="sm"
          className={styles.chip}
          disabled={disabled}
          onClick={() => onSelect(option.message)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
