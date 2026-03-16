import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code, 
  TaskComplete, 
  FaceActivated, 
  Light, 
  ChartLine,
  Rocket
} from '@carbon/icons-react';

export const AuthLoadingSkeleton = () => {
  const { t } = useTranslation();
  
  // Define available cute combinations
  const allCombos = useMemo(() => [
    { icon: <Code size={20} />, label: t("auth.callback.steps.preparing", "準備開啟程式冒險...") },
    { icon: <Light size={20} />, label: t("auth.callback.steps.assembling", "正在組裝工作區...") },
    { icon: <FaceActivated size={20} />, label: t("auth.callback.steps.verifying", "確認是本人無誤（你看起來很棒！）") },
    { icon: <ChartLine size={20} />, label: t("auth.callback.steps.stats", "正在同步您的戰績...") },
    { icon: <Rocket size={20} />, label: t("auth.callback.steps.igniting", "引擎點火中，準備出發！") },
    { icon: <TaskComplete size={20} />, label: t("auth.callback.steps.ready", "一切準備就緒！") },
  ], [t]);

  // Pick 3 random unique steps + the final "ready" step
  const [activeSteps] = useState(() => {
    const shuffled = [...allCombos.slice(0, -1)].sort(() => 0.5 - Math.random());
    return [...shuffled.slice(0, 3), allCombos[allCombos.length - 1]];
  });

  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setStepIndex(prev => (prev < activeSteps.length - 1 ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(stepInterval);
  }, [activeSteps.length]);

  return (
    <div className="auth-callback" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'flex-start',
      minHeight: '120px',
      justifyContent: 'center'
    }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
            }}
          >
            <motion.div
              animate={{ 
                scale: [1, 1.15, 1],
                opacity: [0.8, 1, 0.8]
              }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              style={{ color: 'var(--cds-link-primary, #78a9ff)', display: 'flex' }}
            >
              {activeSteps[stepIndex].icon}
            </motion.div>
            <span style={{ 
              fontSize: '1rem', 
              color: 'var(--cds-text-secondary, #525252)', 
              fontWeight: 500 
            }}>
              {activeSteps[stepIndex].label}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
