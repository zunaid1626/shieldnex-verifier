'use client';

import React, { useEffect, useRef } from 'react';

interface WaveTendril {
  baseY: number;
  amplitude: number;
  frequency: number;
  speed: number;
  wavelength: number;
  colorStart: string;
  colorEnd: string;
  lineWidth: number;
  phaseOffset: number;
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
}

export function PlasmaBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Responsive setup with capped DPR for 60fps performance
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Plasma tendrils configuration
    const tendrils: WaveTendril[] = [
      {
        baseY: 0.28,
        amplitude: 75,
        frequency: 0.0016,
        speed: 0.016,
        wavelength: 2.2,
        colorStart: 'rgba(168, 85, 247, 0.45)', // Neon Purple
        colorEnd: 'rgba(59, 130, 246, 0.55)',   // Electric Blue
        lineWidth: 3.5,
        phaseOffset: 0,
      },
      {
        baseY: 0.42,
        amplitude: 95,
        frequency: 0.0012,
        speed: 0.013,
        wavelength: 1.8,
        colorStart: 'rgba(59, 130, 246, 0.5)',  // Electric Blue
        colorEnd: 'rgba(6, 182, 212, 0.45)',   // Cyan/Neon
        lineWidth: 3.0,
        phaseOffset: 1.6,
      },
      {
        baseY: 0.58,
        amplitude: 85,
        frequency: 0.0018,
        speed: 0.018,
        wavelength: 2.6,
        colorStart: 'rgba(217, 70, 239, 0.45)', // Fuchsia / Magenta
        colorEnd: 'rgba(147, 51, 234, 0.5)',   // Deep Purple
        lineWidth: 3.2,
        phaseOffset: 3.2,
      },
      {
        baseY: 0.72,
        amplitude: 65,
        frequency: 0.0015,
        speed: 0.014,
        wavelength: 2.0,
        colorStart: 'rgba(99, 102, 241, 0.4)',  // Indigo
        colorEnd: 'rgba(59, 130, 246, 0.45)',  // Blue
        lineWidth: 2.8,
        phaseOffset: 4.8,
      },
    ];

    // Ambient floating energy particles
    const particleCount = 28;
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.2 + 0.8,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(Math.random() * 0.4 + 0.2),
      alpha: Math.random() * 0.6 + 0.2,
      color: Math.random() > 0.5 ? '#c084fc' : '#60a5fa',
    }));

    let time = 0;

    const render = () => {
      time += 1;

      // 1. Clear to deep pitch black
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle center radial energy bloom
      const radialGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        50,
        width * 0.5,
        height * 0.45,
        Math.max(width, height) * 0.65
      );
      radialGlow.addColorStop(0, 'rgba(126, 34, 206, 0.16)');
      radialGlow.addColorStop(0.4, 'rgba(59, 130, 246, 0.09)');
      radialGlow.addColorStop(1, 'rgba(3, 7, 18, 0)');
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // 3. Render Fluid Glowing Plasma Tendrils with Additive Blending
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      tendrils.forEach((tendril, index) => {
        const yCenter = height * tendril.baseY;
        const gradient = ctx.createLinearGradient(0, yCenter - 120, width, yCenter + 120);
        gradient.addColorStop(0, tendril.colorStart);
        gradient.addColorStop(0.5, index % 2 === 0 ? 'rgba(192, 132, 252, 0.6)' : 'rgba(96, 165, 250, 0.6)');
        gradient.addColorStop(1, tendril.colorEnd);

        // Fill glow ribbon underneath
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, yCenter);

        const step = 14;
        for (let x = 0; x <= width; x += step) {
          const wave1 = Math.sin(x * tendril.frequency + time * tendril.speed + tendril.phaseOffset);
          const wave2 = Math.cos(x * tendril.frequency * 0.5 - time * tendril.speed * 0.7);
          const wave3 = Math.sin((x / width) * Math.PI * tendril.wavelength + time * 0.008);
          const y = yCenter + (wave1 * 0.6 + wave2 * 0.3 + wave3 * 0.4) * tendril.amplitude;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        // Soft translucent fluid wash
        const ribbonGrad = ctx.createLinearGradient(0, yCenter - tendril.amplitude, 0, height);
        ribbonGrad.addColorStop(0, index % 2 === 0 ? 'rgba(147, 51, 234, 0.08)' : 'rgba(37, 99, 235, 0.08)');
        ribbonGrad.addColorStop(1, 'rgba(3, 7, 18, 0)');
        ctx.fillStyle = ribbonGrad;
        ctx.fill();

        // High-intensity neon crest stroke with glow
        ctx.beginPath();
        for (let x = 0; x <= width; x += step) {
          const wave1 = Math.sin(x * tendril.frequency + time * tendril.speed + tendril.phaseOffset);
          const wave2 = Math.cos(x * tendril.frequency * 0.5 - time * tendril.speed * 0.7);
          const wave3 = Math.sin((x / width) * Math.PI * tendril.wavelength + time * 0.008);
          const y = yCenter + (wave1 * 0.6 + wave2 * 0.3 + wave3 * 0.4) * tendril.amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = tendril.lineWidth;
        ctx.shadowBlur = 24;
        ctx.shadowColor = index % 2 === 0 ? 'rgba(192, 132, 252, 0.7)' : 'rgba(96, 165, 250, 0.7)';
        ctx.stroke();
      });

      // 4. Floating Energy Sparks
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y < 0) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.fill();
      });

      ctx.restore();

      // 5. Deep Cinematic Edge Falloff Vignette
      const edgeVignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.3,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      edgeVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      edgeVignette.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
      ctx.fillStyle = edgeVignette;
      ctx.fillRect(0, 0, width, height);

      animationFrameId = requestAnimationFrame(render);
    };

    // Pause rendering when tab is hidden to save GPU/battery
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
      } else {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-black select-none"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
      />
    </div>
  );
}
