import type { TFunction } from "i18next";

export interface LandingHeroContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  trust: string[];
  primaryCta: string;
  secondaryCta: string;
  panelTitle: string;
  panelCaption: string;
}

export interface LandingBentoCard {
  eyebrow: string;
  title: string;
  description: string;
  metric?: string;
  variant: "half" | "third" | "full";
  preview: "multiExam" | "proctoring" | "questionBank" | "ai" | "analytics";
}

export interface LandingDetailItem {
  title: string;
  description: string;
  points: string[];
  preview: "proctoring" | "ai" | "questionBank" | "analytics" | "exam";
}

export interface LandingStepItem {
  step: string;
  title: string;
  description: string;
}

export interface LandingAudienceItem {
  key: string;
  label: string;
  background: string;
  solution: string;
  outcome: string;
  illustration: "exams" | "teacherStudent" | "education" | "codingWorkshop";
}

export interface LandingMetricItem {
  value: string;
  label: string;
  description: string;
}

export interface LandingCaseStudy {
  title: string;
  background: string;
  solution: string;
  outcome: string;
}

export interface LandingPricingCard {
  name: string;
  price: string;
  period?: string;
  description: string;
  badge?: string;
  highlighted?: boolean;
  cta: string;
  target: "register" | "pricing" | "contact";
  features: Array<{ text: string }>;
}

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface LandingContent {
  nav: Array<{ id: string; label: string }>;
  hero: LandingHeroContent;
  bento: LandingBentoCard[];
  details: LandingDetailItem[];
  quickStart: LandingStepItem[];
  flywheel: LandingStepItem[];
  audiences: LandingAudienceItem[];
  metrics: LandingMetricItem[];
  caseStudies: LandingCaseStudy[];
  pricing: LandingPricingCard[];
  faqs: LandingFaqItem[];
  footer: {
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    productLinks: Array<{ label: string; href: string }>;
    contactLinks: Array<{ label: string; href: string }>;
    legalLinks: Array<{ label: string; href: string }>;
    attribution: string;
  };
}

