import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Renew } from "@carbon/icons-react";
import {
  Button,
  InlineNotification,
  SkeletonText,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
} from "@carbon/react";

import { PageHeader } from "@/shared/layout/PageHeader";
import ContainerCard from "@/shared/layout/ContainerCard";
import { getIngress } from "@/infrastructure/api/repositories/system.repository";
import type { IngressReport } from "@/core/entities/ingress.entity";
import AgentStateNote from "../components/AgentStateNote";
import styles from "./AdminScreens.module.scss";

const IngressScreen = () => {
  const { t } = useTranslation("admin");
  const [report, setReport] = useState<IngressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Bumped by the retest button; each bump runs one probe round on the host.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getIngress().then(
      (next) => {
        if (cancelled) return;
        setReport(next);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [round]);

  const retest = () => {
    setLoading(true);
    setError("");
    setRound((current) => current + 1);
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
        <PageHeader
          title={t("system.ingress.title", "Ingress")}
          subtitle={t(
            "system.ingress.subtitle",
            "結果是從主機本身測試，不保證外部網路一定連得到",
          )}
          action={
            <Button kind="ghost" size="sm" renderIcon={Renew} disabled={loading} onClick={retest}>
              {t("system.ingress.retest", "重新測試")}
            </Button>
          }
        />

        {error ? (
          <InlineNotification
            kind="error"
            lowContrast
            title={t("system.ingress.loadFailed", "無法讀取 Ingress 狀態")}
            subtitle={error}
            hideCloseButton
          />
        ) : null}

        {loading && !report ? (
          <ContainerCard>
            <SkeletonText paragraph lineCount={5} />
          </ContainerCard>
        ) : null}

        {report ? (
          <ContainerCard>
            {report.agent !== "ok" ? (
              <AgentStateNote
                agent={report.agent}
                unsupported={t(
                  "system.ingress.agent.unsupported",
                  "此環境沒有主機 agent，無法測試入口",
                )}
              />
            ) : (
              <div className={styles.tableScroll}>
                <StructuredListWrapper
                  isCondensed
                  className={styles.ingressTable}
                  data-testid="ingress-entries"
                >
                  <StructuredListHead>
                    <StructuredListRow head>
                      <StructuredListCell head>
                        {t("system.ingress.columns.entry", "入口")}
                      </StructuredListCell>
                      <StructuredListCell head>
                        {t("system.ingress.columns.public", "對外位址")}
                      </StructuredListCell>
                      <StructuredListCell head>
                        {t("system.ingress.columns.target", "應轉到")}
                      </StructuredListCell>
                      <StructuredListCell head>
                        {t("system.ingress.columns.result", "結果")}
                      </StructuredListCell>
                      <StructuredListCell head>
                        {t("system.ingress.columns.detail", "細節")}
                      </StructuredListCell>
                    </StructuredListRow>
                  </StructuredListHead>
                  <StructuredListBody>
                    {report.entries.map((entry) => (
                      <StructuredListRow key={entry.id} data-testid={`ingress-${entry.id}`}>
                        <StructuredListCell>
                          {t(`system.ingress.entries.${entry.id}`, entry.id)}
                        </StructuredListCell>
                        <StructuredListCell>
                          <code className={styles.probeDetail}>{entry.public}</code>
                        </StructuredListCell>
                        <StructuredListCell>
                          <code className={styles.probeDetail}>{entry.target}</code>
                        </StructuredListCell>
                        <StructuredListCell>
                          <Tag type={entry.ok ? "green" : "red"}>
                            {entry.ok
                              ? t("system.ingress.result.ok", "正常")
                              : t("system.ingress.result.fail", "異常")}
                          </Tag>
                        </StructuredListCell>
                        <StructuredListCell>
                          <code className={styles.probeDetail}>{entry.detail}</code>
                        </StructuredListCell>
                      </StructuredListRow>
                    ))}
                  </StructuredListBody>
                </StructuredListWrapper>
              </div>
            )}
          </ContainerCard>
        ) : null}
      </div>
    </div>
  );
};

export default IngressScreen;
