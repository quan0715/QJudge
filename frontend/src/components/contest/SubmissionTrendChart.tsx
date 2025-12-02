interface ChartData {
  date: string;
  count: number;
}

interface SubmissionTrendChartProps {
  data: ChartData[];
  height?: number;
}

const SubmissionTrendChart = ({ data, height = 200 }: SubmissionTrendChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'var(--cds-text-secondary)',
        border: '1px dashed var(--cds-border-subtle)',
        borderRadius: '4px'
      }}>
        No data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 5); // Min max is 5
  
  // Calculate points for SVG
  const width = 1000; // Virtual width
  const effectiveHeight = 300; // Virtual height
  
  const svgPoints = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = effectiveHeight - (d.count / maxCount) * effectiveHeight;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ width: '100%', height, position: 'relative' }}>
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${width} ${effectiveHeight}`} 
        preserveAspectRatio="none"
        style={{ overflow: 'visible' }}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line 
            key={t}
            x1="0" 
            y1={effectiveHeight * t} 
            x2={width} 
            y2={effectiveHeight * t} 
            stroke="var(--cds-border-subtle)" 
            strokeWidth="1" 
            strokeDasharray="4 4"
          />
        ))}

        {/* Area Fill */}
        <path 
          d={`M0,${effectiveHeight} ${svgPoints} ${width},${effectiveHeight} Z`} 
          fill="var(--cds-interactive-01)" 
          fillOpacity="0.1" 
        />

        {/* Line */}
        <polyline 
          points={svgPoints} 
          fill="none" 
          stroke="var(--cds-interactive-01)" 
          strokeWidth="3" 
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * width;
          const y = effectiveHeight - (d.count / maxCount) * effectiveHeight;
          return (
            <circle 
              key={i}
              cx={x} 
              cy={y} 
              r="4" 
              fill="var(--cds-background)" 
              stroke="var(--cds-interactive-01)" 
              strokeWidth="2" 
            />
          );
        })}
      </svg>
      
      {/* X-axis labels (simplified) */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginTop: '0.5rem',
        fontSize: '0.75rem',
        color: 'var(--cds-text-secondary)'
      }}>
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
};

export default SubmissionTrendChart;