export function getLandingContent(t: TFunction<"landing">): LandingContent {
  return {
    nav: [
      { id: "landing-features", label: t("nav.features") },
      { id: "landing-audience", label: t("nav.audience") },
      { id: "landing-pricing", label: t("nav.pricing") },
      { id: "landing-faq", label: t("nav.faq") },
    ],
    hero: {
      eyebrow: t("hero.eyebrow"),
      title: t("hero.title"),
      subtitle: t("hero.subtitle"),
      trust: [t("hero.trust.users"), t("hero.trust.capacity"), t("hero.trust.validation")],
      primaryCta: t("hero.primaryCta"),
      secondaryCta: t("hero.secondaryCta"),
      panelTitle: t("hero.panelTitle"),
      panelCaption: t("hero.panelCaption"),
    },
    bento: [
      {
        eyebrow: t("bento.cards.dualMode.eyebrow"),
        title: t("bento.cards.dualMode.title"),
        description: t("bento.cards.dualMode.description"),
        variant: "half",
        preview: "multiExam",
      },
      {
        eyebrow: t("bento.cards.proctoring.eyebrow"),
        title: t("bento.cards.proctoring.title"),
        description: t("bento.cards.proctoring.description"),
        variant: "half",
        preview: "proctoring",
      },
      {
        eyebrow: t("bento.cards.questionBank.eyebrow"),
        title: t("bento.cards.questionBank.title"),
        description: t("bento.cards.questionBank.description"),
        variant: "third",
        preview: "questionBank",
      },
      {
        eyebrow: t("bento.cards.ai.eyebrow"),
        title: t("bento.cards.ai.title"),
        description: t("bento.cards.ai.description"),
        metric: t("bento.cards.ai.metric"),
        variant: "third",
        preview: "ai",
      },
      {
        eyebrow: t("bento.cards.analytics.eyebrow"),
        title: t("bento.cards.analytics.title"),
        description: t("bento.cards.analytics.description"),
        variant: "full",
        preview: "analytics",
      },
    ],
    details: [
      {
        title: t("details.items.proctoring.title"),
        description: t("details.items.proctoring.description"),
        points: [
          t("details.items.proctoring.points.0"),
          t("details.items.proctoring.points.1"),
          t("details.items.proctoring.points.2"),
        ],
        preview: "proctoring",
      },
      {
        title: t("details.items.ai.title"),
        description: t("details.items.ai.description"),
        points: [
          t("details.items.ai.points.0"),
          t("details.items.ai.points.1"),
          t("details.items.ai.points.2"),
        ],
        preview: "ai",
      },
      {
        title: t("details.items.questionBank.title"),
        description: t("details.items.questionBank.description"),
        points: [
          t("details.items.questionBank.points.0"),
          t("details.items.questionBank.points.1"),
          t("details.items.questionBank.points.2"),
        ],
        preview: "questionBank",
      },
      {
        title: t("details.items.analytics.title"),
        description: t("details.items.analytics.description"),
        points: [
          t("details.items.analytics.points.0"),
          t("details.items.analytics.points.1"),
          t("details.items.analytics.points.2"),
        ],
        preview: "analytics",
      },
      {
        title: t("details.items.examExperience.title"),
        description: t("details.items.examExperience.description"),
        points: [
          t("details.items.examExperience.points.0"),
          t("details.items.examExperience.points.1"),
          t("details.items.examExperience.points.2"),
        ],
        preview: "exam",
      },
    ],
    quickStart: [
      {
        step: "01",
        title: t("flow.quickStart.items.0.title"),
        description: t("flow.quickStart.items.0.description"),
      },
      {
        step: "02",
        title: t("flow.quickStart.items.1.title"),
        description: t("flow.quickStart.items.1.description"),
      },
      {
        step: "03",
        title: t("flow.quickStart.items.2.title"),
        description: t("flow.quickStart.items.2.description"),
      },
    ],
    flywheel: [
      {
        step: "01",
        title: t("flow.flywheel.items.0.title"),
        description: t("flow.flywheel.items.0.description"),
      },
      {
        step: "02",
        title: t("flow.flywheel.items.1.title"),
        description: t("flow.flywheel.items.1.description"),
      },
      {
        step: "03",
        title: t("flow.flywheel.items.2.title"),
        description: t("flow.flywheel.items.2.description"),
      },
      {
        step: "04",
        title: t("flow.flywheel.items.3.title"),
        description: t("flow.flywheel.items.3.description"),
      },
    ],
    audiences: [
      {
        key: "university",
        label: t("audience.items.university.label"),
        background: t("audience.items.university.background"),
        solution: t("audience.items.university.solution"),
        outcome: t("audience.items.university.outcome"),
        illustration: "exams",
      },
      {
        key: "independent",
        label: t("audience.items.independent.label"),
        background: t("audience.items.independent.background"),
        solution: t("audience.items.independent.solution"),
        outcome: t("audience.items.independent.outcome"),
        illustration: "teacherStudent",
      },
      {
        key: "experimental",
        label: t("audience.items.experimental.label"),
        background: t("audience.items.experimental.background"),
        solution: t("audience.items.experimental.solution"),
        outcome: t("audience.items.experimental.outcome"),
        illustration: "education",
      },
      {
        key: "apcs",
        label: t("audience.items.apcs.label"),
        background: t("audience.items.apcs.background"),
        solution: t("audience.items.apcs.solution"),
        outcome: t("audience.items.apcs.outcome"),
        illustration: "codingWorkshop",
      },
    ],
    metrics: [
      {
        value: t("socialProof.metrics.users.value"),
        label: t("socialProof.metrics.users.label"),
        description: t("socialProof.metrics.users.description"),
      },
      {
        value: t("socialProof.metrics.capacity.value"),
        label: t("socialProof.metrics.capacity.label"),
        description: t("socialProof.metrics.capacity.description"),
      },
      {
        value: t("socialProof.metrics.validation.value"),
        label: t("socialProof.metrics.validation.label"),
        description: t("socialProof.metrics.validation.description"),
      },
    ],
    caseStudies: [
      {
        title: t("socialProof.caseStudies.midterm.title"),
        background: t("socialProof.caseStudies.midterm.background"),
        solution: t("socialProof.caseStudies.midterm.solution"),
        outcome: t("socialProof.caseStudies.midterm.outcome"),
      },
      {
        title: t("socialProof.caseStudies.coding.title"),
        background: t("socialProof.caseStudies.coding.background"),
        solution: t("socialProof.caseStudies.coding.solution"),
        outcome: t("socialProof.caseStudies.coding.outcome"),
      },
    ],
    pricing: [
      {
        name: t("pricing.cards.free.name"),
        price: t("pricing.cards.free.price"),
        description: t("pricing.cards.free.description"),
        cta: t("pricing.cards.free.cta"),
        target: "register",
        features: [
          { text: t("pricing.cards.free.features.0") },
          { text: t("pricing.cards.free.features.1") },
          { text: t("pricing.cards.free.features.2") },
          { text: t("pricing.cards.free.features.3") },
        ],
      },
      {
        name: t("pricing.cards.pro.name"),
        price: t("pricing.cards.pro.price"),
        period: t("pricing.cards.pro.period"),
        description: t("pricing.cards.pro.description"),
        badge: t("pricing.cards.pro.badge"),
        highlighted: true,
        cta: t("pricing.cards.pro.cta"),
        target: "pricing",
        features: [
          { text: t("pricing.cards.pro.features.0") },
          { text: t("pricing.cards.pro.features.1") },
          { text: t("pricing.cards.pro.features.2") },
          { text: t("pricing.cards.pro.features.3") },
        ],
      },
      {
        name: t("pricing.cards.enterprise.name"),
        price: t("pricing.cards.enterprise.price"),
        description: t("pricing.cards.enterprise.description"),
        cta: t("pricing.cards.enterprise.cta"),
        target: "contact",
        features: [
          { text: t("pricing.cards.enterprise.features.0") },
          { text: t("pricing.cards.enterprise.features.1") },
          { text: t("pricing.cards.enterprise.features.2") },
          { text: t("pricing.cards.enterprise.features.3") },
        ],
      },
    ],
    faqs: [
      {
        question: t("faq.items.0.question"),
        answer: t("faq.items.0.answer"),
      },
      {
        question: t("faq.items.1.question"),
        answer: t("faq.items.1.answer"),
      },
      {
        question: t("faq.items.2.question"),
        answer: t("faq.items.2.answer"),
      },
      {
        question: t("faq.items.3.question"),
        answer: t("faq.items.3.answer"),
      },
      {
        question: t("faq.items.4.question"),
        answer: t("faq.items.4.answer"),
      },
      {
        question: t("faq.items.5.question"),
        answer: t("faq.items.5.answer"),
      },
    ],
    footer: {
      title: t("footer.title"),
      subtitle: t("footer.subtitle"),
      primaryCta: t("footer.primaryCta"),
      secondaryCta: t("footer.secondaryCta"),
      productLinks: [
        { label: t("footer.links.product.0.label"), href: "#landing-features" },
        { label: t("footer.links.product.1.label"), href: "#landing-pricing" },
        { label: t("footer.links.product.2.label"), href: "#landing-faq" },
      ],
      contactLinks: [
        { label: t("footer.links.contact.0.label"), href: "mailto:contact@qjudge.app" },
        { label: t("footer.links.contact.1.label"), href: "mailto:contact@qjudge.app?subject=QJudge%20Demo" },
      ],
      legalLinks: [
        { label: t("footer.links.legal.0.label"), href: "/docs/terms" },
        { label: t("footer.links.legal.1.label"), href: "/docs/privacy" },
      ],
      attribution: t("footer.attribution"),
    },
  };
}
