import type { Problem } from './mockData';

export interface Contest {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: 'upcoming' | 'running' | 'ended';
  isPrivate: boolean; // If true, requires password
  password?: string;
  registeredUsers: string[]; // List of user IDs
  enteredUsers: string[]; // List of user IDs who have entered
  leftUsers: string[]; // List of user IDs who have left (cannot re-enter)
}

export interface ContestProblem extends Problem {
  score: number;
}

// Mock Data
const MOCK_CONTESTS: Contest[] = [
  {
    id: '1',
    title: '2024 期中程式設計競賽',
    description: '本次競賽範圍涵蓋基礎演算法與資料結構。',
    startTime: new Date(Date.now() - 3600000).toISOString(), // Started 1 hour ago
    endTime: new Date(Date.now() + 7200000).toISOString(), // Ends in 2 hours
    status: 'running',
    isPrivate: false,
    registeredUsers: ['current_user'],
    enteredUsers: [],
    leftUsers: []
  },
  {
    id: '2',
    title: '演算法進階挑戰賽',
    description: '需輸入密碼才能參加。密碼：123456',
    startTime: new Date(Date.now() + 86400000).toISOString(), // Starts tomorrow
    endTime: new Date(Date.now() + 90000000).toISOString(),
    status: 'upcoming',
    isPrivate: true,
    password: '123456',
    registeredUsers: [],
    enteredUsers: [],
    leftUsers: []
  },
  {
    id: '3',
    title: '週末練習賽 (已結束)',
    description: '自由練習。',
    startTime: new Date(Date.now() - 172800000).toISOString(),
    endTime: new Date(Date.now() - 86400000).toISOString(),
    status: 'ended',
    isPrivate: false,
    registeredUsers: ['current_user'],
    enteredUsers: [],
    leftUsers: []
  }
];

const MOCK_CONTEST_PROBLEMS: Record<string, ContestProblem[]> = {
  '1': [
    { 
      id: '1', 
      title: 'Two Sum', 
      difficulty: 'Easy', 
      acceptanceRate: 45, 
      solved: false, 
      score: 100,
      tags: ['Array', 'Hash Table'],
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      descriptionZh: '給定一個整數陣列 nums 和一個整數 target，請返回兩個數字的索引，使得它們相加等於 target。'
    },
    { 
      id: '2', 
      title: 'Fibonacci Number', 
      difficulty: 'Easy', 
      acceptanceRate: 60, 
      solved: true, 
      score: 100,
      tags: ['Math', 'Dynamic Programming'],
      description: 'The Fibonacci numbers, commonly denoted F(n) form a sequence, called the Fibonacci sequence, such that each number is the sum of the two preceding ones.',
      descriptionZh: '斐波那契數，通常用 F(n) 表示，形成一個序列，稱為斐波那契數列，使得每個數字是前兩個數字的總和。'
    },
    { 
      id: '3', 
      title: 'Longest Substring', 
      difficulty: 'Medium', 
      acceptanceRate: 32, 
      solved: false, 
      score: 200,
      tags: ['String', 'Sliding Window'],
      description: 'Given a string s, find the length of the longest substring without repeating characters.',
      descriptionZh: '給定一個字串 s，請找出其中不包含重複字元的最長子字串的長度。'
    },
  ],
  '2': [
    { 
      id: '4', 
      title: 'Median of Two Sorted Arrays', 
      difficulty: 'Hard', 
      acceptanceRate: 25, 
      solved: false, 
      score: 300,
      tags: ['Array', 'Binary Search'],
      description: 'Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays.',
      descriptionZh: '給定兩個大小分別為 m 和 n 的排序陣列 nums1 和 nums2，返回兩個排序陣列的中位數。'
    },
  ]
};

// Simulate Local Storage Persistence for Demo
const getStoredContests = (): Contest[] => {
  const stored = localStorage.getItem('mock_contests');
  if (stored) return JSON.parse(stored);
  localStorage.setItem('mock_contests', JSON.stringify(MOCK_CONTESTS));
  return MOCK_CONTESTS;
};

