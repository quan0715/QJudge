import { Tile, Stack } from "@carbon/react";
import type { FC, ReactNode } from "react";

type LandingFeatureColor = "primary" | "purple" | "teal" | "magenta";

interface LandingFeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  color?: LandingFeatureColor;
}

const LandingFeatureCard: FC<LandingFeatureCardProps> = ({
  icon,
  title,
  description,
  color = "primary",
}) => {
  return (
    <Tile className="landing__feature-tile">
      <Stack gap={4}>
        <div className={`landing__feature-icon landing__feature-icon--${color}`}>
          {icon}
        </div>
        <h3 className="landing__feature-title">{title}</h3>
        <p className="landing__feature-desc">{description}</p>
      </Stack>
    </Tile>
  );
};

export default LandingFeatureCard;
