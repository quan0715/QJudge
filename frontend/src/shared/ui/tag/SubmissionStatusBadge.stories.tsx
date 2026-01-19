import type { StoryModule } from '@/shared/types/story.types';
import { 
  SubmissionStatusBadge, 
  SubmissionStatusIcon,
  type SubmissionStatusBadgeProps 
} from './SubmissionStatusBadge';

const allStatuses = [
  'AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'KR', 'NS', 
  'pending', 'judging', 'SE', 'passed', 'failed'
] as const;

export const SubmissionStatusBadgeStories: StoryModule<SubmissionStatusBadgeProps> = {
  meta: {
    title: 'SubmissionStatusBadge',
    description: '用於顯示提交狀態或測試案例結果的 Badge。整合了 SubmissionStatus 和 TestCaseStatus。',
    component: SubmissionStatusBadge,
    defaultArgs: {
      status: 'AC',
      size: 'md',
    },
    argTypes: {
      status: {
        control: 'select',
        options: [...allStatuses],
        description: '狀態值',
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
        <SubmissionStatusBadge 
          status={args.status as string} 
          size={args.size as 'sm' | 'md'} 
        />
      ),
    },
    {
      name: 'All Statuses',
      description: '所有狀態類型一覽',
      render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Submission Statuses */}
          <div>
            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              提交狀態 (SubmissionStatus)
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'KR', 'NS', 'pending', 'judging', 'SE'].map(status => (
                <SubmissionStatusBadge key={status} status={status} />
              ))}
            </div>
          </div>
          
          {/* TestCase Statuses */}
          <div>
            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              測試案例狀態 (TestCaseStatus)
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {['passed', 'failed', 'pending'].map(status => (
                <SubmissionStatusBadge key={status} status={status} />
              ))}
            </div>
          </div>
          
          {/* Size Comparison */}
          <div>
            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              尺寸比較
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <SubmissionStatusBadge status="AC" size="sm" />
              <SubmissionStatusBadge status="AC" size="md" />
              <span style={{ marginLeft: '1rem' }}>sm / md</span>
            </div>
          </div>

          {/* With Icons */}
          <div>
            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              搭配圖標 (SubmissionStatusIcon)
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {['passed', 'failed', 'pending', 'AC', 'WA', 'TLE'].map(status => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <SubmissionStatusIcon status={status} />
                  <SubmissionStatusBadge status={status} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ],
};
