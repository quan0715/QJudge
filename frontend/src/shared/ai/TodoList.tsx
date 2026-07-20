import { Checkmark, Warning, InProgress } from "@carbon/icons-react";
import styles from "./TodoList.module.scss";

export type TodoListItemStatus = "pending" | "in_progress" | "success" | "fail";

export interface TodoListItem {
  id: string;
  label: string;
  status: TodoListItemStatus;
}

export function TodoStatusIcon({ status }: { status: TodoListItemStatus }) {
  if (status === "success") return <Checkmark size={14} className={styles.iconSuccess} />;
  if (status === "fail") return <Warning size={14} className={styles.iconFail} />;
  if (status === "in_progress") return <InProgress size={14} className={styles.iconProgress} />;
  return <InProgress size={14} className={styles.iconPending} />;
}

export function summarizeTodos(todos: readonly TodoListItem[]) {
  let done = 0;
  let inProgress = 0;
  let failed = 0;
  for (const item of todos) {
    if (item.status === "success") done += 1;
    else if (item.status === "fail") failed += 1;
    else if (item.status === "in_progress") inProgress += 1;
  }
  return { total: todos.length, done, inProgress, failed };
}

export function pickLatestTodos<T extends { todoItems?: TodoListItem[] }>(
  messages: readonly T[],
): TodoListItem[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const todos = messages[i]?.todoItems;
    if (todos && todos.length > 0) return todos;
  }
  return [];
}

interface TodoListProps {
  items: readonly TodoListItem[];
  className?: string;
}

export function TodoList({ items, className }: TodoListProps) {
  return (
    <ul className={`${styles.list} ${className ?? ""}`}>
      {items.map((item) => (
        <li
          key={item.id}
          className={`${styles.item} ${item.status === "in_progress" ? styles.itemInProgress : ""}`}
        >
          <TodoStatusIcon status={item.status} />
          <span className={styles.label}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
