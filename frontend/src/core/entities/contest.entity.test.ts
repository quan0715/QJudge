import { describe, it, expect } from 'vitest';
import { getContestState, getContestStateLabel, isContestEnded } from './contest.entity';

describe('Contest Entity Utilities', () => {
  const now = new Date().getTime();
  const oneHour = 3600 * 1000;

  describe('getContestState', () => {
    it('should return "inactive" when status is inactive', () => {
      const contest = { status: 'inactive' };
      expect(getContestState(contest)).toBe('inactive');
    });

    it('should return "upcoming" when start time is in the future', () => {
      const contest = {
        status: 'active',
        startTime: new Date(now + oneHour).toISOString(),
        endTime: new Date(now + 2 * oneHour).toISOString(),
      };
      expect(getContestState(contest)).toBe('upcoming');
    });

    it('should return "running" when current time is between start and end time', () => {
      const contest = {
        status: 'active',
        startTime: new Date(now - oneHour).toISOString(),
        endTime: new Date(now + oneHour).toISOString(),
      };
      expect(getContestState(contest)).toBe('running');
    });

    it('should return "ended" when end time is in the past', () => {
      const contest = {
        status: 'active',
        startTime: new Date(now - 2 * oneHour).toISOString(),
        endTime: new Date(now - oneHour).toISOString(),
      };
      expect(getContestState(contest)).toBe('ended');
    });

    it('should handle legacy snake_case fields', () => {
      const contest = {
        status: 'active',
        start_time: new Date(now - oneHour).toISOString(),
        end_time: new Date(now + oneHour).toISOString(),
      };
      expect(getContestState(contest)).toBe('running');
    });
  });

  describe('getContestStateLabel', () => {
    it('should return correct Chinese labels', () => {
      expect(getContestStateLabel('upcoming')).toBe('即將開始');
      expect(getContestStateLabel('running')).toBe('進行中');
      expect(getContestStateLabel('ended')).toBe('已結束');
      expect(getContestStateLabel('inactive')).toBe('未開放');
    });
  });

  describe('isContestEnded', () => {
    it('should return true if contest ended', () => {
      const contest = { endTime: new Date(now - oneHour).toISOString() };
      expect(isContestEnded(contest)).toBe(true);
    });

    it('should return false if contest is running', () => {
      const contest = { endTime: new Date(now + oneHour).toISOString() };
      expect(isContestEnded(contest)).toBe(false);
    });
  });
});
