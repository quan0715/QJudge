import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useContestRuntimeMode } from './useContestRuntimeMode';

const wrap = (initialPath: string) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
  return Wrapper;
};

describe('useContestRuntimeMode', () => {
  it.each([
    ['/classrooms/c1/contest/x1/solve', true],
    ['/classrooms/c1/contest/x1/solve/p1', true],
    ['/classrooms/c1/contest/x1', false],
    ['/classrooms/c1/contest/x1/admin', false],
    ['/dashboard', false],
    ['/classrooms/c1', false],
  ])('returns isRuntime=%s for %s', (path, expected) => {
    const { result } = renderHook(() => useContestRuntimeMode(), {
      wrapper: wrap(path),
    });
    expect(result.current.isRuntime).toBe(expected);
  });
});
