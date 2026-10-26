'use client';

import React from 'react';

export function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      style={{ contain: 'paint' }}
    >
      {/* 1. Subtle Dark Grid Pattern with Elliptical Radial Mask */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 15%, black 40%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 15%, black 40%, transparent 85%)',
        }}
      />

      {/* 2. Drifting Ambient Aurora Light Orbs */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Orb 1: Deep Indigo Aura (Top Left) */}
        <div
          className="absolute -top-[15%] -left-[10%] w-[580px] h-[580px] rounded-full bg-indigo-600/[0.12] blur-[130px] will-change-transform"
          style={{
            animation: 'ambientDrift1 24s ease-in-out infinite alternate',
          }}
        />

        {/* Orb 2: Purple / Violet Core (Top Right) */}
        <div
          className="absolute -top-[10%] -right-[12%] w-[540px] h-[540px] rounded-full bg-purple-600/[0.09] blur-[140px] will-change-transform"
          style={{
            animation: 'ambientDrift2 28s ease-in-out infinite alternate',
          }}
        />

        {/* Orb 3: Subtle Cyan / Sky Ambient Glow (Center Bottom) */}
        <div
          className="absolute bottom-[5%] left-[25%] w-[620px] h-[480px] rounded-full bg-sky-500/[0.06] blur-[150px] will-change-transform"
          style={{
            animation: 'ambientDrift3 22s ease-in-out infinite alternate',
          }}
        />
      </div>

      {/* 3. Deep Vignette Edge Falloff */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.6)_100%)]"
      />
    </div>
  );
}
