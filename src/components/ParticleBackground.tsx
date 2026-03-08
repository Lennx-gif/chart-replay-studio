import { useCallback } from 'react';
import Particles from '@tsparticles/react';
import { loadSlim } from 'tsparticles-slim';
import type { Engine } from 'tsparticles-engine';

export function ParticleBackground() {
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine as any);
  }, []);

  return (
    <Particles
      id="nubian-particles"
      init={particlesInit as any}
      options={{
        fullScreen: { enable: true, zIndex: 0 },
        fpsLimit: 60,
        particles: {
          number: { value: 35, density: { enable: true, value_area: 1200 } as any },
          color: { value: ['#d4a54a', '#c47d2e', '#a0855c'] },
          shape: { type: 'circle' },
          opacity: {
            value: { min: 0.03, max: 0.12 },
            animation: { enable: true, speed: 0.3, startValue: 'random' as const, sync: false },
          },
          size: {
            value: { min: 1, max: 3 },
            animation: { enable: true, speed: 0.5, startValue: 'random' as const, sync: false },
          },
          move: {
            enable: true,
            speed: 0.3,
            direction: 'none' as const,
            random: true,
            straight: false,
            outModes: { default: 'out' as const },
          },
          links: {
            enable: true,
            distance: 150,
            color: '#d4a54a',
            opacity: 0.04,
            width: 1,
          },
        },
        interactivity: {
          events: {
            onHover: { enable: true, mode: 'grab' },
            resize: { enable: true } as any,
          },
          modes: {
            grab: { distance: 120, links: { opacity: 0.08 } },
          },
        },
        detectRetina: true,
      }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
