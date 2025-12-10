import { useEffect, useRef } from 'react';

const MatrixBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Characters to use (mix of code, binary, matrix-like chars)
    const chars = '0123456789ABCDEFabcdef<>{}[];/\\+-*=&|?!@#$%^';
    const charArray = chars.split('');
    
    const fontSize = 14;
    const columns = width / fontSize;
    
    // Array to track y position of each column
    // Initialize with random negative values so they don't all start at once
    const drops: number[] = [];
    for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -100; // Start above screen
    }

    const draw = () => {
      // Semi-transparent black to create trail effect
      // Use var(--cds-background) if possible, but canvas needs exact color string. 
      // We'll use a hardcoded dark color that matches Carbon g100/g90 or pure black #161616
      ctx.fillStyle = 'rgba(22, 22, 22, 0.05)'; 
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#42be65'; // Carbon Green for Matrix text
      ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Random character
        const text = charArray[Math.floor(Math.random() * charArray.length)];
        
        // Draw the character
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        
        ctx.fillText(text, x, y);

        // Reset drop to top randomly or move down
        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        
        drops[i]++;
      }
    };

    let animationFrameId: number;
    let lastTime = 0;
    const fps = 30; // Limit FPS for matrix feel and performance
    const interval = 1000 / fps;

    const animate = (time: number) => {
        const deltaTime = time - lastTime;
        
        if (deltaTime > interval) {
            draw();
            lastTime = time - (deltaTime % interval);
        }
        
        animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        // Re-init drops if width changes significantly or just let them extend?
        // Re-init is safer for density
         const newColumns = width / fontSize;
         // Preserve existing drops if possible or just extend
         if (newColumns > drops.length) {
             for (let i = drops.length; i < newColumns; i++) {
                 drops[i] = Math.random() * -100;
             }
         }
    };

    window.addEventListener('resize', handleResize);
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        opacity: 0.15, // Low opacity so it's not distracting
        pointerEvents: 'none'
      }}
    />
  );
};

export default MatrixBackground;
