# Marketplace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `/question-banks` list page, add a marketplace preview page with subscription, a teacher publish flow, and integrate subscribed banks into the Contest Editor.

**Architecture:** Five independent work streams: (1) remove list page + adjust routing/sidebar, (2) backend subscription model + API, (3) frontend marketplace preview page, (4) teacher publish UI in settings panel, (5) Contest Editor integration with subscribed banks.

**Tech Stack:** Django REST Framework (backend), React + Carbon Design System (frontend), react-router-dom, react-i18next

---

### Task 1: Remove `/question-banks` List Page & Adjust Routing

**Files:**
- Delete: `frontend/src/features/question-banks/screens/QuestionBanksScreen.tsx`
- Delete: `frontend/src/features/question-banks/screens/QuestionBanksScreen.module.scss`
- Modify: `frontend/src/features/question-banks/routes.tsx`
- Modify: `frontend/src/features/question-banks/index.ts`
- Modify: `frontend/src/App.tsx:158-166`
- Modify: `frontend/src/features/app/components/SideMenu.tsx:129-148`

- [ ] **Step 1: Update `routes.tsx` — remove list route, keep marketplace and detail**

Replace the full content of `frontend/src/features/question-banks/routes.tsx`:

```tsx
import { Route } from "react-router-dom";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";
import QuestionBankMarketplaceScreen from "./screens/QuestionBankMarketplaceScreen";

export const questionBankMarketplaceRoute = (
  <Route path="/marketplace" element={<QuestionBankMarketplaceScreen />} />
);

export const questionBankDetailRoute = (
  <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
);
```

- [ ] **Step 2: Update `index.ts` — remove old export, add new**

Replace the full content of `frontend/src/features/question-banks/index.ts`:

```tsx
export { questionBankMarketplaceRoute, questionBankDetailRoute } from "./routes";
export { default as QuestionBankMarketplaceScreen } from "./screens/QuestionBankMarketplaceScreen";
export { BankGalleryCard } from "./components/BankGalleryCard";
```

- [ ] **Step 3: Update `App.tsx` — replace `questionBankListRoute` with `questionBankMarketplaceRoute`**

In `frontend/src/App.tsx`, change the import (line 41):

```tsx
// Before:
import { questionBankListRoute, questionBankDetailRoute } from "@/features/question-banks";
// After:
import { questionBankMarketplaceRoute, questionBankDetailRoute } from "@/features/question-banks";
```

In the route mount (around line 161), replace `{questionBankListRoute}` with `{questionBankMarketplaceRoute}`.

- [ ] **Step 4: Update `SideMenu.tsx` — remove "Question Banks" parent link**

In `frontend/src/features/app/components/SideMenu.tsx`, remove the "Question Banks" button block (lines 131-139):

```tsx
// DELETE this block:
<button
  type="button"
  className={`side-menu__link${isActive("/question-banks") ? " side-menu__link--active" : ""}`}
  onClick={() => go("/question-banks")}
>
  <Book size={16} />
  <span>{t("nav.questionBanks")}</span>
</button>
```

Keep the "Marketplace" button and the individual bank list section unchanged.

- [ ] **Step 5: Delete the list page files**

```bash
rm frontend/src/features/question-banks/screens/QuestionBanksScreen.tsx
rm frontend/src/features/question-banks/screens/QuestionBanksScreen.module.scss
```

- [ ] **Step 6: Verify the app compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors. If there are import errors referencing `questionBankListRoute`, fix them.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/features/question-banks/screens/QuestionBanksScreen.tsx \
  frontend/src/features/question-banks/screens/QuestionBanksScreen.module.scss \
  frontend/src/features/question-banks/routes.tsx \
  frontend/src/features/question-banks/index.ts \
  frontend/src/App.tsx \
  frontend/src/features/app/components/SideMenu.tsx
