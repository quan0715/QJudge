import React from 'react';
import {
  Checkmark,
  CircleDash,
  Time,
  TaskComplete,
  ChartLine,
} from '@carbon/icons-react';
import './AuthHeroComposition.scss';

const AuthHeroComposition: React.FC = () => {
  return (
    <div className="hero-mock">
      {/* Main exam window */}
      <div className="hero-mock__window">
        <div className="hero-mock__titlebar">
          <span className="hero-mock__dot hero-mock__dot--red" />
          <span className="hero-mock__dot hero-mock__dot--yellow" />
          <span className="hero-mock__dot hero-mock__dot--green" />
          <span className="hero-mock__titlebar-text">Exam — Midterm Quiz</span>
        </div>

        <div className="hero-mock__body">
          {/* Progress bar */}
          <div className="hero-mock__progress">
            <div className="hero-mock__progress-bar">
              <div className="hero-mock__progress-fill" />
            </div>
            <span className="hero-mock__progress-label">3 / 5</span>
          </div>

          {/* Question card */}
          <div className="hero-mock__question">
            <div className="hero-mock__q-badge">Q3</div>
            <div className="hero-mock__q-lines">
              <div className="hero-mock__line hero-mock__line--long" />
              <div className="hero-mock__line hero-mock__line--med" />
            </div>
          </div>

          {/* Answer options */}
          <div className="hero-mock__options">
            <div className="hero-mock__option">
              <CircleDash size={14} />
              <div className="hero-mock__line hero-mock__line--opt" />
            </div>
            <div className="hero-mock__option hero-mock__option--selected">
              <Checkmark size={14} />
              <div className="hero-mock__line hero-mock__line--opt" />
            </div>
            <div className="hero-mock__option">
              <CircleDash size={14} />
              <div className="hero-mock__line hero-mock__line--opt" />
            </div>
            <div className="hero-mock__option">
              <CircleDash size={14} />
              <div className="hero-mock__line hero-mock__line--opt" />
            </div>
          </div>

          {/* Question nav dots */}
          <div className="hero-mock__nav">
            <span className="hero-mock__nav-dot hero-mock__nav-dot--done" />
            <span className="hero-mock__nav-dot hero-mock__nav-dot--done" />
            <span className="hero-mock__nav-dot hero-mock__nav-dot--active" />
            <span className="hero-mock__nav-dot" />
            <span className="hero-mock__nav-dot" />
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="hero-mock__badge hero-mock__badge--timer">
        <Time size={16} />
        <span>23:45</span>
      </div>
      <div className="hero-mock__badge hero-mock__badge--score">
        <ChartLine size={16} />
        <span>85 / 100</span>
      </div>
      <div className="hero-mock__badge hero-mock__badge--status">
        <TaskComplete size={16} />
        <span>Auto-save</span>
      </div>
    </div>
  );
};

export default AuthHeroComposition;
