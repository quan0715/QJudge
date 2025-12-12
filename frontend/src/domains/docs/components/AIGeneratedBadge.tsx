import { useTranslation } from "react-i18next";
import { Tag } from "@carbon/react";
import { MagicWand } from "@carbon/icons-react";

interface AIGeneratedBadgeProps {
  style?: React.CSSProperties;
}

const AIGeneratedBadge: React.FC<AIGeneratedBadgeProps> = ({ style }) => {
  const { t } = useTranslation("docs");

  return (
    <Tag
      type="purple"
      size="sm"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        ...style,
      }}
    >
      <MagicWand size={12} />
      {t("badge.aiGenerated", "AI 生成")}
    </Tag>
  );
};

export default AIGeneratedBadge;
