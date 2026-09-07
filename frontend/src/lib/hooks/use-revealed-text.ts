import { useEffect, useRef, useState } from 'react';

// Paces text that arrives in bursts so it reads as typed rather than pasted.
// Each frame reveals a tenth of what is still hidden (at least one character),
// so a large chunk catches up within a few hundred milliseconds while short
// tails type out one character at a time. Reduced-motion users see text as it
// arrives. The revealed text only ever grows toward `target`; a target that no
// longer extends it (a new reply) starts over from nothing.
export function useRevealedText(target: string) {
  const [shown, setShown] = useState('');
  const shownRef = useRef('');

  useEffect(() => {
    const instant = typeof requestAnimationFrame === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!target.startsWith(shownRef.current)) shownRef.current = '';
    if (instant) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const step = () => {
      const current = shownRef.current;
      if (current.length >= target.length) return;
      const next = target.slice(0, current.length + Math.max(1, Math.ceil((target.length - current.length) / 10)));
      shownRef.current = next;
      setShown(next);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
