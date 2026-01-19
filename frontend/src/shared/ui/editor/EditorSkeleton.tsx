import React from "react";
import { SkeletonText, SkeletonPlaceholder } from "@carbon/react";
import EditorLayout from "./EditorLayout";
import "./EditorSkeleton.scss";

/**
 * Reusable skeleton loading state for editor pages.
 * Can be used by LabEditor, ContestEditor, ProblemEditor, etc.
 */
const EditorSkeleton: React.FC = () => {
  return (
    <div className="editor-skeleton">
      {/* Skeleton Navbar */}
      <div className="editor-skeleton__navbar">
        <SkeletonPlaceholder className="editor-skeleton__back-icon" />
        <div className="editor-skeleton__title">
          <SkeletonText />
        </div>
      </div>

      <EditorLayout
        leftPanel={
          <div className="editor-skeleton__panel">
            <div className="editor-skeleton__item editor-skeleton__item--heading">
              <SkeletonText heading width="60%" />
            </div>
            <div className="editor-skeleton__item">
              <SkeletonText width="80%" />
            </div>
            <div className="editor-skeleton__item">
              <SkeletonText width="70%" />
            </div>
            <div className="editor-skeleton__item">
              <SkeletonText width="90%" />
            </div>
            <div className="editor-skeleton__item">
              <SkeletonText width="60%" />
            </div>
          </div>
        }
        centerPanel={
          <div className="editor-skeleton__panel">
            <div className="editor-skeleton__item editor-skeleton__item--heading">
              <SkeletonText heading width="30%" />
            </div>
            <div className="editor-skeleton__form-group">
              <div className="editor-skeleton__label">
                <SkeletonText width="20%" />
              </div>
              <SkeletonPlaceholder className="editor-skeleton__input" />
            </div>
            <div className="editor-skeleton__form-group">
              <div className="editor-skeleton__label">
                <SkeletonText width="25%" />
              </div>
              <SkeletonPlaceholder className="editor-skeleton__textarea" />
            </div>
            <div className="editor-skeleton__form-group">
              <div className="editor-skeleton__label">
                <SkeletonText width="15%" />
              </div>
              <SkeletonPlaceholder className="editor-skeleton__input editor-skeleton__input--short" />
            </div>
          </div>
        }
        rightPanel={
          <div className="editor-skeleton__panel">
            <div className="editor-skeleton__item editor-skeleton__item--heading">
              <SkeletonText heading width="40%" />
            </div>
            <SkeletonText paragraph lineCount={6} />
          </div>
        }
        rightCollapsed={false}
      />
    </div>
  );
};

export default EditorSkeleton;
