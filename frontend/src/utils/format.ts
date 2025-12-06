import type { ProblemAllowedDifficulty } from '@/models/problem';
import type { ProblemAllowedLanguage } from '@/models/problem';
/**
 * Format a date string into a localized string (zh-TW)
 * @param dateString The ISO date string to format
 * @returns Formatted date string
 */
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};


const getLanguageLabel = (lang: ProblemAllowedLanguage) => {
  const langMap: Record<ProblemAllowedLanguage, string> = {
    'cpp': 'C++',
    'python': 'Python',
    'java': 'Java',
    'javascript': 'JavaScript',
    'c': 'C'
  };
  return langMap[lang] || lang;
};

const getDifficultyLabel = (diff: ProblemAllowedDifficulty) => {
  const diffMap: Record<ProblemAllowedDifficulty, string> = {
    'easy': 'Easy',
    'medium': 'Medium',
    'hard': 'Hard'
  };
  return diffMap[diff] || diff;
};

export { formatDate, getLanguageLabel, getDifficultyLabel };