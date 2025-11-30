export interface Problem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  acceptanceRate: number;
  tags: string[];
  description: string;
  descriptionZh: string;
  solved?: boolean;
}

export const mockProblems: Problem[] = [
  {
    id: '1',
    title: 'Two Sum',
    difficulty: 'Easy',
    acceptanceRate: 48.5,
    tags: ['Array', 'Hash Table'],
    solved: true,
    description: `
# Two Sum

Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the *same* element twice.

You can return the answer in any order.

## Example 1:

\`\`\`
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
\`\`\`

## Constraints:

*   \`2 <= nums.length <= 10^4\`
*   \`-10^9 <= nums[i] <= 10^9\`
*   \`-10^9 <= target <= 10^9\`
*   **Only one valid answer exists.**
    `,
    descriptionZh: `
# 兩數之和

給定一個整數陣列 \`nums\` 和一個整數 \`target\`，請返回兩個數字的索引，使得它們相加等於 \`target\`。

你可以假設每個輸入都會有**恰好一個解**，並且你不能使用*相同*的元素兩次。

你可以以任何順序返回答案。

## 範例 1：

\`\`\`
輸入：nums = [2,7,11,15], target = 9
輸出：[0,1]
解釋：因為 nums[0] + nums[1] == 9，我們返回 [0, 1]。
\`\`\`

## 限制條件：

*   \`2 <= nums.length <= 10^4\`
*   \`-10^9 <= nums[i] <= 10^9\`
*   \`-10^9 <= target <= 10^9\`
*   **只存在一個有效答案。**
    `
  },
  {
    id: '2',
    title: 'Add Two Numbers',
    difficulty: 'Medium',
    acceptanceRate: 39.1,
    tags: ['Linked List', 'Math', 'Recursion'],
    solved: false,
    description: `
# Add Two Numbers

You are given two non-empty linked lists representing two non-negative integers. The digits are stored in reverse order, and each of their nodes contains a single digit. Add the two numbers and return the sum as a linked list.

## Example:

\`\`\`
Input: l1 = [2,4,3], l2 = [5,6,4]
Output: [7,0,8]
Explanation: 342 + 465 = 807.
\`\`\`
    `,
    descriptionZh: `
# 兩數相加

給定兩個非空的鏈結串列，代表兩個非負整數。數字以相反順序儲存，每個節點包含一個數字。將兩個數字相加並以鏈結串列形式返回總和。

## 範例：

\`\`\`
輸入：l1 = [2,4,3], l2 = [5,6,4]
輸出：[7,0,8]
解釋：342 + 465 = 807。
\`\`\`
    `
  },
  {
    id: '3',
    title: 'Median of Two Sorted Arrays',
    difficulty: 'Hard',
    acceptanceRate: 35.6,
    tags: ['Array', 'Binary Search', 'Divide and Conquer'],
    solved: false,
    description: `
# Median of Two Sorted Arrays

Given two sorted arrays \`nums1\` and \`nums2\` of size \`m\` and \`n\` respectively, return the median of the two sorted arrays.

## Example:

\`\`\`
Input: nums1 = [1,3], nums2 = [2]
Output: 2.00000
Explanation: merged array = [1,2,3] and median is 2.
\`\`\`
    `,
    descriptionZh: `
# 兩個排序陣列的中位數

給定兩個大小分別為 \`m\` 和 \`n\` 的排序陣列 \`nums1\` 和 \`nums2\`，返回兩個排序陣列的中位數。

## 範例：

\`\`\`
輸入：nums1 = [1,3], nums2 = [2]
輸出：2.00000
解釋：合併陣列 = [1,2,3]，中位數為 2。
\`\`\`
    `
  }
];

export const mockUser = {
  id: 'u1',
  username: 'student1',
  email: 'student1@nycu.edu.tw',
  role: 'student'
};

export interface Contest {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  status: 'active' | 'upcoming' | 'past';
  problems: string[]; // Problem IDs
  participantCount: number;
}

export const mockContests: Contest[] = [
  {
    id: 'c1',
    title: 'NYCU Programming Contest 2025 - Round 1',
    description: 'First round of the annual NYCU programming contest. Test your skills against the best!',
    startTime: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    endTime: new Date(Date.now() + 1000 * 60 * 90), // 90 minutes from now
    status: 'active',
    problems: ['1', '2', '3'],
    participantCount: 156
  },
  {
    id: 'c2',
    title: 'Algorithm Challenge - Week 12',
    description: 'Weekly algorithm practice contest focusing on dynamic programming.',
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 24), // Tomorrow
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 + 1000 * 60 * 120), // Tomorrow + 2 hours
    status: 'upcoming',
    problems: ['1', '2'],
    participantCount: 0
  },
  {
    id: 'c3',
    title: 'Final Exam - Data Structures',
    description: 'Final examination for Data Structures course.',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 7 days ago
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 120), // 7 days ago + 2 hours
    status: 'past',
    problems: ['1', '2', '3'],
    participantCount: 234
  },
  {
    id: 'c4',
    title: 'Beginner\'s Bootcamp',
    description: 'Perfect for those just starting their competitive programming journey.',
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3), // 3 days from now
    endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 180), // 3 days from now + 3 hours
    status: 'upcoming',
    problems: ['1'],
    participantCount: 0
  },
  {
    id: 'c5',
    title: 'Midterm Exam - Algorithms',
    description: 'Midterm examination covering sorting and searching algorithms.',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30 days ago
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30 + 1000 * 60 * 90), // 30 days ago + 90 minutes
    status: 'past',
    problems: ['2', '3'],
    participantCount: 198
  }
];
