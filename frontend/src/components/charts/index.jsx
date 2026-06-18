import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PolarRadiusAxis, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { motion } from 'framer-motion';

const COLORS = { indigo: '#6366F1', violet: '#8B5CF6', azure: '#3B82F6', success: '#10B981', warning: '#F59E0B', danger: '#EF4444' };
const GRAD_DEFS = (id, color, alpha = 0.3) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor={color} stopOpacity={alpha} />
      <stop offset="95%" stopColor={color} stopOpacity={0.02}  />
    </linearGradient>
  </defs>
);

const tooltipStyle = {
  contentStyle: { background: '#111827', border: '1px solid #1E2A3A', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', color: '#F1F5F9', fontSize: 12 },
  cursor: { stroke: '#6366F1', strokeWidth: 1, strokeDasharray: '4 4' },
};
const axisStyle = { tick: { fill: '#475569', fontSize: 11 }, axisLine: false, tickLine: false };

// ─── Score Area Chart ─────────────────────────────────────────────
export function ScoreTrendChart({ data, className }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className={className}>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          {GRAD_DEFS('scoreGrad', COLORS.indigo)}
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" vertical={false} />
          <XAxis dataKey="date" {...axisStyle} tickFormatter={d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
          <YAxis {...axisStyle} domain={[0, 100]} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Score']} />
          <Area type="monotone" dataKey="overallScore" stroke={COLORS.indigo} strokeWidth={2} fill="url(#scoreGrad)" dot={{ fill: COLORS.indigo, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── Assessment Trend Bar Chart ───────────────────────────────────
export function AssessmentBarChart({ data, className }) {
  return (
    <ResponsiveContainer width="100%" height={200} className={className}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barSize={16}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" vertical={false} />
        <XAxis dataKey="_id" {...axisStyle} />
        <YAxis {...axisStyle} />
        <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Assessments']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data?.map((_, i) => (
            <Cell key={i} fill={`url(#barGrad${i % 2})`} />
          ))}
        </Bar>
        <defs>
          <linearGradient id="barGrad0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.indigo} /><stop offset="100%" stopColor={COLORS.violet} />
          </linearGradient>
          <linearGradient id="barGrad1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.azure} /><stop offset="100%" stopColor={COLORS.indigo} />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Radar / Dimension Chart ──────────────────────────────────────
export function DimensionRadarChart({ data, className }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className={className}>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#1E2A3A" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
          <Radar name="Score" dataKey="score" stroke={COLORS.indigo} fill={COLORS.indigo} fillOpacity={0.2} strokeWidth={2} dot={{ fill: COLORS.indigo, r: 3 }} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Score']} />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── Career Distribution Pie ──────────────────────────────────────
const PIE_COLORS = [COLORS.indigo, COLORS.violet, COLORS.azure, COLORS.success, COLORS.warning];

export function CareerPieChart({ data, className }) {
  return (
    <ResponsiveContainer width="100%" height={200} className={className}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={50} outerRadius={75}
          paddingAngle={3}
          dataKey="count"
          nameKey="_id"
          stroke="none"
        >
          {data?.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1E2A3A', borderRadius: 10, fontSize: 12, color: '#F1F5F9' }}
          formatter={(v, n) => [v, n]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v) => <span style={{ color: '#94A3B8', fontSize: 11 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Match Score Bar (horizontal) ────────────────────────────────
export function MatchScoreBar({ score, label, color = '#6366F1' }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className="font-mono font-medium" style={{ color }}>{score}%</span>
      </div>
      <div className="h-1.5 bg-[#1E2A3A] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }}
        />
      </div>
    </div>
  );
}

// ─── Mini sparkline ───────────────────────────────────────────────
export function Sparkline({ data, color = COLORS.indigo, dataKey = 'value', height = 40 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
