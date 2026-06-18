/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cal Sans"', '"DM Sans"', 'sans-serif'],
        body:    ['"DM Sans"', '"Plus Jakarta Sans"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        // Core brand palette
        void:    '#080B14',
        surface: '#0D1117',
        card:    '#111827',
        border:  '#1E2A3A',
        // Blue-purple gradient stops
        indigo:  { 400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA' },
        violet:  { 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED' },
        azure:   { 400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB' },
        // Accent & semantic
        success: { DEFAULT: '#10B981', dark: '#059669', muted: '#10B98120' },
        warning: { DEFAULT: '#F59E0B', dark: '#D97706', muted: '#F59E0B20' },
        danger:  { DEFAULT: '#EF4444', dark: '#DC2626', muted: '#EF444420' },
        info:    { DEFAULT: '#06B6D4', dark: '#0891B2', muted: '#06B6D420' },
        // Text
        primary:   '#F1F5F9',
        secondary: '#94A3B8',
        muted:     '#475569',
      },
      backgroundImage: {
        'brand-gradient':    'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #3B82F6 100%)',
        'brand-gradient-r':  'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #6366F1 100%)',
        'card-gradient':     'linear-gradient(135deg, #111827 0%, #0F172A 100%)',
        'glow-indigo':       'radial-gradient(ellipse at center, #6366F140 0%, transparent 70%)',
        'glow-violet':       'radial-gradient(ellipse at center, #8B5CF640 0%, transparent 70%)',
        'mesh':              'radial-gradient(at 40% 20%, #6366F115 0px, transparent 50%), radial-gradient(at 80% 0%, #8B5CF610 0px, transparent 50%), radial-gradient(at 0% 50%, #3B82F610 0px, transparent 50%)',
      },
      boxShadow: {
        'glow-sm':  '0 0 12px rgba(99,102,241,0.25)',
        'glow-md':  '0 0 24px rgba(99,102,241,0.35)',
        'glow-lg':  '0 0 48px rgba(99,102,241,0.45)',
        'card':     '0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
        'card-hover': '0 8px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08) inset',
      },
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
        'float':      'float 6s ease-in-out infinite',
        'shimmer':    'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
