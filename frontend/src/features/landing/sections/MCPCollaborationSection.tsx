import type { FC } from "react";
import { Tile } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { MCPCollaborationContent } from "@/features/landing/content/landingContent";
import "./MCPCollaborationSection.scss";

interface MCPCollaborationSectionProps {
  content: MCPCollaborationContent;
}

const MCPCollaborationSection: FC<MCPCollaborationSectionProps> = ({ content }) => {
  return (
    <section id="landing-mcp" className="landing-mcp-section landing-section" data-testid="landing-section-mcp">
      <div className="landing-section__inner">
        {/* Section Heading */}
        <SectionHeading
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
          align="center"
        />

        {/* Tools Logo Row */}
        <div className="landing-mcp-section__tools">
          <div className="landing-mcp-section__tools-logos">
            <div className="landing-mcp-section__tool-logo">{content.tools.claude}</div>
            <div className="landing-mcp-section__tool-logo">{content.tools.chatgpt}</div>
            <div className="landing-mcp-section__tool-logo">{content.tools.gemini}</div>
            <div className="landing-mcp-section__tool-logo">{content.tools.notion}</div>
          </div>
        </div>

        {/* Features List */}
        <div className="landing-mcp-section__features">
          {content.features.map((feature, index) => (
            <div key={feature} className="landing-mcp-section__feature-item">
              <h4>{feature}</h4>
              <p>{content.featuresDescription[index]}</p>
            </div>
          ))}
        </div>

        {/* Examples Grid (2 columns) */}
        <div className="landing-mcp-section__examples">
          {content.examples.map((example) => (
            <Tile
              key={example.title}
              className="landing-mcp-section__example-card"
            >
              <div className="landing-mcp-section__example-header">
                <h3>{example.title}</h3>
                <p className="landing-mcp-section__example-description">
                  {example.description}
                </p>
              </div>

              <div className="landing-mcp-section__chat-area">
                <div className="landing-mcp-section__chat-message landing-mcp-section__chat-message--user">
                  <span className="landing-mcp-section__chat-sender">教師</span>
                  <p>{example.userMessage}</p>
                </div>

                <div className="landing-mcp-section__chat-message landing-mcp-section__chat-message--ai">
                  <span className="landing-mcp-section__chat-sender">Claude</span>
                  <p>{example.aiMessage}</p>
                  {example.feedback && (
                    <div className="landing-mcp-section__feedback">
                      {example.feedback}
                    </div>
                  )}
                  {example.stats && (
                    <div className="landing-mcp-section__stats">
                      {example.stats}
                    </div>
                  )}
                </div>
              </div>
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MCPCollaborationSection;
