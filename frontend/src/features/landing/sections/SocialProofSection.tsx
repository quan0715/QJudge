import { useEffect, useRef, useState, type FC } from "react";
import { motion, useInView, animate } from "motion/react";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./SocialProofSection.scss";

interface SocialProofSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  caseStudies: Array<{
    title: string;
    institution: string;
    department: string;
    course: string;
    summary: string;
    contextLabel: string;
    context: string;
    challengeLabel: string;
    challenge: string;
    imageSrc: string;
    imageAlt: string;
  }>;
}

const CASES = [
  {
    index: "01",
    reverse: false,
    school: "國立陽明交通大學",
    dept: "資訊與財務工程學系 · 計算機概論課程",
    headline: "多人上機受測，考後秒得結果",
    pain: "上機考需要逐份人工批改，語言版本差異讓評分標準難以統一，助教往往要花好幾天才能完成整理與發分。",
    result: "導入 QJudge 後，60 名學生同步作答、系統自動判題，考後幾分鐘內全班成績自動匯出，助教當天就能收工。",
    kpis: [
      { value: "60", label: "人同步上機作答" },
      { value: "100%", label: "平台自動批改" },
      { value: "5+", label: "語言支援" },
    ],
    imageSrc: "/illustrations/usecase-nycu-operating-systems.jpeg",
    imageAlt: "國立陽明交通大學計算機概論課程使用 QJudge 進行上機考",
  },
  {
    index: "02",
    reverse: true,
    school: "國立陽明交通大學",
    dept: "資訊與科學工程研究所 · OS 作業系統課程",
    headline: "全面採用線上考試，大幅減少助教人力成本，專注考後分析",
    pain: "OS 課程涵蓋選擇、填空、簡答與程式撰寫等多種題型，過去需要多位助教分工批改，人力成本高、耗時數天。",
    result: "改用 QJudge 後，題型設定靈活、批改全自動，130 名學生同時在線零中斷，助教將時間轉移到考後分析與教學改進。",
    kpis: [
      { value: "130", label: "人同時在線" },
      { value: "6", label: "種測驗題型" },
      { value: "70%", label: "批改時間減少" },
    ],
    imageSrc: "/illustrations/usecase-nycu-intro-computer-science.jpeg",
    imageAlt: "國立陽明交通大學資訊與科學工程研究所 OS 課程使用 QJudge 進行正式考試",
  },
] as const;

// KPI 數字計數動畫
const KpiCounter: FC<{ value: string; trigger: boolean }> = ({ value, trigger }) => {
  const numMatch = value.match(/^(\d+)/);
  const suffix = numMatch ? value.slice(numMatch[1].length) : "";
  const target = numMatch ? parseInt(numMatch[1]) : null;
  const [display, setDisplay] = useState(target !== null ? `0${suffix}` : value);

  useEffect(() => {
    if (!trigger || target === null) return;
    const controls = animate(0, target, {
      duration: 1.4,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(`${Math.round(v)}${suffix}`),
    });
    return () => controls.stop();
  }, [trigger, target, suffix]);

  return <>{display}</>;
};

const CARD_EASE = [0.22, 1, 0.36, 1] as const;

const CaseCard: FC<{ item: (typeof CASES)[number] }> = ({ item }) => {
  const kpiRef = useRef<HTMLDivElement>(null);
  const kpiInView = useInView(kpiRef, { once: true, amount: 0.8 });

  const contentBlocks = [
    { delay: 0.05, content: "org" },
    { delay: 0.12, content: "headline" },
    { delay: 0.20, content: "pain" },
    { delay: 0.28, content: "result" },
    { delay: 0.36, content: "kpis" },
  ];

  return (
    <motion.div
      className={`landing-social-proof-section__card${item.reverse ? " landing-social-proof-section__card--reverse" : ""}`}
      initial={{ opacity: 0, y: 52 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: CARD_EASE }}
    >
      <div className="landing-social-proof-section__card-content">

        <motion.div
          className="landing-social-proof-section__card-org"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: contentBlocks[0].delay, ease: CARD_EASE }}
        >
          <img
            src="/illustrations/nycu-logo.png"
            alt="國立陽明交通大學"
            className="landing-social-proof-section__org-logo"
          />
          <div>
            <p className="landing-social-proof-section__org-school">{item.school}</p>
            <p className="landing-social-proof-section__org-dept">{item.dept}</p>
          </div>
        </motion.div>

        <motion.h3
          className="landing-social-proof-section__card-headline"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: contentBlocks[1].delay, ease: CARD_EASE }}
        >
          {item.headline}
        </motion.h3>

        <motion.div
          className="landing-social-proof-section__card-block"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: contentBlocks[2].delay, ease: CARD_EASE }}
        >
          <p className="landing-social-proof-section__block-label">痛點</p>
          <p className="landing-social-proof-section__block-text">{item.pain}</p>
        </motion.div>

        <motion.div
          className="landing-social-proof-section__card-block"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: contentBlocks[3].delay, ease: CARD_EASE }}
        >
          <p className="landing-social-proof-section__block-label">結果</p>
          <p className="landing-social-proof-section__block-text">{item.result}</p>
        </motion.div>

        <motion.div
          ref={kpiRef}
          className="landing-social-proof-section__card-kpis"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: contentBlocks[4].delay, ease: CARD_EASE }}
        >
          {item.kpis.map((kpi) => (
            <div key={kpi.label} className="landing-social-proof-section__kpi">
              <strong>
                <KpiCounter value={kpi.value} trigger={kpiInView} />
              </strong>
              <span>{kpi.label}</span>
            </div>
          ))}
        </motion.div>

      </div>

      <motion.div
        className="landing-social-proof-section__card-image"
        initial={{ scale: 1.06, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: CARD_EASE }}
      >
        <img src={item.imageSrc} alt={item.imageAlt} loading="lazy" />
      </motion.div>
    </motion.div>
  );
};

const SocialProofSection: FC<SocialProofSectionProps> = ({
  eyebrow,
  title,
  description,
}) => {
  return (
    <section className="landing-social-proof-section landing-section" data-testid="landing-section-social-proof">
      <div className="landing-section__inner">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} align="center" />

        <div className="landing-social-proof-section__gallery">
          {CASES.map((item) => (
            <CaseCard key={item.index} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
