import { Tag } from '@carbon/react';

export type StatusType = 'active' | 'inactive' | 'success' | 'error' | 'warning' | 'info' | 'purple' | 'cyan' | 'teal' | 'gray' | 'cool-gray' | 'warm-gray' | 'high-contrast' | 'outline';

interface StatusBadgeProps {
  status: StatusType;
  text: string;
  size?: 'sm' | 'md';
}

export const StatusBadge = ({ status, text, size = 'md' }: StatusBadgeProps) => {
  let type: any = 'gray';
  
  switch (status) {
    case 'active':
    case 'success':
      type = 'green';
      break;
    case 'inactive':
    case 'gray':
      type = 'gray';
      break;
    case 'error':
      type = 'red';
      break;
    case 'warning':
      type = 'yellow';
      break;
    case 'info':
      type = 'blue';
      break;
    default:
      type = status;
  }

  return (
    <Tag type={type} size={size} title={text}>
      {text}
    </Tag>
  );
};
