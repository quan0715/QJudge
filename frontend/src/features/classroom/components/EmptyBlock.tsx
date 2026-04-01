import type React from "react";

interface EmptyBlockProps {
  icon: React.ComponentType<{ size: number; className?: string }>;
  message: string;
  compact?: boolean;
}

export const EmptyBlock: React.FC<EmptyBlockProps> = ({ icon: Icon, message, compact = false }) => (
  <div className={`classroom-admin-empty-block${compact ? " classroom-admin-empty-block--compact" : ""}`}>
    <Icon size={28} className="classroom-admin-empty-block__icon" />
    <p>{message}</p>
  </div>
);
