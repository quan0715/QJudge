import { useState, type FC } from "react";
import { Accordion, AccordionItem } from "@carbon/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./FaqSection.scss";

interface FaqSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{ question: string; answer: string }>;
}

const FaqSection: FC<FaqSectionProps> = ({ eyebrow, title, description, items }) => {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="landing-faq" className="landing-faq-section landing-section" data-testid="landing-section-faq">
      <div className="landing-section__inner landing-faq-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} />

        <Accordion align="start">
          {items.map((item, index) => (
            <AccordionItem
              key={item.question}
              title={item.question}
              open={openIndex === index}
              onHeadingClick={() => setOpenIndex((current) => (current === index ? -1 : index))}
            >
              <p>{item.answer}</p>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default FaqSection;
