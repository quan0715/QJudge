import type { StoryModule } from '@/shared/types/story.types';
import { ContestStatusBadge, type ContestStatusBadgeProps } from './ContestStatusBadge';

const allStatuses = ['draft', 'published', 'archived'] as const;

export const ContestStatusBadgeStories: StoryModule<ContestStatusBadgeProps> = {
  meta: {
    title: 'ContestStatusBadge',
    description: '用於顯示比賽狀態的 Badge（草稿、已發布、已封存）。',
    component: ContestStatusBadge,
    defaultArgs: {
      status: 'published',
      size: 'md',
    },
    argTypes: {
      status: {
        control: 'select',
        options: [...allStatuses],
        description: '比賽狀態',
      },
      size: {
        control: 'select',
        options: ['sm', 'md'],
        description: 'Badge 大小',
      },
    },
  },
  stories: [
    {
      name: 'Playground',
      description: '互動式調整 Props',
      render: (args) => (
        <ContestStatusBadge 
          status={args.status as string} 
          size={args.size as 'sm' | 'md'} 
        />
      ),
    },
    {
      name: 'All Statuses',
      description: '所有比賽狀態一覽',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* All Contest Statuses */}
          <div>
            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              所有狀態
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {allStatuses.map(status => (
                <ContestStatusBadge key={status} status={status} />
              ))}
            </div>
          </div>

          {/* Size Comparison */}
          <div>
            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              尺寸比較
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ContestStatusBadge status="published" size="sm" />
              <ContestStatusBadge status="published" size="md" />
              <span style={{ marginLeft: '1rem' }}>sm / md</span>
            </div>
          </div>
        </div>
      ),
    },
  ],
};
