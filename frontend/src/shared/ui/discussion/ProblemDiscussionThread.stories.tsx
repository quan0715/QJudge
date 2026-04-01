import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ProblemDiscussionThread,
  type DiscussionReply,
} from "./ProblemDiscussionThread";

const mockReplies: DiscussionReply[] = [
  {
    id: "r1",
    content: "輸入數字範圍為 1 到 10^9，請注意溢位問題。",
    authorUsername: "Teacher01",
    createdAt: "2024-01-15T11:30:00Z",
    likeCount: 7,
    isLiked: false,
  },
];

const mockNestedReplies: DiscussionReply[] = [
  {
    id: "r1",
    content: "建議使用動態規劃，時間複雜度可以降到 O(n)。",
    authorUsername: "Teacher01",
    createdAt: "2024-01-15T12:30:00Z",
    likeCount: 12,
    isLiked: true,
    replies: [
      {
        id: "r1-1",
        content: "謝謝老師！請問有推薦的參考資料嗎？",
        authorUsername: "Student03",
        createdAt: "2024-01-15T13:00:00Z",
        likeCount: 2,
        isLiked: false,
      },
      {
        id: "r1-2",
        content: "可以參考 LeetCode 的解題討論區，或是演算法筆記網站。",
        authorUsername: "Teacher01",
        createdAt: "2024-01-15T13:30:00Z",
        likeCount: 5,
        isLiked: false,
        replies: [
          {
            id: "r1-2-1",
            content: "太感謝了！我會去研究看看 🙏",
            authorUsername: "Student03",
            createdAt: "2024-01-15T14:00:00Z",
            likeCount: 1,
            isLiked: false,
          },
        ],
      },
    ],
  },
];

const meta: Meta<typeof ProblemDiscussionThread> = {
    title: "shared/ui/discussion/ProblemDiscussionThread",
    component: ProblemDiscussionThread,
    
    args: {
      id: "1",
      content:
        "題目沒有明確說明時間複雜度要求，請問 O(n^2) 的解法可以過嗎？還是需要更優化的解法？",
      problemTitle: "A. Two Sum",
      authorUsername: "Student01",
      createdAt: new Date().toISOString(),
      likeCount: 25,
      isLiked: false,
      canReply: true,
      canDelete: true,
    },
    argTypes: {
      id: { control: "text", description: "ID" },
      content: { control: "text", description: "討論內容" },
      problemTitle: { control: "text", description: "相關題目" },
      authorUsername: { control: "text", description: "作者" },
      likeCount: { control: "number", description: "按讚數" },
      isLiked: { control: "boolean", description: "已按讚" },
      canReply: { control: "boolean", description: "可回覆" },
      canDelete: { control: "boolean", description: "可刪除" },
    },
  
  parameters: {
    docs: { description: { component: '題目討論串元件，顯示討論內容與嵌套回覆，支援按讚、回覆與刪除操作。具有連接線視覺效果。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '使用右側 Controls 面板調整 Props' },
    },
  },
  render: (args) => (
    <ProblemDiscussionThread
      {...args}
      id={args.id ?? "1"}
      content={args.content ?? ""}
      createdAt={args.createdAt ?? new Date().toISOString()}
    />
  ),
};

export const AllStates: Story = {
  parameters: {
    docs: {
      description: { story: '展示各種討論串狀態：無回覆、有回覆、嵌套回覆' },
    },
  },
  render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* No Replies */}
          <ProblemDiscussionThread
            id="1"
            content="請問這題可以使用 HashMap 嗎？我想用 HashMap 來優化查找時間，不確定這樣是否符合題目要求。"
            problemTitle="A. Two Sum"
            authorUsername="Student01"
            createdAt="2024-01-15T10:30:00Z"
            likeCount={25}
            isLiked={false}
            canReply={true}
            canDelete={true}
          />

          {/* With Single Reply */}
          <ProblemDiscussionThread
            id="2"
            content="輸入的數字範圍是多少？題目沒有明確說明輸入範圍，請問需要考慮溢位嗎？"
            problemTitle="B. Add Two Numbers"
            replies={mockReplies}
            authorUsername="Student02"
            createdAt="2024-01-15T11:00:00Z"
            likeCount={18}
            isLiked={true}
            canReply={true}
            canDelete={true}
          />

          {/* With Nested Replies */}
          <ProblemDiscussionThread
            id="3"
            content="我的解法一直 TLE，用了暴力解法，時間複雜度是 O(n^2)，但一直超時。有什麼優化方向嗎？"
            replies={mockNestedReplies}
            authorUsername="Student03"
            createdAt="2024-01-15T12:00:00Z"
            likeCount={42}
            isLiked={false}
            canReply={true}
            canDelete={false}
          />
        </div>
      ),
};

export const Readonly: Story = {
  parameters: {
    docs: {
      description: { story: '唯讀模式，無操作按鈕' },
    },
  },
  render: () => (
        <ProblemDiscussionThread
          id="1"
          content="請問輸出需要換行嗎？還是只要輸出數字即可？這個在題目說明中沒有看到相關資訊。"
          problemTitle="C. Longest Substring"
          replies={[
            {
              id: "r1",
              content: "輸出只需要一個整數即可，不需要換行。",
              authorUsername: "Admin",
              createdAt: "2024-01-15T09:30:00Z",
              likeCount: 15,
              isLiked: false,
            },
          ]}
          authorUsername="Student01"
          createdAt="2024-01-15T09:00:00Z"
          likeCount={8}
          isLiked={false}
          canReply={false}
          canDelete={false}
        />
      ),
};
