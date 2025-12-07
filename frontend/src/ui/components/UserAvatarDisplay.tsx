import React from 'react';
import { UserAvatar } from '@carbon/icons-react';
import { useAuth } from '@/domains/auth/contexts/AuthContext';

interface UserAvatarDisplayProps {
  showBorder?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Global User Avatar Display component
 * Shows the user's avatar icon with username and role
 */
export const UserAvatarDisplay: React.FC<UserAvatarDisplayProps> = ({
  showBorder = true,
  size = 'md'
}) => {
  const { user } = useAuth();

  if (!user) return null;

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  const nameFontSize = size === 'sm' ? '0.75rem' : size === 'lg' ? '1rem' : '0.875rem';
  const roleFontSize = size === 'sm' ? '0.625rem' : size === 'lg' ? '0.875rem' : '0.75rem';
  const gap = size === 'sm' ? '0.5rem' : size === 'lg' ? '1rem' : '0.75rem';

  const displayName = user.username || user.email || 'User';
  const displayRole = user.role 
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1) 
    : 'Student';

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap,
      padding: showBorder ? '0 1rem' : undefined,
      borderLeft: showBorder ? '1px solid var(--cds-border-subtle)' : undefined,
      height: '100%'
    }}>
      <UserAvatar size={iconSize} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: nameFontSize, fontWeight: 600 }}>
          {displayName}
        </span>
        <span style={{ fontSize: roleFontSize, color: 'var(--cds-text-secondary)' }}>
          {displayRole}
        </span>
      </div>
    </div>
  );
};

export default UserAvatarDisplay;
