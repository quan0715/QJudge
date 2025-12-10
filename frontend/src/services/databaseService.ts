/**
 * Database Service - API for database status, switching, and sync operations
 * Requires admin user permissions
 */

import { httpClient } from "./api/httpClient";

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
};

export type DatabaseSyncResponse = {
  message: string;
  apps: string[];
  source: string;
  target: string;
};

const API_BASE = "/api/admin/database/";

export const databaseService = {
  /**
   * Get current database status
   */
  async getStatus(): Promise<DatabaseStatus> {
    const response = await httpClient.get(API_BASE);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get database status");
    }
    return response.json();
  },

  /**
   * Switch to a different database
   */
  async switchDatabase(database: string): Promise<DatabaseSwitchResponse> {
    const response = await httpClient.post(API_BASE, { database });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to switch database");
    }
    return response.json();
  },

  /**
   * Sync data between databases
   */
  async syncDatabase(
    source: string,
    target: string,
    apps?: string[]
  ): Promise<DatabaseSyncResponse> {
    const response = await httpClient.post(`${API_BASE}sync/`, {
      source,
      target,
      apps,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to sync database");
    }
    return response.json();
  },
};
