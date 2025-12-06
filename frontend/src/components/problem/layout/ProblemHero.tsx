import React from 'react';
import { Tag } from '@carbon/react';
import { HeroBase } from '@/components/common/layout/HeroBase';
import type { ProblemDetail } from '@/core/entities/problem.entity';

interface ProblemHeroProps {
  problem: ProblemDetail | null;
  loading?: boolean;
  bottomContent?: React.ReactNode;
}

const ProblemHero: React.FC<ProblemHeroProps> = ({ 
  problem, 
  loading,
  bottomContent
}) => {
  if (loading || !problem) {
     return <HeroBase title="" loading={true} />;
  }

  const badges = (
    <>
      <Tag type={
          problem.difficulty === 'easy' ? 'green' : 
          problem.difficulty === 'medium' ? 'blue' : 
          'red'
      }>
        {problem.difficulty.toUpperCase()}
      </Tag>
      {problem.tags?.map((tag: any) => (
          <Tag key={tag.id} type="gray">{tag.name}</Tag>
      ))}
    </>
  );

  const metadata = (
    <>
        <div>
            <div style={{ marginBottom: '0.25rem' }}>Time Limit</div>
            <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{problem.timeLimit} ms</div>
        </div>
        <div>
            <div style={{ marginBottom: '0.25rem' }}>Memory Limit</div>
            <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{problem.memoryLimit} KB</div>
        </div>
    </>
  );

  return (
    <HeroBase
      title={problem.title}
      badges={badges}
      metadata={metadata}
      bottomContent={bottomContent}
      // kpiCards/actions can be added later as needed
    />
  );
};

export default ProblemHero;
