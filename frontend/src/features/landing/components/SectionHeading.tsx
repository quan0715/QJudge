import type { FC, ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  children?: ReactNode;
}

const SectionHeading: FC<SectionHeadingProps> = ({
  eyebrow,
  title,
  description,
  align = "left",
  children,
}) => {
  return (
    <div className={`landing-section-heading landing-section-heading--${align}`}>
      <p className="landing-section-heading__eyebrow">{eyebrow}</p>
      <h2 className="landing-section-heading__title">{title}</h2>
      {description ? <p className="landing-section-heading__description">{description}</p> : null}
      {children}
    </div>
  );
};

export default SectionHeading;
