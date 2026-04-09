import type { FC } from "react";
import "./ProductPreview.scss";

export type ProductPreviewVariant =
  | "dashboard"
  | "exam"
  | "questionBank"
  | "analytics"
  | "proctoring"
  | "ai";

interface ProductPreviewProps {
  variant: ProductPreviewVariant;
  compact?: boolean;
}

const ProductPreview: FC<ProductPreviewProps> = ({ variant, compact = false }) => {
  return (
    <div className={`landing-product-preview landing-product-preview--${variant} ${compact ? "landing-product-preview--compact" : ""}`}>
      <div className="landing-product-preview__topbar">
        <span />
        <span />
        <span />
      </div>

      {variant === "dashboard" && (
        <div className="landing-product-preview__body landing-product-preview__body--dashboard">
          <div className="landing-product-preview__kpis">
            <div className="landing-product-preview__kpi-card" />
            <div className="landing-product-preview__kpi-card" />
            <div className="landing-product-preview__kpi-card" />
          </div>
          <div className="landing-product-preview__chart" />
        </div>
      )}

      {variant === "exam" && (
        <div className="landing-product-preview__body landing-product-preview__body--exam">
          <div className="landing-product-preview__panel landing-product-preview__panel--statement" />
          <div className="landing-product-preview__panel landing-product-preview__panel--editor">
            <div className="landing-product-preview__code-line w-90" />
            <div className="landing-product-preview__code-line w-65" />
            <div className="landing-product-preview__code-line w-80" />
            <div className="landing-product-preview__code-line w-45" />
          </div>
        </div>
      )}

      {variant === "questionBank" && (
        <div className="landing-product-preview__body landing-product-preview__body--question-bank">
          <div className="landing-product-preview__sidebar">
            <div className="landing-product-preview__nav-pill" />
            <div className="landing-product-preview__nav-pill" />
            <div className="landing-product-preview__nav-pill" />
          </div>
          <div className="landing-product-preview__table">
            <div className="landing-product-preview__table-row" />
            <div className="landing-product-preview__table-row" />
            <div className="landing-product-preview__table-row" />
          </div>
        </div>
      )}

      {variant === "analytics" && (
        <div className="landing-product-preview__body landing-product-preview__body--analytics">
          <div className="landing-product-preview__chart landing-product-preview__chart--scatter" />
          <div className="landing-product-preview__bars">
            <span className="h-55" />
            <span className="h-80" />
            <span className="h-40" />
            <span className="h-70" />
          </div>
        </div>
      )}

      {variant === "proctoring" && (
        <div className="landing-product-preview__body landing-product-preview__body--proctoring">
          <div className="landing-product-preview__status-strip" />
          <div className="landing-product-preview__grid">
            <div className="landing-product-preview__grid-item" />
            <div className="landing-product-preview__grid-item" />
            <div className="landing-product-preview__grid-item" />
            <div className="landing-product-preview__grid-item" />
          </div>
        </div>
      )}

      {variant === "ai" && (
        <div className="landing-product-preview__body landing-product-preview__body--ai">
          <div className="landing-product-preview__prompt" />
          <div className="landing-product-preview__prompt" />
          <div className="landing-product-preview__result-card" />
          <div className="landing-product-preview__result-card" />
        </div>
      )}
    </div>
  );
};

export default ProductPreview;
