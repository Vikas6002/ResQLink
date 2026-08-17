import type { ReactNode } from 'react';

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-850 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md ${className}`}>
      {title && <h2 className="mb-4 text-lg font-bold text-white tracking-wide">{title}</h2>}
      {children}
    </div>
  );
}
