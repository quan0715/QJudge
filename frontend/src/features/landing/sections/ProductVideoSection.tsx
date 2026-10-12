import { Link } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import SectionHeading from "@/features/landing/components/SectionHeading";
import "./ProductVideoSection.scss";

export default function ProductVideoSection() {
  const { t } = useTranslation("landing");
  const demoUrl = import.meta.env.VITE_LANDING_PUBLIC_URL ? "/demo/" : "https://www.q-judge.com/demo/";

  return (
    <section id="landing-video" className="landing-section landing-video" data-testid="landing-section-video">
      <div className="landing-section__inner landing-video__inner">
        <SectionHeading eyebrow={t("video.eyebrow")} title={t("video.title")} description={t("video.description")} />
        {/* Native media controls provide keyboard-accessible playback. All speech-free
            on-screen content is accompanied by the linked text summary. */}
        <video controls playsInline preload="none" width="1920" height="1080"
          poster="/media/QJudge-launch-v4.jpg" aria-label={t("video.title")}>
          <source src="/media/QJudge-launch-v4.mp4" type="video/mp4" />
          <a href="/media/QJudge-launch-v4.mp4">{t("video.title")}</a>
        </video>
        <div className="landing-video__footer">
          <p>{t("video.note")}</p>
          <Link href={demoUrl} renderIcon={ArrowRight}>{t("video.link")}</Link>
        </div>
      </div>
    </section>
  );
}
