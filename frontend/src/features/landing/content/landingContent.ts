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
  variant: "half" | "third";
  preview: "multiExam" | "proctoring" | "questionBank" | "ai" | "analytics";
}

export interface LandingWhyChooseItem {
  label: string;
  title: string;
  description: string;
}

export interface LandingWorkflowItem {
  step: string;
  title: string;
  description: string;
  output: string;
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
  nav: Array<{ id: string; label: string; href?: string }>;
  hero: LandingHeroContent;
  bento: LandingBentoCard[];
  whyChoose: LandingWhyChooseItem[];
  workflow: LandingWorkflowItem[];
  audiences: LandingAudienceItem[];
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
      { id: "landing-why", label: t("nav.why") },
      { id: "landing-audience", label: t("nav.audience") },
      { id: "pricing", label: t("nav.pricing"), href: "/pricing" },
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
        variant: "third",
        preview: "ai",
      },
      {
        eyebrow: t("bento.cards.analytics.eyebrow"),
        title: t("bento.cards.analytics.title"),
        description: t("bento.cards.analytics.description"),
        variant: "third",
        preview: "analytics",
      },
    ],
    whyChoose: [
      {
        label: t("whyChoose.items.proctoring.label"),
        title: t("whyChoose.items.proctoring.title"),
        description: t("whyChoose.items.proctoring.description"),
      },
      {
        label: t("whyChoose.items.flexibility.label"),
        title: t("whyChoose.items.flexibility.title"),
        description: t("whyChoose.items.flexibility.description"),
      },
      {
        label: t("whyChoose.items.questionBank.label"),
        title: t("whyChoose.items.questionBank.title"),
        description: t("whyChoose.items.questionBank.description"),
      },
    ],
    workflow: [
      {
        step: "01",
        title: t("flow.items.0.title"),
        description: t("flow.items.0.description"),
        output: t("flow.items.0.output"),
      },
      {
        step: "02",
        title: t("flow.items.1.title"),
        description: t("flow.items.1.description"),
        output: t("flow.items.1.output"),
      },
      {
        step: "03",
        title: t("flow.items.2.title"),
        description: t("flow.items.2.description"),
        output: t("flow.items.2.output"),
      },
      {
        step: "04",
        title: t("flow.items.3.title"),
        description: t("flow.items.3.description"),
        output: t("flow.items.3.output"),
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
    caseStudies: [
      {
        title: t("socialProof.caseStudies.coding.title"),
        institution: t("socialProof.caseStudies.coding.institution"),
        department: t("socialProof.caseStudies.coding.department"),
        course: t("socialProof.caseStudies.coding.course"),
        summary: t("socialProof.caseStudies.coding.summary"),
        contextLabel: t("socialProof.caseStudies.coding.contextLabel"),
        context: t("socialProof.caseStudies.coding.context"),
        challengeLabel: t("socialProof.caseStudies.coding.challengeLabel"),
        challenge: t("socialProof.caseStudies.coding.challenge"),
        imageSrc: "/illustrations/usecase-nycu-operating-systems.jpeg",
        imageAlt: t("socialProof.caseStudies.coding.imageAlt"),
      },
      {
        title: t("socialProof.caseStudies.midterm.title"),
        institution: t("socialProof.caseStudies.midterm.institution"),
        department: t("socialProof.caseStudies.midterm.department"),
        course: t("socialProof.caseStudies.midterm.course"),
        summary: t("socialProof.caseStudies.midterm.summary"),
        contextLabel: t("socialProof.caseStudies.midterm.contextLabel"),
        context: t("socialProof.caseStudies.midterm.context"),
        challengeLabel: t("socialProof.caseStudies.midterm.challengeLabel"),
        challenge: t("socialProof.caseStudies.midterm.challenge"),
        imageSrc: "/illustrations/usecase-nycu-intro-computer-science.jpeg",
        imageAlt: t("socialProof.caseStudies.midterm.imageAlt"),
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
        { label: t("footer.links.product.1.label"), href: "/pricing" },
        { label: t("footer.links.product.2.label"), href: "#landing-faq" },
      ],
      contactLinks: [
        { label: t("footer.links.contact.0.label"), href: "mailto:quan787887@gmail.com" },
        {
          label: t("footer.links.contact.1.label"),
          href: "https://bedecked-griffin-98f.notion.site/b532286e832b4846a8f08298b6942fcc?pvs=105",
        },
      ],
      legalLinks: [
        { label: t("footer.links.legal.0.label"), href: "/docs/terms" },
        { label: t("footer.links.legal.1.label"), href: "/docs/privacy" },
      ],
      attribution: t("footer.attribution"),
    },
  };
}
