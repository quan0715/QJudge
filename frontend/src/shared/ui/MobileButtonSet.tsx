import { Children, isValidElement, type ReactNode } from "react";
import { ButtonSet } from "@carbon/react";
import styles from "./MobileButtonSet.module.scss";

interface MobileButtonSetProps {
  children: ReactNode;
}

export function MobileButtonSet({ children }: MobileButtonSetProps) {
  const actions = Children.toArray(children);
  if (actions.length === 0) return null;

  return (
    <ButtonSet className={styles.root} data-action-count={actions.length}>
      {actions.map((action, index) => {
        const key = isValidElement(action) && action.key != null
          ? action.key
          : `mobile-action-${index}`;
        return (
          <div className={styles.actionSlot} key={key}>
            {action}
          </div>
        );
      })}
    </ButtonSet>
  );
}
