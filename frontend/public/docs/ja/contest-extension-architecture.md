## 目標

このドキュメントでは、現在の Contest フロントエンドアーキテクチャを整理し、将来新しいコンテストタイプ（例：`take_home`）を追加する際の最小限の変更パスを提示します。これにより、システムの高い拡張性（開放閉鎖原則、OCP）を確保し、共通または特殊な判定ロジックが各所に散在することを防ぎます。

## 現在のアーキテクチャ

### 1) コンテストタイプモジュール層（Contest Type Module）

これは、フロントエンドのルーティングとレンダリング決定の唯一の情報源 (Single Source of Truth) です。特定のコンテストタイプに特化したすべてのロジックは、共通コンポーネントやポリシーにハードコーディングするのではなく、対応するモジュール内にカプセル化される必要があります。

- `modules/types.ts`
  - `ContestTypeModule` 契約を定義（`student` と `admin` 両側のインターフェースを含む）。
- `modules/registry.ts`
  - `contestType -> module` の登録センター。
- `modules/CodingModule.tsx`
- `modules/PaperExamModule.tsx`

**モジュールの責任：**

- **Student：**
  - 使用可能なタブを決定（`getTabs`）。
  - 特化タブのレンダリングロジックを決定（`getTabRenderers`）。
  - 解答エントリの動的ルートを決定（`getAnsweringEntryPath`）。
- **Admin：**
  - 使用可能なパネルを決定（`getAvailablePanels`）。
  - 特定パネルのレンダリングコンポーネントを決定（`getPanelRenderers`）。
  - エディタの種類（`editorKind`）とエクスポートオプション（`getExportTargets`）を決定。
  - JSON インポートアクションの表示タイミングを決定（`shouldShowJsonActions`）。

### 2) レンダリング分担層 (Renderer Registries)

Dashboard コンテナが肥大化するのを防ぐため、Registry パターンによる動的レンダリング分担を採用しています。

- **Student タブレンダリング (`StudentTabRendererRegistry.tsx`)**
  - `contentKind` を対応する React コンポーネントにマッピングします。
  - モジュールが `getTabRenderers` を介してデフォルトコンポーネントをオーバーライドすることをサポートします。
- **Admin パネルレンダリング (`AdminPanelRendererRegistry.tsx`)**
  - `AdminPanelId` を対応する React コンポーネント（`logs`, `participants` などの共通パネル）にマッピングします。
  - 差異化されたパネル（`problem_editor`, `statistics` など）については、各モジュールが `getPanelRenderers` を介して動的に提供します。
  - `screens/admin/AdminDashboardScreen.tsx` は純粋な外枠コンテナとなり、`switch(activePanel)` のようなハードコーディングされたロジックは含まれなくなりました。

### 3) 共通ルール層（Domain Policy）

この層には、特定のモジュールの型判定（例：`if (contestType === 'coding')`）を含めることは厳格に**禁止**されています。その職務は、**モジュールをまたぐ共通状態**および**プラグイン的な動作（Plugin / Feature Flag）**の処理に限定されます。

- `contestRuntimePolicy.ts`
  - 参加者であるかどうかの判定（`isContestParticipant`）。
  - 試験ステータスと不正防止監視の判定（`isExamMonitoringActive`, `shouldWarnOnExit`）。
  - *(注：「Submissions タブを表示するかどうか」といったドメインロジックは `CodingModule.tsx` に委譲されており、共通 Policy には含まれません。)*
- `contestRoutePolicy.ts`
  - Precheck Gate インターセプトの管理（`shouldRouteToPrecheck`）。
  - 汎用的な解答後の戻りパスの計算（`getSubmitReviewBackPath`）。これはモジュールが提供する `getAnsweringEntryPath` に依存し、動的ルートの正確性を確保します。

## 拡張の原則（遵守必須）

### A. 共通化すべきであり、コンテストタイプごとに重複実装すべきではない
- **不正防止メカニズム (Anti-Cheat / Precheck)**: その起動の有無は `contest.cheatDetectionEnabled` という Feature Flag のみに依存すべきであり、**決して**特定の `contestType` に紐付けてはいけません。
- **Dashboard コンテナの骨組み**: `StudentDashboardLayout` および `AdminDashboardLayout`。
- **解答ルートの計算**: `enterExamUseCase` を使用し、モジュールから解析された `answeringEntryPath` を渡すことで、試験開始フローを統一します。

### B. コンテストモジュールが決定すべきである（タイプによって異なり得る）
- どのタブ / パネルを表示するか。
- 専用パネルの React コンポーネント（`getPanelRenderers` を介して注入）。
- 解答エリアへのルートパス。

## 新規コンテストタイプの実装リスト（`take_home` を例に）

1. **モジュールの作成**
   - `modules/TakeHomeModule.tsx` を作成。
   - `ContestTypeModule` インターフェースを実装し、`getTabs` / `getAvailablePanels` でそのモードに必要なリストを返します。
2. **モジュールの登録**
   - `modules/registry.ts` に `take_home: takeHomeContestModule` を追加。
3. **UIのカスタマイズ (必要な場合)**
   - 専用の Admin パネル（例：`TaskEditorLayout`）を実装し、モジュールの `getPanelRenderers` で返します。
   - 専用の解答エントリパス（例：`/take-home/upload`）を実装し、`getAnsweringEntryPath` で返します。
4. **不正防止 Flag の確認**
   - フロントエンドに新たな判定を追加する必要がないことを確認します。バックエンドの `take_home` モードで `cheatDetectionEnabled` がオフであれば、不正防止システムは自動的に非表示になります。
5. **テストの追加**
   - `modules/registry.test.ts` で新しいモジュールの読み込みと動作を検証します。
   - `enterExam.usecase.test.ts` および `contestRoutePolicy.test.ts` で動的ルートの検証を補完します。

---
*補足：Admin パネルのさらなるモジュール化（フェーズ1）および Policy/ルートの疎結合化（フェーズ2）はすべて完了しており、システムは拡張のために中央集権的な Switch 文を維持する必要がなくなりました。*
