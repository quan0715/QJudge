import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./PageTitle.module.scss";

type Props<E extends ElementType> = {
  as?: E;
  children: ReactNode;
} & Omit<
  ComponentPropsWithoutRef<E>,
  "as" | "children" | "className" | "style"
>;

export function PageTitle<E extends ElementType = "h1">({
  as,
  children,
  ...rest
}: Props<E>) {
  const Tag = (as ?? "h1") as ElementType;
  return (
    <Tag className={styles.root} {...rest}>
      {children}
    </Tag>
  );
}
