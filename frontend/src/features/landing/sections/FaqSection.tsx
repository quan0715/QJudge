import { useState, useRef, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "@carbon/icons-react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./FaqSection.scss";

interface FaqSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{ question: string; answer: string }>;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const FaqItem: FC<{
  index: number;
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ index, question, answer, isOpen, onToggle }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={`landing-faq-section__item${isOpen ? " landing-faq-section__item--open" : ""}`}>
      <button
        ref={buttonRef}
        className="landing-faq-section__question"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${index}`}
      >
        <span className="landing-faq-section__index">{String(index + 1).padStart(2, "0")}</span>
        <span className="landing-faq-section__question-text">{question}</span>
        <motion.span
          className="landing-faq-section__chevron"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <ChevronDown size={20} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={`faq-answer-${index}`}
            className="landing-faq-section__answer-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <p className="landing-faq-section__answer">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FaqSection: FC<FaqSectionProps> = ({ eyebrow, title, description, items }) => {
  const [openIndex, setOpenIndex] = useState(0);

  const toggle = (index: number) =>
    setOpenIndex((current) => (current === index ? -1 : index));

  return (
    <section id="landing-faq" className="landing-faq-section landing-section" data-testid="landing-section-faq">
      <div className="landing-section__inner landing-faq-section__inner">

        <div className="landing-faq-section__sidebar">
          <SectionHeading eyebrow={eyebrow} title={title} description={description} />
        </div>

        <div className="landing-faq-section__list">
          {items.map((item, index) => (
            <FaqItem
              key={item.question}
              index={index}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              onToggle={() => toggle(index)}
            />
          ))}
        </div>

      </div>
    </section>
  );
};

export default FaqSection;
