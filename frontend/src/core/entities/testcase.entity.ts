/**
 * TestCase Entity
 * 測試案例的統一型別定義
 */

/**
 * 測試案例來源類型
 * - sample: 範例測資（公開）
 * - custom: 自訂測資（使用者建立）
 * - hidden: 隱藏測資（不可見）
 */
export type TestCaseSource = "sample" | "custom" | "hidden";

/**
 * 測試案例基本資料
 * 用於 UI 元件的資料傳遞
 */
export interface TestCaseData {
  /** 唯一識別碼 */
  id: string;
  /** 輸入資料 */
  input: string;
  /** 預期輸出 */
  output: string;
  /** 來源類型 */
  source: TestCaseSource;
  /** 是否為隱藏測資 */
  isHidden?: boolean;
  /** 測資說明（可選） */
  explanation?: string;
  /** 分數權重（可選） */
  score?: number;
  /** 排序順序（可選） */
  order?: number;
}

/**
 * 從 source 判斷是否為範例測資
 */
export const isSampleTestCase = (tc: TestCaseData): boolean => 
  tc.source === "sample";

/**
 * 從 source 判斷是否為自訂測資
 */
export const isCustomTestCase = (tc: TestCaseData): boolean => 
  tc.source === "custom";

/**
 * 從 source 判斷是否為隱藏測資
 */
export const isHiddenTestCase = (tc: TestCaseData): boolean => 
  tc.source === "hidden" || tc.isHidden === true;

/**
 * TestCaseItem - 用於 Solver 元件的測資型別
 * 包含執行結果相關欄位
 */
export interface TestCaseItem {
  /** 唯一識別碼 */
  id: string;
  /** 輸入資料 */
  input: string;
  /** 預期輸出（可選） */
  output?: string;
  /** 是否為範例測資 */
  isSample?: boolean;
  /** 是否為隱藏測資 */
  isHidden?: boolean;
  /** 來源類型 ('public' = sample, 'custom' = user-created) */
  source?: "public" | "custom";
  /** 執行狀態 */
  status?: string;
  /** 執行時間 (ms) */
  execTime?: number;
  /** 記憶體使用 (KB) */
  memoryUsage?: number;
  /** 錯誤訊息 */
  errorMessage?: string;
  /** 實際輸出 */
  actualOutput?: string;
  /** 分數 */
  score?: number;
}
