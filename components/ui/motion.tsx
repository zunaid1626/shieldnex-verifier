'use client';

import React, {
  forwardRef,
  HTMLAttributes,
  TableHTMLAttributes,
  useEffect,
} from 'react';

export interface MotionVariant {
  opacity?: number;
  y?: number | string;
  x?: number | string;
  scale?: number;
  transition?: {
    duration?: number;
    delay?: number;
    ease?: string;
    staggerChildren?: number;
  };
}

export interface MotionVariants {
  hidden?: MotionVariant;
  show?: MotionVariant;
  visible?: MotionVariant;
  exit?: MotionVariant;
  [key: string]: MotionVariant | undefined;
}

export interface MotionProps {
  initial?: string | boolean | MotionVariant;
  animate?: string | MotionVariant;
  exit?: string | MotionVariant;
  variants?: MotionVariants;
  transition?: {
    duration?: number;
    delay?: number;
    staggerChildren?: number;
    ease?: string;
  };
  custom?: number;
  layout?: boolean;
  whileHover?: MotionVariant;
}

export type MotionHTMLProps<T> = HTMLAttributes<T> & MotionProps;

/**
 * Calculates CSS inline styles for staggered physics transitions based on variants & custom index
 */
function getStaggerStyles(
  custom = 0,
  variants?: MotionVariants,
  transition?: MotionProps['transition']
): React.CSSProperties {
  const staggerDelay =
    transition?.staggerChildren ??
    variants?.show?.transition?.staggerChildren ??
    0.045;

  const baseDelay = transition?.delay ?? 0;
  const delaySec = baseDelay + custom * staggerDelay;

  return {
    animation: `motionStaggerIn 380ms cubic-bezier(0.16, 1, 0.3, 1) ${delaySec}s forwards`,
    opacity: 0,
    transform: 'translateY(10px)',
    willChange: 'transform, opacity',
  };
}

// Global stylesheet injector for the staggered keyframes
let styleInjected = false;
function ensureKeyframes() {
  if (typeof document === 'undefined' || styleInjected) return;
  const styleEl = document.createElement('style');
  styleEl.setAttribute('id', 'shieldnex-motion-styles');
  styleEl.textContent = `
    @keyframes motionStaggerIn {
      0% {
        opacity: 0;
        transform: translateY(12px) scale(0.99);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @keyframes motionPulseSlow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(styleEl);
  styleInjected = true;
}

export const motion = {
  div: forwardRef<HTMLDivElement, MotionHTMLProps<HTMLDivElement>>(
    function MotionDiv(
      { initial, variants, transition, custom = 0, style, children, className, ...props },
      ref
    ) {
      useEffect(() => {
        ensureKeyframes();
      }, []);

      const motionStyle =
        initial === 'hidden' || variants
          ? { ...getStaggerStyles(custom, variants, transition), ...style }
          : style;

      return (
        <div ref={ref} className={className} style={motionStyle} {...props}>
          {children}
        </div>
      );
    }
  ),

  tr: forwardRef<
    HTMLTableRowElement,
    HTMLAttributes<HTMLTableRowElement> & MotionProps
  >(function MotionTr(
    { initial, variants, transition, custom = 0, style, children, className, ...props },
    ref
  ) {
    useEffect(() => {
      ensureKeyframes();
    }, []);

    const motionStyle =
      initial === 'hidden' || variants
        ? { ...getStaggerStyles(custom, variants, transition), ...style }
        : style;

    return (
      <tr ref={ref} className={className} style={motionStyle} {...props}>
        {children}
      </tr>
    );
  }),

  tbody: forwardRef<
    HTMLTableSectionElement,
    HTMLAttributes<HTMLTableSectionElement> & MotionProps
  >(function MotionTbody({ children, className, style, ...props }, ref) {
    return (
      <tbody ref={ref} className={className} style={style} {...props}>
        {children}
      </tbody>
    );
  }),

  table: forwardRef<
    HTMLTableElement,
    TableHTMLAttributes<HTMLTableElement> & MotionProps
  >(function MotionTable({ children, className, style, ...props }, ref) {
    return (
      <table ref={ref} className={className} style={style} {...props}>
        {children}
      </table>
    );
  }),

  span: forwardRef<HTMLSpanElement, MotionHTMLProps<HTMLSpanElement>>(
    function MotionSpan({ children, className, style, ...props }, ref) {
      return (
        <span ref={ref} className={className} style={style} {...props}>
          {children}
        </span>
      );
    }
  ),
};

export function AnimatePresence({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
