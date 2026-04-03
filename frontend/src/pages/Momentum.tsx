import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { CATEGORY_COLORS } from '@/lib/types';

interface WeeklyData {
  today: number[];
  week: number[];
  streak: number;
  needsAttention?: boolean;
}

const MOCK_WEEKLY: Record<string, WeeklyData> = {
  Work: { today: [3, 3], week: [3, 2, 3, 3, 2, 3, 3], streak: 6 },
  Gym: { today: [0, 1], week: [1, 1, 0, 1, 0, 0, 0], streak: 0, needsAttention: true },
  'Personal Growth': { today: [1, 2], week: [1, 2, 1, 0, 1, 2, 1], streak: 2 },
  Health: { today: [1, 1], week: [1, 1, 0, 1, 1, 1, 1], streak: 3 },
  Finance: { today: [0, 1], week: [0, 1, 0, 0, 0, 1, 0], streak: 0 },
};

export default function Momentum() {
  const { categories } = useAppStore();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-heading text-foreground mb-1">Momentum</h1>
      <p className="text-sm text-muted-foreground mb-6">Progress across every area of your life.</p>

      {/* Summary strip */}
      <div className="bg-accent border border-border rounded-lg px-6 py-4 flex items-center justify-around mb-8">
        {[
          { value: '18', label: 'tasks this week' },
          { value: '5', label: 'categories active' },
          { value: 'Work', label: 'best streak · 6 days', color: CATEGORY_COLORS.Work },
        ].map((s, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className="text-display" style={{ color: s.color || 'hsl(var(--foreground))' }}>{s.value}</span>
            <span className="text-xs text-muted-foreground mt-1">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(MOCK_WEEKLY).map(([cat, data]) => {
          const color = CATEGORY_COLORS[cat] || '#888';
          const pct = data.today[1] > 0 ? (data.today[0] / data.today[1]) * 100 : 0;
          return (
            <div key={cat} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium text-foreground">{cat}</span>
                {data.needsAttention && (
                  <span className="text-[11px] px-2 py-0.5 rounded border"
                    style={{ backgroundColor: 'rgba(251,191,36,0.1)', color: 'hsl(var(--amber))', borderColor: 'rgba(251,191,36,0.3)' }}>
                    Needs attention
                  </span>
                )}
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Today</span>
                  <span className="text-foreground">{data.today[0]} / {data.today[1]} tasks</span>
                </div>
                <div className="h-1 bg-accent rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6 }} className="h-full rounded-full" style={{ backgroundColor: color }} />
                </div>
              </div>

              <p className="text-caption mb-2">7-day view</p>
              <div className="flex items-end gap-[3px] h-8">
                {data.week.map((v, i) => {
                  const maxVal = Math.max(...data.week, 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      {i === data.week.length - 1 && <span className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: color }} />}
                      <div className="w-full rounded-sm" style={{
                        height: `${(v / maxVal) * 32}px`,
                        backgroundColor: color,
                        opacity: i === data.week.length - 1 ? 1 : 0.5,
                        minHeight: 2,
                      }} />
                    </div>
                  );
                })}
              </div>

              <p className="text-xs mt-3">
                {data.streak > 0 ? (
                  <span>🔥 {data.streak} day streak</span>
                ) : (
                  <span className="text-muted-foreground">— no streak</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
