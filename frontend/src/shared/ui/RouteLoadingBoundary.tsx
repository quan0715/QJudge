import { Suspense, type ReactNode } from "react";

import PageLoading from "./PageLoading";

interface RouteLoadingBoundaryProps {
  children: ReactNode;
}

export function RouteLoadingBoundary({
  children,
}: RouteLoadingBoundaryProps) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}
