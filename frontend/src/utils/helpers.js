import { clsx }     from 'clsx';
import { twMerge }  from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

// ─── Class name helper ────────────────────────────────────────────
export const cn = (...inputs) => twMerge(clsx(inputs));

// ─── Date formatting ──────────────────────────────────────────────
export const timeAgo = (date) =>
  formatDistanceToNow(new Date(date), { addSuffix: true });

export const formatDate = (date, fmt = 'MMM d, yyyy') =>
  format(new Date(date), fmt);

export const formatDateTime = (date) =>
  format(new Date(date), 'MMM d, yyyy · h:mm a');

// ─── Number formatting ────────────────────────────────────────────
export const formatScore = (score) =>
  typeof score === 'number' ? `${Math.round(score)}%` : '—';

export const formatSalary = (min, max, currency = 'USD') => {
  if (!min && !max) return 'Not specified';
  const fmt = (n) => `$${(n / 1000).toFixed(0)}k`;
  return min && max ? `${fmt(min)} – ${fmt(max)}` : min ? `From ${fmt(min)}` : `Up to ${fmt(max)}`;
};

// ─── String helpers ───────────────────────────────────────────────
export const capitalize = (s = '') =>
  s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

export const truncate = (s = '', max = 100) =>
  s.length > max ? `${s.slice(0, max)}…` : s;

export const initials = (first = '', last = '') =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

// ─── Match score helpers ──────────────────────────────────────────
export const matchLabel = (score) => {
  if (score >= 80) return { label: 'Excellent', color: 'success' };
  if (score >= 65) return { label: 'Good',      color: 'indigo'  };
  if (score >= 50) return { label: 'Fair',      color: 'warning' };
  return              { label: 'Low',        color: 'danger'  };
};

// ─── Role helpers ─────────────────────────────────────────────────
export const basePath = (role) => {
  if (role === 'psychologist' || role === 'admin') return '/psychologist';
  return '/student';
};

// ─── Array helpers ────────────────────────────────────────────────
export const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

// ─── Error message extractor ──────────────────────────────────────
export const getErrorMessage = (err) =>
  err?.response?.data?.message ||
  err?.response?.data?.errors?.[0]?.message ||
  err?.message ||
  'An unexpected error occurred';
