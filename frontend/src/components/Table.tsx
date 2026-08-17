import type { ReactNode } from 'react';

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800 text-sm bg-slate-900/20">
        <thead className="bg-slate-900 text-slate-300">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-bold text-xs uppercase tracking-wider text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900/60 text-slate-200">
          {children}
        </tbody>
      </table>
    </div>
  );
}