const saveContests = (contests: Contest[]) => {
  localStorage.setItem('mock_contests', JSON.stringify(contests));
};

export const mockContestService = {
  getContests: async (): Promise<Contest[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(getStoredContests()), 500);
    });
  },

  getContest: async (id: string): Promise<Contest | undefined> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const contests = getStoredContests();
        resolve(contests.find(c => c.id === id));
      }, 300);
    });
  },

  isRegistered: (contestId: string): boolean => {
    const contests = getStoredContests();
    const contest = contests.find(c => c.id === contestId);
    return contest ? contest.registeredUsers.includes('current_user') : false;
  },

  hasLeftContest: (contestId: string): boolean => {
    const contests = getStoredContests();
    const contest = contests.find(c => c.id === contestId);
    return contest ? contest.leftUsers.includes('current_user') : false;
  },

  register: async (contestId: string, password?: string): Promise<{ success: boolean; message?: string }> => {
    const contests = getStoredContests();
    const contest = contests.find(c => c.id === contestId);
    if (!contest) return { success: false, message: 'Contest not found' };

    if (contest.isPrivate && contest.password !== password) {
      return { success: false, message: '密碼錯誤' };
    }

    if (!contest.registeredUsers.includes('current_user')) {
      contest.registeredUsers.push('current_user');
      saveContests(contests);
    }
    return { success: true };
  },

  enterContest: async (contestId: string): Promise<{ success: boolean; message?: string }> => {
    const contests = getStoredContests();
    const contest = contests.find(c => c.id === contestId);
    if (!contest) return { success: false, message: 'Contest not found' };

    if (contest.leftUsers.includes('current_user')) {
      return { success: false, message: '您已離開考試，無法重新進入' };
    }

    if (!contest.enteredUsers.includes('current_user')) {
      contest.enteredUsers.push('current_user');
      saveContests(contests);
    }
    return { success: true };
  },

  leaveContest: async (contestId: string): Promise<void> => {
    const contests = getStoredContests();
    const contest = contests.find(c => c.id === contestId);
    if (contest && !contest.leftUsers.includes('current_user')) {
      contest.leftUsers.push('current_user');
      saveContests(contests);
    }
  },

  getContestProblems: async (contestId: string): Promise<ContestProblem[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(MOCK_CONTEST_PROBLEMS[contestId] || []), 300);
    });
  },

  // Teacher Management Methods
  createContest: async (contestData: Partial<Contest>): Promise<Contest> => {
    const contests = getStoredContests();
    const newContest: Contest = {
      id: (contests.length + 1).toString(),
      title: contestData.title || 'New Contest',
      description: contestData.description || '',
      startTime: contestData.startTime || new Date().toISOString(),
      endTime: contestData.endTime || new Date(Date.now() + 3600000).toISOString(),
      status: 'upcoming',
      isPrivate: contestData.isPrivate || false,
      password: contestData.password,
      registeredUsers: [],
      enteredUsers: [],
      leftUsers: []
    };
    contests.push(newContest);
    saveContests(contests);
    return newContest;
  },

  updateContest: async (id: string, updates: Partial<Contest>): Promise<Contest | null> => {
    const contests = getStoredContests();
    const index = contests.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    contests[index] = { ...contests[index], ...updates };
    saveContests(contests);
    return contests[index];
  },

  deleteContest: async (id: string): Promise<boolean> => {
    let contests = getStoredContests();
    const initialLength = contests.length;
    contests = contests.filter(c => c.id !== id);
    if (contests.length !== initialLength) {
      saveContests(contests);
      return true;
    }
    return false;
  },

  getAnnouncements: async (_contestId: string): Promise<{id: string, title: string, content: string, time: string}[]> => {
    // Mock announcements
    return [
      { id: '1', title: '歡迎參加', content: '請遵守考試規則，切勿作弊。', time: new Date().toISOString() },
      { id: '2', title: '題目更正', content: '第二題的測資範圍已更新，請重新查看。', time: new Date(Date.now() + 1800000).toISOString() }
    ];
  }
};
