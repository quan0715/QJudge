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
  Tag,
  Tile,
} from "@carbon/react";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useToast } from "@/shared/contexts";
import { useAuth } from "@/features/auth";
import type { QuestionBank, BankQuestion } from "@/core/entities/question-bank.entity";
import {
  getBank,
  listQuestions,
  subscribe,
  unsubscribe,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { QuestionBankPreviewCard } from "@/features/question-banks/components/QuestionBankPreviewCard";

const MarketplaceBankPreviewScreen = () => {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { showToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [subscribing, setSubscribing] = useState(false);

  const isOwner = bank?.ownerUsername === user?.username;

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
      const nextSubscribed = !bank.isSubscribed;
      setBank((prev) =>
        prev ? { ...prev, isSubscribed: nextSubscribed } : prev,
      );
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: nextSubscribed
          ? t("questionBank.subscribed", "已訂閱")
          : t("questionBank.unsubscribed", "已取消訂閱"),
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
            !isOwner ? (
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
            ) : undefined
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
              String(bank.questionCount),
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
          <Grid fullWidth>
            {questions.map((q) => (
              <Column key={q.id} lg={4} md={4} sm={4}>
                <QuestionBankPreviewCard question={q} bank={bank} />
              </Column>
            ))}
          </Grid>
        )}
      </Column>
    </Grid>
  );
};

export default MarketplaceBankPreviewScreen;
