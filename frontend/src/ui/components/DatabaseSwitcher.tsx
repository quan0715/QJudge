/**
 * DatabaseSwitcher Component
 * 
 * A compact toggle for switching between local and cloud databases.
 * Only visible in development mode for admin users.
 */

import { useState, useEffect, useCallback } from 'react';
import { Toggle, InlineNotification, InlineLoading, Button } from '@carbon/react';
import { Renew, CloudUpload, Laptop } from '@carbon/icons-react';
import { databaseService } from '@/services/databaseService';
import type { DatabaseStatus } from '@/services/databaseService';

interface DatabaseSwitcherProps {
  isAdmin: boolean;
}

export const DatabaseSwitcher = ({ isAdmin }: DatabaseSwitcherProps) => {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if we're in development mode
  const isDev = import.meta.env.DEV;

  const fetchStatus = useCallback(async () => {
    if (!isDev || !isAdmin) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await databaseService.getStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, [isDev, isAdmin]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async (checked: boolean) => {
    const targetDb = checked ? 'cloud' : 'default';
    
    try {
      setSwitching(true);
      setError(null);
      const result = await databaseService.switchDatabase(targetDb);
      setStatus(prev => prev ? { ...prev, current: result.current } : null);
      setSuccessMessage(`Switched to ${targetDb === 'cloud' ? 'Cloud' : 'Local'} database`);
      setTimeout(() => setSuccessMessage(null), 3000);
      // Reload page to reflect changes
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch');
    } finally {
      setSwitching(false);
    }
  };

  const handleSync = async () => {
    if (!status) return;
    
    const source = status.current;
    const target = source === 'default' ? 'cloud' : 'default';
    
    try {
      setSyncing(true);
      setError(null);
      const result = await databaseService.syncDatabase(source, target);
      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  // Don't render if not in dev mode or not admin
  if (!isDev || !isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div style={{ padding: '0.5rem 1rem' }}>
        <InlineLoading description="Loading database status..." />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div style={{ padding: '0.5rem' }}>
        <InlineNotification
          kind="error"
          title="DB Error"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      </div>
    );
  }

  const isCloud = status?.current === 'cloud';
  const currentDbStatus = status?.status?.[status.current];

  return (
    <div style={{ 
      padding: '0.75rem 1rem',
      borderBottom: '1px solid var(--cds-border-subtle)',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        marginBottom: '0.5rem'
      }}>
        {isCloud ? <CloudUpload size={16} /> : <Laptop size={16} />}
        <span style={{ 
          fontSize: '0.75rem', 
          fontWeight: 600,
          color: 'var(--cds-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.32px'
        }}>
          Database
        </span>
      </div>

      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: '0.5rem'
      }}>
        <Toggle
          id="db-toggle"
          size="sm"
          labelA="Local"
          labelB="Cloud"
          toggled={isCloud}
          onToggle={handleToggle}
          disabled={switching || syncing}
        />
        
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={Renew}
          iconDescription="Sync databases"
          onClick={handleSync}
          disabled={switching || syncing}
        />
      </div>

      {/* Connection status indicator */}
      <div style={{ 
        marginTop: '0.5rem',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem'
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: currentDbStatus?.connected 
            ? 'var(--cds-support-success)' 
            : 'var(--cds-support-error)',
        }} />
        <span style={{ color: 'var(--cds-text-secondary)' }}>
          {currentDbStatus?.connected ? 'Connected' : 'Disconnected'}
          {currentDbStatus?.host && ` • ${currentDbStatus.host.substring(0, 20)}...`}
        </span>
      </div>

      {(switching || syncing) && (
        <div style={{ marginTop: '0.5rem' }}>
          <InlineLoading 
            description={switching ? 'Switching...' : 'Syncing...'} 
          />
        </div>
      )}

      {error && (
        <div style={{ marginTop: '0.5rem' }}>
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={error}
            lowContrast
            hideCloseButton
          />
        </div>
      )}

      {successMessage && (
        <div style={{ marginTop: '0.5rem' }}>
          <InlineNotification
            kind="success"
            title="Success"
            subtitle={successMessage}
            lowContrast
            hideCloseButton
          />
        </div>
      )}
    </div>
  );
};