git commit -m "feat: remove /question-banks list page, keep marketplace and detail routes"
```

---

### Task 2: Backend — Subscription Model, Migration, and API

**Files:**
- Modify: `backend/apps/question_bank/models.py`
- Create: `backend/apps/question_bank/migrations/XXXX_add_question_bank_subscription.py` (auto-generated)
- Modify: `backend/apps/question_bank/serializers.py`
- Modify: `backend/apps/question_bank/views.py`
- Modify: `backend/apps/question_bank/urls.py`

- [ ] **Step 1: Add `QuestionBankSubscription` model**

Add to the end of `backend/apps/question_bank/models.py`, before any closing comments:

```python
class QuestionBankSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bank_subscriptions",
    )
    bank = models.ForeignKey(
        QuestionBank,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "question_bank_subscriptions"
        constraints = [
            UniqueConstraint(
                fields=["user", "bank"],
                name="unique_subscription_per_user_bank",
            ),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id}:{self.bank_id}"
```

- [ ] **Step 2: Generate and run the migration**

```bash
cd backend
python manage.py makemigrations question_bank --name add_question_bank_subscription
python manage.py migrate
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Add `is_subscribed` to `QuestionBankSerializer`**

In `backend/apps/question_bank/serializers.py`, add to `QuestionBankSerializer`:

```python
class QuestionBankSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="uuid", read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)
    question_count = serializers.SerializerMethodField()
    is_subscribed = serializers.SerializerMethodField()

    class Meta:
        model = QuestionBank
        fields = [
            "id",
            "name",
            "description",
            "icon",
            "cover_url",
            "category",
            "visibility",
            "verified",
            "review_status",
            "review_note",
            "submitted_at",
            "reviewed_at",
            "reviewed_by_username",
            "owner",
            "owner_username",
            "question_count",
            "is_subscribed",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "owner_username",
            "verified",
            "review_status",
            "review_note",
            "submitted_at",
            "reviewed_at",
            "reviewed_by_username",
            "question_count",
            "is_subscribed",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj):
        if hasattr(obj, "question_count"):
            return obj.question_count
        return obj.questions.count()

    def get_is_subscribed(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if hasattr(obj, "_is_subscribed"):
            return obj._is_subscribed
        from .models import QuestionBankSubscription
        return QuestionBankSubscription.objects.filter(
            user=request.user, bank=obj
        ).exists()
```

Also add the same `is_subscribed` field to `ExploreBankItemSerializer` with the same `get_is_subscribed` method (copy the method).

- [ ] **Step 4: Add subscribe/unsubscribe/list-subscribed view actions**

In `backend/apps/question_bank/views.py`, add these imports at the top:

```python
from .models import QuestionBank, Question, QuestionBankMembership, QuestionBankSubscription
```

Add these actions to `QuestionBankViewSet`:

```python
@action(detail=True, methods=["post"], url_path="subscribe")
def subscribe(self, request, uuid=None, pk=None):
    bank = self.get_object()
    if not is_publicly_accessible_bank(bank):
        raise PermissionDenied("Bank is not available for subscription.")
    if bank.owner_id == request.user.id:
        raise DRFValidationError("Cannot subscribe to your own bank.")
    _, created = QuestionBankSubscription.objects.get_or_create(
        user=request.user, bank=bank,
    )
    if not created:
        raise DRFValidationError("Already subscribed.")
    return Response({"subscribed": True}, status=status.HTTP_201_CREATED)

@action(detail=True, methods=["delete"], url_path="subscribe")
def unsubscribe(self, request, uuid=None, pk=None):
    bank = self.get_object()
    deleted, _ = QuestionBankSubscription.objects.filter(
        user=request.user, bank=bank,
    ).delete()
    if not deleted:
        raise DRFValidationError("Not subscribed.")
    return Response({"subscribed": False}, status=status.HTTP_200_OK)

@action(detail=False, methods=["get"], url_path="subscribed")
def subscribed(self, request):
    bank_ids = QuestionBankSubscription.objects.filter(
        user=request.user,
    ).values_list("bank_id", flat=True)
    queryset = (
        QuestionBank.objects.filter(id__in=bank_ids, is_archived=False)
        .annotate(question_count=Count("questions", distinct=True))
    )
    serializer = QuestionBankSerializer(
        queryset, many=True, context={"request": request}
    )
    return Response({"count": len(serializer.data), "results": serializer.data})
```

- [ ] **Step 5: Pass request context to serializers in existing views**

In `QuestionBankViewSet`, update the `explore` and `review_queue` actions to pass context:

```python
# In explore():
serializer = ExploreBankItemSerializer(queryset, many=True, context={"request": request})

# In review_queue():
serializer = QuestionBankSerializer(queryset, many=True, context={"request": request})
```

Also update `retrieve` — the default ModelViewSet already passes context, so this should work. Verify by checking the `get_serializer` calls.

- [ ] **Step 6: Update `get_queryset` for subscribe/unsubscribe actions**

In `QuestionBankViewSet.get_queryset()`, add before the final return:

```python
if self.action in ("subscribe", "unsubscribe"):
    return (
        QuestionBank.objects.filter(is_archived=False)
        .annotate(question_count=Count("questions", distinct=True))
    )
```

- [ ] **Step 7: Verify backend compiles and migrations work**

```bash
cd backend
python manage.py check
python manage.py showmigrations question_bank
```

Expected: System check identifies no issues. Migration shows as applied.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/question_bank/models.py \
  backend/apps/question_bank/migrations/ \
  backend/apps/question_bank/serializers.py \
  backend/apps/question_bank/views.py
git commit -m "feat: add QuestionBankSubscription model and subscribe/unsubscribe/subscribed API endpoints"
```

---

### Task 3: Frontend — Subscription API Repository

**Files:**
- Modify: `frontend/src/core/entities/question-bank.entity.ts`
- Modify: `frontend/src/infrastructure/api/repositories/questionBank.repository.ts`

- [ ] **Step 1: Add `isSubscribed` to `QuestionBank` entity**

In `frontend/src/core/entities/question-bank.entity.ts`, add to the `QuestionBank` interface:

```typescript
export interface QuestionBank {
  // ... existing fields ...
  questionCount: number;
  isSubscribed?: boolean;  // <-- add this
  createdAt?: string;
  updatedAt?: string;
}
```

Also add `isSubscribed` to `ExploreBankItem`:

```typescript
export interface ExploreBankItem extends QuestionBank {
  source: "platform";
}
```

(No change needed since it extends `QuestionBank` which now has `isSubscribed`.)

- [ ] **Step 2: Add subscribe/unsubscribe/listSubscribed to repository**

In `frontend/src/infrastructure/api/repositories/questionBank.repository.ts`, add these functions:

```typescript
export const subscribe = async (bankId: string): Promise<void> => {
  await requestJson(
    httpClient.post(`/api/v1/question-banks/${bankId}/subscribe/`),
    "Failed to subscribe"
  );
};

export const unsubscribe = async (bankId: string): Promise<void> => {
  await requestJson(
    httpClient.delete(`/api/v1/question-banks/${bankId}/subscribe/`),
    "Failed to unsubscribe"
  );
};

export const listSubscribed = async (): Promise<QuestionBank[]> => {
  const responseData = await requestJson<{ results: QuestionBankDto[] }>(
    httpClient.get("/api/v1/question-banks/subscribed/"),
    "Failed to list subscribed banks"
  );
  return responseData.results.map(mapQuestionBankDto);
};
```

Also add them to the `questionBankRepository` export object:

```typescript
export const questionBankRepository = {
  // ... existing entries ...
  subscribe,
  unsubscribe,
  listSubscribed,
};
```

- [ ] **Step 3: Ensure `mapQuestionBankDto` maps `isSubscribed`**

Check the existing `mapQuestionBankDto` function in the repository file. If it manually maps fields, add `isSubscribed: dto.is_subscribed ?? false`. If it uses a generic mapper or passes through directly with camelCase conversion, verify the field comes through.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/entities/question-bank.entity.ts \
  frontend/src/infrastructure/api/repositories/questionBank.repository.ts
git commit -m "feat: add subscribe/unsubscribe/listSubscribed to frontend API repository"
```

---

### Task 4: Marketplace Preview Page (`/marketplace/:bankId`)

**Files:**
- Create: `frontend/src/features/question-banks/screens/MarketplaceBankPreviewScreen.tsx`
- Modify: `frontend/src/features/question-banks/routes.tsx`
- Modify: `frontend/src/features/question-banks/index.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `MarketplaceBankPreviewScreen.tsx`**

Create `frontend/src/features/question-banks/screens/MarketplaceBankPreviewScreen.tsx`:

```tsx
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
import { ArrowLeft } from "@carbon/icons-react";
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
```

- [ ] **Step 2: Add route for `/marketplace/:bankId`**

Update `frontend/src/features/question-banks/routes.tsx` — replace `questionBankMarketplaceRoute`:

```tsx
import { Route } from "react-router-dom";
import QuestionBankDetailScreen from "./screens/QuestionBankDetailScreen";
import QuestionBankMarketplaceScreen from "./screens/QuestionBankMarketplaceScreen";
import MarketplaceBankPreviewScreen from "./screens/MarketplaceBankPreviewScreen";

export const questionBankMarketplaceRoute = (
  <>
    <Route path="/marketplace" element={<QuestionBankMarketplaceScreen />} />
    <Route path="/marketplace/:bankId" element={<MarketplaceBankPreviewScreen />} />
  </>
);

export const questionBankDetailRoute = (
  <Route path="/question-banks/:bankId" element={<QuestionBankDetailScreen />} />
);
```

- [ ] **Step 3: Update marketplace list page to navigate to preview**

In `frontend/src/features/question-banks/screens/QuestionBankMarketplaceScreen.tsx`, change line 84:

```tsx
// Before:
onClick={() => navigate(`/question-banks/${bank.id}?from=explore`)}
// After:
onClick={() => navigate(`/marketplace/${bank.id}`)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/question-banks/screens/MarketplaceBankPreviewScreen.tsx \
  frontend/src/features/question-banks/routes.tsx \
  frontend/src/features/question-banks/screens/QuestionBankMarketplaceScreen.tsx
git commit -m "feat: add /marketplace/:bankId preview page with subscribe button"
```

---

### Task 5: Teacher Publish Flow — Settings Panel UI

**Files:**
- Modify: `frontend/src/features/question-banks/components/QuestionBankSettingsGeneralPanel.tsx`

- [ ] **Step 1: Add publish section to settings panel**

In `frontend/src/features/question-banks/components/QuestionBankSettingsGeneralPanel.tsx`, add imports:

```tsx
import { Button, Tag as CarbonTag } from "@carbon/react";
import { submitForReview } from "@/infrastructure/api/repositories/questionBank.repository";
```

Add state inside the component:

```tsx
const [submitting, setSubmitting] = useState(false);

const handleSubmitForReview = async () => {
  setSubmitting(true);
  try {
    await submitForReview(bank.id);
    await onRefresh();
    showToast({
      kind: "success",
      title: t("message.success"),
      subtitle: t("questionBank.submitForReviewSuccess", "已提交審核申請"),
    });
  } catch (err: any) {
    showToast({
      kind: "error",
      title: t("message.error"),
      subtitle: err?.message || t("message.error"),
    });
  } finally {
    setSubmitting(false);
  }
};
```

Add a new `<Section>` block after the "Other Info" section in the JSX return:

```tsx
<Section title={t("questionBank.marketplace", "Marketplace")}>
  <ActionRow label={t("questionBank.reviewStatusLabel", "上架狀態")}>
    {bank.reviewStatus === "draft" && (
      <Button
        kind="primary"
        size="sm"
        disabled={submitting || bank.questionCount === 0}
        onClick={handleSubmitForReview}
      >
        {t("questionBank.applyToMarketplace", "申請上架")}
      </Button>
    )}
    {bank.reviewStatus === "rejected" && (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <CarbonTag type="red">{t("questionBank.rejected", "已被退回")}</CarbonTag>
        <Button
          kind="primary"
          size="sm"
          disabled={submitting || bank.questionCount === 0}
          onClick={handleSubmitForReview}
        >
          {t("questionBank.reapply", "重新申請")}
        </Button>
      </div>
    )}
    {bank.reviewStatus === "pending" && (
      <CarbonTag type="blue">{t("questionBank.pendingReview", "審核中")}</CarbonTag>
    )}
    {bank.reviewStatus === "approved" && (
      <CarbonTag type="green">{t("questionBank.published", "已上架")}</CarbonTag>
    )}
  </ActionRow>
  {bank.reviewNote && (
    <ActionRow label={t("questionBank.reviewNoteLabel", "審核備註")}>
      <span>{bank.reviewNote}</span>
    </ActionRow>
  )}
  {bank.reviewStatus === "draft" && bank.questionCount === 0 && (
    <ActionRow label="">
      <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
        {t("questionBank.needQuestionsToApply", "至少需要 1 題才能申請上架")}
      </span>
    </ActionRow>
  )}
</Section>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/question-banks/components/QuestionBankSettingsGeneralPanel.tsx
git commit -m "feat: add marketplace publish flow UI to bank settings panel"
```

---

### Task 6: Contest Editor — Integrate Subscribed Banks

**Files:**
- Modify: `frontend/src/features/contest/components/admin/examEditor/QuestionBankImportModal.tsx`
- Modify: `frontend/src/features/contest/components/admin/examEditor/QuestionSourcePanel.tsx`

- [ ] **Step 1: Update `QuestionBankImportModal.tsx` — load subscribed banks**

In `frontend/src/features/contest/components/admin/examEditor/QuestionBankImportModal.tsx`, add import:

```tsx
import { listSubscribed } from "@/infrastructure/api/repositories/questionBank.repository";
```

Update the `loadBanks` function to merge subscribed banks:

```tsx
const loadBanks = useCallback(async () => {
  setLoadingBanks(true);
  setError(null);
  try {
    const [mine, subscribed] = await Promise.all([listMine(), listSubscribed()]);
    const filteredMine = mine.filter((bank) => bank.category === category);
    const filteredSubscribed = subscribed.filter((bank) => bank.category === category);
    const merged = [
      ...filteredMine.map((b) => ({ ...b, _source: "mine" as const })),
      ...filteredSubscribed.map((b) => ({ ...b, _source: "subscribed" as const })),
    ];
    setBanks(merged);
    if (merged.length > 0) {
      setSelectedBankId((prev) => prev || merged[0].id);
    } else {
      setSelectedBankId("");
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : "Failed to load question banks");
  } finally {
    setLoadingBanks(false);
  }
}, [category]);
```

Update the bank dropdown `itemToString` to show the source:

```tsx
itemToString={(item) =>
  item
    ? `${item.name}${(item as any)._source === "subscribed" ? " (Subscribed)" : ""}`
    : ""
}
```

- [ ] **Step 2: Update `QuestionSourcePanel.tsx` — load subscribed banks**

In `frontend/src/features/contest/components/admin/examEditor/QuestionSourcePanel.tsx`, add import:

```tsx
import { listSubscribed } from "@/infrastructure/api/repositories/questionBank.repository";
```

Update the `loadBanks` function:

```tsx
const loadBanks = useCallback(async () => {
  setLoadingBanks(true);
  setError(null);
  try {
    const [mine, subscribed] = await Promise.all([listMine(), listSubscribed()]);
    const filteredMine = mine.filter((bank) => bank.category === bankCategory);
    const filteredSubscribed = subscribed.filter((bank) => bank.category === bankCategory);
    const merged = [
      ...filteredMine.map((b) => ({ ...b, _source: "mine" as const })),
      ...filteredSubscribed.map((b) => ({ ...b, _source: "subscribed" as const })),
    ];
    setBanks(merged);
    if (merged.length > 0) {
      setSelectedBankId((prev) => prev || merged[0].id);
    } else {
      setSelectedBankId("");
    }
  } catch (fetchError) {
    setError(
      fetchError instanceof Error
        ? fetchError.message
        : t("examEditor.sourceLoadFailed", "載入題庫來源失敗")
    );
  } finally {
    setLoadingBanks(false);
  }
}, [bankCategory, t]);
```

Update the bank Dropdown `itemToString`:

```tsx
itemToString={(item) =>
  item
    ? `${item.name}${(item as any)._source === "subscribed" ? ` (${t("questionBank.subscribedLabel", "已訂閱")})` : ""}`
    : ""
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/contest/components/admin/examEditor/QuestionBankImportModal.tsx \
  frontend/src/features/contest/components/admin/examEditor/QuestionSourcePanel.tsx
git commit -m "feat: integrate subscribed banks into Contest Editor question sources"
```

---

### Task 7: i18n — Add New Translation Keys

**Files:**
- Modify: `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Modify: `frontend/src/i18n/locales/ko/common.json`

- [ ] **Step 1: Add keys to `en/common.json`**

Add these keys under the `questionBank` section:

```json
"subscribeBtn": "Subscribe",
"subscribedBtn": "Subscribed",
"subscribed": "Subscribed",
"unsubscribed": "Unsubscribed",
"subscribedLabel": "Subscribed",
"verified": "Verified",
"notFound": "Question bank not found.",
"emptyQuestions": "This question bank has no questions yet.",
"questionCountLabel": "{{count}} questions",
"difficulty": "Difficulty",
"type": "Type",
"untitled": "Untitled",
"marketplace": "Marketplace",
"reviewStatusLabel": "Listing Status",
"applyToMarketplace": "Apply to Marketplace",
"reapply": "Reapply",
"pendingReview": "Under Review",
"published": "Published",
"rejected": "Rejected",
"reviewNoteLabel": "Review Note",
"needQuestionsToApply": "At least 1 question is required to apply",
"submitForReviewSuccess": "Review application submitted"
```

- [ ] **Step 2: Add keys to `zh-TW/common.json`**

```json
"subscribeBtn": "訂閱",
"subscribedBtn": "已訂閱",
"subscribed": "已訂閱",
"unsubscribed": "已取消訂閱",
"subscribedLabel": "已訂閱",
"verified": "已認證",
"notFound": "找不到此題庫",
"emptyQuestions": "此題庫目前沒有題目。",
"questionCountLabel": "{{count}} 題",
"difficulty": "難度",
"type": "類型",
"untitled": "未命名",
"marketplace": "Marketplace",
"reviewStatusLabel": "上架狀態",
"applyToMarketplace": "申請上架",
"reapply": "重新申請",
"pendingReview": "審核中",
"published": "已上架",
"rejected": "已被退回",
"reviewNoteLabel": "審核備註",
"needQuestionsToApply": "至少需要 1 題才能申請上架",
"submitForReviewSuccess": "已提交審核申請"
```

- [ ] **Step 3: Add keys to `ja/common.json` and `ko/common.json`**

For `ja`:
```json
"subscribeBtn": "購読",
"subscribedBtn": "購読中",
"subscribed": "購読しました",
"unsubscribed": "購読を解除しました",
"subscribedLabel": "購読中",
"verified": "認証済み",
"notFound": "問題バンクが見つかりません",
"emptyQuestions": "この問題バンクにはまだ問題がありません。",
"questionCountLabel": "{{count}} 問",
"difficulty": "難易度",
"type": "タイプ",
"untitled": "無題",
"marketplace": "マーケットプレイス",
"reviewStatusLabel": "掲載ステータス",
"applyToMarketplace": "掲載を申請",
"reapply": "再申請",
"pendingReview": "審査中",
"published": "掲載中",
"rejected": "差し戻し",
"reviewNoteLabel": "審査コメント",
"needQuestionsToApply": "申請には1問以上が必要です",
"submitForReviewSuccess": "審査申請を送信しました"
```

For `ko`:
```json
"subscribeBtn": "구독",
"subscribedBtn": "구독 중",
"subscribed": "구독했습니다",
"unsubscribed": "구독을 취소했습니다",
"subscribedLabel": "구독 중",
"verified": "인증됨",
"notFound": "문제 은행을 찾을 수 없습니다",
"emptyQuestions": "이 문제 은행에는 아직 문제가 없습니다.",
"questionCountLabel": "{{count}} 문제",
"difficulty": "난이도",
"type": "유형",
"untitled": "제목 없음",
"marketplace": "마켓플레이스",
"reviewStatusLabel": "등록 상태",
"applyToMarketplace": "마켓플레이스에 등록 신청",
"reapply": "재신청",
"pendingReview": "심사 중",
"published": "등록됨",
"rejected": "반려됨",
"reviewNoteLabel": "심사 메모",
"needQuestionsToApply": "신청하려면 1개 이상의 문제가 필요합니다",
"submitForReviewSuccess": "심사 신청이 제출되었습니다"
```

- [ ] **Step 4: Run i18n sync check**

```bash
cd frontend && npm run check:i18n
```

Expected: All keys in sync across locales.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/
git commit -m "feat: add i18n keys for marketplace subscription and publish flow"
```

---

### Task 8: Clean Up Unused i18n Keys

**Files:**
- Modify: `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/i18n/locales/zh-TW/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Modify: `frontend/src/i18n/locales/ko/common.json`

- [ ] **Step 1: Identify keys only used by deleted `QuestionBanksScreen`**

Search the codebase for usage of these keys (grep for the key strings). Remove keys that have zero remaining references:

- `questionBank.tabs.mine`
- `questionBank.tabs.inbox`
- `questionBank.tabs.review`
- `questionBank.emptyMine`
- `questionBank.subtitle`
- `questionBank.inbox.*` (all inbox sub-keys)
- `questionBank.emptyReviewQueue`

Only remove keys confirmed to have no other usage.

- [ ] **Step 2: Run i18n sync check**

```bash
cd frontend && npm run check:i18n
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/
git commit -m "chore: remove unused i18n keys from deleted question bank list page"
```
