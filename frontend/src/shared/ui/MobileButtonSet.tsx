import { Children, type ReactNode } from "react";
import { ButtonSet } from "@carbon/react";
import styles from "./MobileButtonSet.module.scss";

interface MobileButtonSetProps {
  children: ReactNode;
}

export function MobileButtonSet({ children }: MobileButtonSetProps) {
  const actions = Children.toArray(children);
  if (actions.length === 0) return null;

  return (
    <ButtonSet className={styles.root}>
      {actions}
    </ButtonSet>
  );
}
