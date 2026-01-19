/**
 * Database Repository Implementation
 *
 * Database status, switching, and sync operations (Admin only).
 */

import { httpClient, requestJson } from "@/infrastructure/api/http.client";

// ============================================================================
// Types
// ============================================================================

export type DatabaseStatus = {
  current: string;
  available: string[];
  status: Record<
    string,
    {
      connected: boolean;
      host?: string;
      database?: string;
      error?: string;
      latency_ms?: number;
    }
  >;
};

export type DatabaseSwitchResponse = {
  current: string;
  message: string;
  migrations?: string;
};

export type DatabaseSyncResponse = {
  message: string;
  apps: string[];
  source: string;
  target: string;
  migrations?: string;
};

// ============================================================================
// Database Repository Implementation
// ============================================================================

const API_BASE = "/api/admin/database/";

export const databaseService = {
  async getStatus(): Promise<DatabaseStatus> {
    return requestJson<DatabaseStatus>(
      httpClient.get(API_BASE),
      "Failed to get database status"
    );
  },

  async switchDatabase(database: string): Promise<DatabaseSwitchResponse> {
    return requestJson<DatabaseSwitchResponse>(
      httpClient.post(API_BASE, { database }),
      "Failed to switch database"
    );
  },

  async syncDatabase(
    source: string,
    target: string,
    apps?: string[]
  ): Promise<DatabaseSyncResponse> {
    return requestJson<DatabaseSyncResponse>(
      httpClient.post(`${API_BASE}sync/`, {
        source,
        target,
        apps,
      }),
      "Failed to sync database"
    );
  },
};

export default databaseService;
