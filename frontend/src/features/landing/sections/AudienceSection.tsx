import { useState, type FC } from "react";
import { Accordion, AccordionItem, Tab, TabList, TabPanel, TabPanels, Tabs, Tile } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import {
  STORYSET_CODING_WORKSHOP_RAFIKI_ILLUSTRATION,
  STORYSET_EDUCATION_RAFIKI_ILLUSTRATION,
  STORYSET_EXAMS_RAFIKI_ILLUSTRATION,
  STORYSET_TEACHER_STUDENT_RAFIKI_ILLUSTRATION,
} from "@/features/landing/assets/illustrations/storyset";
import "./AudienceSection.scss";

interface AudienceSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{
    key: string;
    label: string;
    background: string;
    solution: string;
    outcome: string;
    illustration: "exams" | "teacherStudent" | "education" | "codingWorkshop";
  }>;
}

const ILLUSTRATIONS = {
  exams: STORYSET_EXAMS_RAFIKI_ILLUSTRATION,
  teacherStudent: STORYSET_TEACHER_STUDENT_RAFIKI_ILLUSTRATION,
  education: STORYSET_EDUCATION_RAFIKI_ILLUSTRATION,
  codingWorkshop: STORYSET_CODING_WORKSHOP_RAFIKI_ILLUSTRATION,
} as const;

const AudiencePanel = ({
  item,
  index,
}: {
  item: AudienceSectionProps["items"][number];
  index: number;
}) => (
  <div className={`landing-audience-section__panel landing-audience-section__panel--${item.key}`}>
    <div className="landing-audience-section__content">
      <p className="landing-audience-section__case-meta">Case {String(index + 1).padStart(2, "0")}</p>
      <h3>{item.label}</h3>
      <dl>
        <div>
          <dt>背景</dt>
          <dd>{item.background}</dd>
        </div>
        <div>
          <dt>解決方案</dt>
          <dd>{item.solution}</dd>
        </div>
        <div>
          <dt>結果</dt>
          <dd>{item.outcome}</dd>
        </div>
      </dl>
    </div>
    <div className="landing-audience-section__visual">
      <div className="landing-audience-section__visual-stage">
        <img src={ILLUSTRATIONS[item.illustration]} alt="" aria-hidden="true" />
      </div>
    </div>
  </div>
);

const AudienceSection: FC<AudienceSectionProps> = ({ eyebrow, title, description, items }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <section id="landing-audience" className="landing-audience-section landing-section" data-testid="landing-section-audience">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} />

        <div className="landing-audience-section__desktop">
          <Tile className="landing-audience-section__tabs-shell">
            <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex: nextIndex }) => setSelectedIndex(nextIndex)}>
              <TabList aria-label="Audience tabs" contained>
                {items.map((item) => (
                  <Tab key={item.key}>{item.label}</Tab>
                ))}
              </TabList>
              <TabPanels>
                {items.map((item, index) => (
                  <TabPanel key={item.key}>
                    <AudiencePanel item={item} index={index} />
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </Tile>
        </div>

        <div className="landing-audience-section__mobile">
          <Accordion align="start">
            {items.map((item, index) => (
              <AccordionItem key={item.key} title={item.label}>
                <AudiencePanel item={item} index={index} />
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default AudienceSection;
