import { useEffect, useState } from 'react';

interface ResultBarProps {
  /** id of the result section this bar points to. */
  targetId: string;
  label: string;
  value: string;
}

/**
 * On phones the result sits below the form. This bar keeps the headline number in view
 * and jumps to the full result; it hides itself once the result is on screen.
 */
export function ResultBar({ targetId, label, value }: ResultBarProps) {
  const [resultVisible, setResultVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setResultVisible(entry?.isIntersecting ?? false), { threshold: 0.05 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (resultVisible) return null;
  return (
    <div className="result-bar" role="status">
      <span>
        {label} <strong>{value}</strong>
      </span>
      <button type="button" onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        See details
      </button>
    </div>
  );
}
