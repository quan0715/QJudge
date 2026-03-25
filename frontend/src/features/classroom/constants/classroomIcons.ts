import type React from "react";
import {
  Basketball,
  Book,
  Calculator,
  Catalog,
  ChartLine,
  Chemistry,
  Cloud,
  Code,
  Collaborate,
  ColorPalette,
  Compass,
  DataBase,
  Development,
  Earth,
  Education,
  Favorite,
  GameConsole,
  Globe,
  Headphones,
  Idea,
  Language,
  Laptop,
  Lightning,
  Microscope,
  Music,
  Pen,
  Portfolio,
  ReportData,
  Rocket,
  Run,
  SkillLevel,
  Star,
  Terminal,
  Tools,
  TreeView,
  Trophy,
} from "@carbon/icons-react";

export interface ClassroomIconOption {
  key: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
}

export const CLASSROOM_ICON_OPTIONS: ClassroomIconOption[] = [
  // 學術
  { key: "education", label: "教育", Icon: Education },
  { key: "book", label: "書本", Icon: Book },
  { key: "pen", label: "筆", Icon: Pen },
  { key: "catalog", label: "目錄", Icon: Catalog },
  { key: "microscope", label: "顯微鏡", Icon: Microscope },
  { key: "chemistry", label: "化學", Icon: Chemistry },
  { key: "calculator", label: "計算機", Icon: Calculator },
  { key: "language", label: "語言", Icon: Language },
  { key: "globe", label: "全球", Icon: Globe },
  { key: "earth", label: "地球", Icon: Earth },
  // 科技
  { key: "code", label: "程式碼", Icon: Code },
  { key: "terminal", label: "終端機", Icon: Terminal },
  { key: "laptop", label: "電腦", Icon: Laptop },
  { key: "development", label: "開發", Icon: Development },
  { key: "database", label: "資料庫", Icon: DataBase },
  { key: "cloud", label: "雲端", Icon: Cloud },
  { key: "treeview", label: "結構", Icon: TreeView },
  // 資料與商業
  { key: "chartline", label: "圖表", Icon: ChartLine },
  { key: "reportdata", label: "報表", Icon: ReportData },
  { key: "portfolio", label: "作品集", Icon: Portfolio },
  { key: "skilllevel", label: "技能", Icon: SkillLevel },
  // 創意與藝術
  { key: "idea", label: "靈感", Icon: Idea },
  { key: "colorpalette", label: "調色盤", Icon: ColorPalette },
  { key: "music", label: "音樂", Icon: Music },
  { key: "headphones", label: "耳機", Icon: Headphones },
  // 團隊與社交
  { key: "collaborate", label: "協作", Icon: Collaborate },
  { key: "favorite", label: "愛心", Icon: Favorite },
  { key: "star", label: "星星", Icon: Star },
  { key: "tools", label: "工具", Icon: Tools },
  // 運動與活力
  { key: "rocket", label: "火箭", Icon: Rocket },
  { key: "trophy", label: "獎盃", Icon: Trophy },
  { key: "lightning", label: "閃電", Icon: Lightning },
  { key: "compass", label: "指南針", Icon: Compass },
  { key: "basketball", label: "籃球", Icon: Basketball },
  { key: "run", label: "跑步", Icon: Run },
  { key: "gameconsole", label: "遊戲", Icon: GameConsole },
];

const CLASSROOM_ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> =
  Object.fromEntries(CLASSROOM_ICON_OPTIONS.map((o) => [o.key, o.Icon]));

export function getClassroomIcon(key: string | undefined): React.ComponentType<{ size?: number }> {
  return (key && CLASSROOM_ICON_MAP[key]) || Education;
}
