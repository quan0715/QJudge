import type { Contest, ContestDetail } from '@/core/entities/contest.entity';

export type ContestDisplayState = 'upcoming' | 'running' | 'ended' | 'inactive';

export const getContestState = (
  contest: Pick<Contest | ContestDetail, 'status' | 'startTime' | 'endTime'>
): ContestDisplayState => {
  if (contest.status === 'inactive') {
    return 'inactive';
  }

  const now = new Date().getTime();
  const startTime = new Date(contest.startTime).getTime();
  const endTime = new Date(contest.endTime).getTime();

  if (now < startTime) {
    return 'upcoming';
  } else if (now >= startTime && now <= endTime) {
    return 'running';
  } else {
    return 'ended';
  }
};

export const getContestStateLabel = (state: ContestDisplayState): string => {
  switch (state) {
    case 'upcoming':
      return '即將開始';
    case 'running':
      return '進行中';
    case 'ended':
      return '已結束';
    case 'inactive':
      return '未開放';
    default:
      return '未知';
  }
};

export const getContestStateColor = (state: ContestDisplayState): "red" | "magenta" | "purple" | "blue" | "cyan" | "teal" | "green" | "gray" | "cool-gray" | "warm-gray" | "high-contrast" | "outline" => {
  switch (state) {
    case 'upcoming':
      return 'blue';
    case 'running':
      return 'green';
    case 'ended':
      return 'gray';
    case 'inactive':
      return 'red';
    default:
      return 'gray';
  }
};
