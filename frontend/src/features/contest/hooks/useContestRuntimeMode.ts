import { useLocation } from 'react-router-dom';

const RUNTIME_REGEX = /^\/classrooms\/[^/]+\/contest\/[^/]+\/solve(?:\/|$)/;

export interface ContestRuntimeMode {
  isRuntime: boolean;
  isPreview: boolean;
}

export const useContestRuntimeMode = (): ContestRuntimeMode => {
  const { pathname } = useLocation();
  const isPreview = /^\/classrooms\/[^/]+\/contest\/[^/]+\/exam-preview\/?$/.test(pathname);
  return { isRuntime: RUNTIME_REGEX.test(pathname) || isPreview, isPreview };
};
