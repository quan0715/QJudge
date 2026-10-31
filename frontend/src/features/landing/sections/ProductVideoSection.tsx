import { Link } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import "./ProductVideoSection.scss";

export default function ProductVideoSection() {
  const { t } = useTranslation("landing");
  // The main app reserves /media/ for backend uploads. Public marketing media
  // is served by the standalone landing site, not that backend route.
  const mediaOrigin = import.meta.env.VITE_LANDING_PUBLIC_URL ? "" : "https://www.q-judge.com";
  const videoUrl = `${mediaOrigin}/media/QJudge-launch-v4.mp4`;
  const posterUrl = `${mediaOrigin}/media/QJudge-launch-v4.jpg`;
  const demoUrl = import.meta.env.VITE_LANDING_PUBLIC_URL ? "/demo/" : "https://www.q-judge.com/demo/";

  return (
    <section id="landing-video" className="landing-section landing-video" data-testid="landing-section-video">
      <div className="landing-section__inner landing-video__inner">
        {/* Native media controls provide keyboard-accessible playback. All speech-free
            on-screen content is accompanied by the linked text summary. */}
        <video controls playsInline preload="none" width="1920" height="1080"
          poster={posterUrl} aria-label={t("video.title")}>
          <source src={videoUrl} type="video/mp4" />
          <a href={videoUrl}>{t("video.title")}</a>
        </video>
        <div className="landing-video__footer">
          <Link href={demoUrl} renderIcon={ArrowRight}>{t("video.link")}</Link>
        </div>
      </div>
    </section>
  );
}
