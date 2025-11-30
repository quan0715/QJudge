import type { Contest, ContestDetail } from '@/models/contest';

export type ContestDisplayState = 'upcoming' | 'running' | 'ended' | 'inactive';

export const getContestState = (
  contest: Pick<Contest | ContestDetail, 'status' | 'start_time' | 'end_time'>
): ContestDisplayState => {
  if (contest.status === 'inactive') {
    return 'inactive';
  }

  const now = new Date().getTime();
  const startTime = new Date(contest.start_time).getTime();
  const endTime = new Date(contest.end_time).getTime();

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
