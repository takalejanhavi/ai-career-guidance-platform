import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── cn utility ───────────────────────────────────────────────────
export const cn = (...inputs) => twMerge(clsx(inputs));

// ─── Button ───────────────────────────────────────────────────────
export const Button = forwardRef(({
  children, variant = 'brand', size = 'md',
  loading = false, disabled, className, icon: Icon, iconRight, ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 cursor-pointer border-0 select-none';

  const variants = {
    brand:   'bg-brand-gradient text-white shadow-glow-sm hover:opacity-90 hover:-translate-y-0.5 hover:shadow-glow-md active:scale-[0.98]',
    ghost:   'bg-transparent border border-border text-secondary hover:text-primary hover:bg-white/5 hover:border-border-light',
    danger:  'bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20',
    success: 'bg-success/10 border border-success/20 text-success hover:bg-success/20',
    outline: 'bg-transparent border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-base px-6 py-3',
  };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], (disabled || loading) && 'opacity-50 cursor-not-allowed !translate-y-0', className)}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}
      {children}
      {iconRight && !loading && <iconRight className="w-4 h-4" />}
    </button>
  );
});
Button.displayName = 'Button';

// ─── Input ────────────────────────────────────────────────────────
export const Input = forwardRef(({ label, error, hint, icon: Icon, className, ...props }, ref) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-secondary">{label}</label>}
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />}
      <input
        ref={ref}
        className={cn('input', Icon && 'pl-10', error && '!border-danger !shadow-none focus:!shadow-[0_0_0_3px_rgba(239,68,68,0.15)]', className)}
        {...props}
      />
    </div>
    {error && <p className="text-xs text-danger">{error}</p>}
    {hint && !error && <p className="text-xs text-muted">{hint}</p>}
  </div>
));
Input.displayName = 'Input';

// ─── Badge ────────────────────────────────────────────────────────
const badgeVariants = {
  default:  'bg-border text-secondary',
  indigo:   'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
  success:  'bg-success/15 text-success border border-success/20',
  warning:  'bg-warning/15 text-warning border border-warning/20',
  danger:   'bg-danger/15 text-danger border border-danger/20',
  info:     'bg-info/15 text-info border border-info/20',
  violet:   'bg-violet-500/15 text-violet-400 border border-violet-500/20',
};

export function Badge({ children, variant = 'default', className }) {
  return (
    <span className={cn('badge', badgeVariants[variant], className)}>
      {children}
    </span>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────
export function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return <Loader2 className={cn('animate-spin text-indigo-400', sizes[size], className)} />;
}

// ─── PageLoader ───────────────────────────────────────────────────
export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Loading…</p>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md', className }) {
  const maxW = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-void/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={cn('relative card w-full shadow-card', maxW[size], className)}
          >
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-primary">{title}</h2>
                <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, change, changeLabel, color = 'indigo', className }) {
  const colors = {
    indigo:  { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
    violet:  { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
    success: { bg: 'bg-success/10',    text: 'text-success',    border: 'border-success/20' },
    warning: { bg: 'bg-warning/10',    text: 'text-warning',    border: 'border-warning/20' },
    azure:   { bg: 'bg-azure-500/10',  text: 'text-azure-400',  border: 'border-azure-500/20' },
  };
  const c = colors[color] || colors.indigo;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cn('card p-5 card-hover relative overflow-hidden', className)}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-primary">{value}</p>
          {change !== undefined && (
            <p className={cn('text-xs mt-1', change >= 0 ? 'text-success' : 'text-danger')}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% {changeLabel}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center border', c.bg, c.border)}>
            <Icon className={cn('w-5 h-5', c.text)} />
          </div>
        )}
      </div>
      {/* Subtle gradient corner */}
      <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full opacity-10 bg-glow-indigo" />
    </motion.div>
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────
export function SkeletonCard({ className }) {
  return (
    <div className={cn('card p-5 space-y-3 overflow-hidden', className)}>
      <div className="shimmer h-3 w-24 rounded-full" />
      <div className="shimmer h-7 w-16 rounded-lg" />
      <div className="shimmer h-2 w-32 rounded-full" />
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-indigo-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-primary mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────
export function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      {label && <span className="text-xs text-muted shrink-0">{label}</span>}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, color = 'brand', label, showValue = true, className }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={cn('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-muted">{label}</span>}
          {showValue && <span className="text-secondary font-medium">{pct}%</span>}
        </div>
      )}
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={color === 'brand' ? 'h-full bg-brand-gradient rounded-full' : `h-full bg-${color}-500 rounded-full`}
        />
      </div>
    </div>
  );
}
