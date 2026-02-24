import {
  Checkmark,
  Chat,
  Code,
  MagicWand,
  Time,
  UserMultiple,
} from "@carbon/icons-react";

const LandingHeroUiMock = () => {
  return (
    <div className="landing-hero-ui" aria-hidden="true">
      <div className="landing-hero-ui__window">
        <div className="landing-hero-ui__titlebar">
          <span className="landing-hero-ui__dot landing-hero-ui__dot--red" />
          <span className="landing-hero-ui__dot landing-hero-ui__dot--yellow" />
          <span className="landing-hero-ui__dot landing-hero-ui__dot--green" />
          <span className="landing-hero-ui__window-title">Exam Session #A102</span>
        </div>

        <div className="landing-hero-ui__content">
          <section className="landing-hero-ui__editor">
            <header className="landing-hero-ui__panel-header">
              <Code size={16} />
              <span>solution.py</span>
            </header>

            <div className="landing-hero-ui__code-lines">
              <span style={{ width: "78%" }} />
              <span style={{ width: "66%" }} />
              <span style={{ width: "84%" }} />
              <span style={{ width: "58%" }} />
              <span style={{ width: "73%" }} />
              <span style={{ width: "52%" }} />
            </div>
          </section>

          <section className="landing-hero-ui__status">
            <header className="landing-hero-ui__panel-header">
              <Checkmark size={16} />
              <span>Judge Result</span>
            </header>

            <div className="landing-hero-ui__status-list">
              <div className="landing-hero-ui__status-item">
                <Time size={16} />
                <span>Runtime 48ms</span>
                <em>Passed</em>
              </div>
              <div className="landing-hero-ui__status-item">
                <UserMultiple size={16} />
                <span>Proctoring On</span>
                <em>Stable</em>
              </div>
              <div className="landing-hero-ui__status-item">
                <MagicWand size={16} />
                <span>AI Hint Ready</span>
                <em>Assist</em>
              </div>
              <div className="landing-hero-ui__status-item">
                <Chat size={16} />
                <span>Feedback Queue</span>
                <em>Live</em>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LandingHeroUiMock;
