import type { ReactNode } from "react";

export type HITLRenderer = (args: Record<string, unknown>) => ReactNode;

const registry: Record<string, HITLRenderer> = {};

/**
 * Register a custom card renderer for a specific tool + action combination.
 * Key format: "tool_name:action" (e.g. "qjudge_coding_problems:create")
 * or just "tool_name" as a catch-all for that tool.
 */
export function registerHITLRenderer(key: string, renderer: HITLRenderer): void {
  registry[key] = renderer;
}

export function getHITLRenderer(toolName: string, actionArg?: string): HITLRenderer | null {
  const specificKey = actionArg ? `${toolName}:${actionArg}` : null;
  if (specificKey && registry[specificKey]) return registry[specificKey];
  if (registry[toolName]) return registry[toolName];
  return null;
}
