import { useLocation } from 'react-router-dom';

const RUNTIME_REGEX = /^\/classrooms\/[^/]+\/contest\/[^/]+\/solve(?:\/|$)/;

export interface ContestRuntimeMode {
  isRuntime: boolean;
}

export const useContestRuntimeMode = (): ContestRuntimeMode => {
  const { pathname } = useLocation();
  return { isRuntime: RUNTIME_REGEX.test(pathname) };
};
