import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./SectionTitle.module.scss";

type Props<E extends ElementType> = {
  as?: E;
  children: ReactNode;
} & Omit<
  ComponentPropsWithoutRef<E>,
  "as" | "children" | "className" | "style"
>;

export function SectionTitle<E extends ElementType = "h2">({
  as,
  children,
  ...rest
}: Props<E>) {
  const Tag = (as ?? "h2") as ElementType;
  return (
    <Tag className={styles.root} {...rest}>
      {children}
    </Tag>
  );
}
