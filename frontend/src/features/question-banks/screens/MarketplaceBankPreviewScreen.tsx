import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Column,
  Grid,
  Loading,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from "@carbon/react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useToast } from "@/shared/contexts";
import type { QuestionBank, BankQuestion } from "@/core/entities/question-bank.entity";
import {
  getBank,
  listQuestions,
  subscribe,
  unsubscribe,
} from "@/infrastructure/api/repositories/questionBank.repository";

const MarketplaceBankPreviewScreen = () => {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [subscribing, setSubscribing] = useState(false);

  const loadBank = useCallback(async () => {
    if (!bankId) return;
    try {
      setLoading(true);
      const [bankData, questionData] = await Promise.all([
        getBank(bankId),
        listQuestions(bankId),
      ]);
      setBank(bankData);
      setQuestions(questionData);
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setLoading(false);
    }
  }, [bankId, showToast, t]);

  useEffect(() => {
    void loadBank();
  }, [loadBank]);

  const handleToggleSubscribe = async () => {
    if (!bank) return;
    setSubscribing(true);
    try {
      if (bank.isSubscribed) {
        await unsubscribe(bank.id);
      } else {
        await subscribe(bank.id);
      }
      setBank((prev) =>
        prev ? { ...prev, isSubscribed: !prev.isSubscribed } : prev
      );
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: bank.isSubscribed
          ? t("questionBank.unsubscribed", "已取消訂閱")
          : t("questionBank.subscribed", "已訂閱"),
      });
    } catch (err: any) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: err?.message || t("message.error"),
      });
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", marginTop: "4rem" }}>
        <Loading withOverlay={false} description={t("message.loading")} />
      </div>
    );
  }

  if (!bank) {
    return (
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <Tile>{t("questionBank.notFound", "找不到此題庫")}</Tile>
        </Column>
      </Grid>
    );
  }

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4}>
        <Breadcrumb noTrailingSlash>
          <BreadcrumbItem onClick={() => navigate("/marketplace")} href="#">
            {t("nav.marketplace", "Marketplace")}
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{bank.name}</BreadcrumbItem>
        </Breadcrumb>
      </Column>

      <Column lg={16} md={8} sm={4}>
        <PageHeader
          title={bank.name}
          subtitle={bank.description}
          action={
            <Button
              kind={bank.isSubscribed ? "secondary" : "primary"}
              size="sm"
              disabled={subscribing}
              onClick={handleToggleSubscribe}
            >
              {bank.isSubscribed
                ? t("questionBank.subscribedBtn", "已訂閱")
                : t("questionBank.subscribeBtn", "訂閱")}
            </Button>
          }
        />
      </Column>

      <Column lg={16} md={8} sm={4}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <Tag type="blue">
            {bank.category === "coding"
              ? t("questionBank.categoryCoding", "程式題")
              : t("questionBank.categoryExam", "考卷題")}
          </Tag>
          <Tag type="gray">
            {t("questionBank.questionCountLabel", "{{count}} 題").replace(
              "{{count}}",
              String(bank.questionCount)
            )}
          </Tag>
          {bank.verified && <Tag type="green">{t("questionBank.verified", "已認證")}</Tag>}
          {bank.ownerUsername && (
            <Tag type="cool-gray">{bank.ownerUsername}</Tag>
          )}
        </div>
      </Column>

      <Column lg={16} md={8} sm={4}>
        {questions.length === 0 ? (
          <Tile>{t("questionBank.emptyQuestions", "此題庫目前沒有題目。")}</Tile>
        ) : (
          <StructuredListWrapper>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>{t("table.title")}</StructuredListCell>
                <StructuredListCell head>{t("questionBank.difficulty", "難度")}</StructuredListCell>
                <StructuredListCell head>{t("questionBank.type", "類型")}</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {questions.map((q) => (
                <StructuredListRow key={q.id}>
                  <StructuredListCell>{q.title || t("questionBank.untitled", "未命名")}</StructuredListCell>
                  <StructuredListCell>
                    <Tag size="sm" type="gray">{q.difficulty}</Tag>
                  </StructuredListCell>
                  <StructuredListCell>
                    {q.questionType === "coding"
                      ? t("questionBank.categoryCoding", "程式題")
                      : t("questionBank.categoryExam", "考卷題")}
                  </StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        )}
      </Column>
    </Grid>
  );
};

export default MarketplaceBankPreviewScreen;
