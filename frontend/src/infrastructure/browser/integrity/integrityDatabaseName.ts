/** Event ACKs and evidence descriptors must share the same immutable scope. */
export function integrityDatabaseName(scope: {
  databaseName?: string;
  runId: string;
  deviceId: string;
  participantId?: number;
  attemptId?: string;
}): string {
  const base = scope.databaseName ?? "qjudge-exam-integrity-v1";
  return scope.attemptId
    ? `${base}:scope:${JSON.stringify([scope.runId, scope.participantId, scope.deviceId, scope.attemptId])}`
    : base;
}
