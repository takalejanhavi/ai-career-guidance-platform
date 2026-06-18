import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ClipboardList, FileText, Users,
  Shield, User, Settings, ChevronLeft, Zap, Brain,
  BarChart3, Bell,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store/authStore';
import clsx from 'clsx';

const studentLinks = [
  { to: '/student/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/student/assessment',  icon: Brain,           label: 'Assessment' },
  { to: '/student/reports',     icon: FileText,        label: 'Reports' },
  { to: '/student/permissions', icon: Shield,          label: 'Sharing' },
  { to: '/student/profile',     icon: User,            label: 'Profile' },
  { to: '/student/settings',    icon: Settings,        label: 'Settings' },
];

const psychologistLinks = [
  { to: '/psychologist/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/psychologist/students',  icon: Users,           label: 'Students' },
  { to: '/psychologist/profile',   icon: User,            label: 'Profile' },
  { to: '/psychologist/settings',  icon: Settings,        label: 'Settings' },
];

export default function Sidebar() {
  const { user }             = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const links = user?.role === 'psychologist' || user?.role === 'admin'
    ? psychologistLinks : studentLinks;

  return (
    <motion.aside
      animate={{ width: sidebarOpen ? 256 : 72 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="relative flex flex-col bg-surface border-r border-border h-screen sticky top-0 overflow-hidden shrink-0 z-30"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shrink-0 shadow-glow-sm">
          <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="font-display font-bold text-lg gradient-text whitespace-nowrap"
            >
              CareerAI
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative',
              isActive
                ? 'bg-indigo-500/15 text-indigo-400'
                : 'text-secondary hover:text-primary hover:bg-white/5'
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className={clsx(
                  'w-5 h-5 shrink-0 relative z-10 transition-colors',
                  isActive ? 'text-indigo-400' : 'text-muted group-hover:text-secondary'
                )} />
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="text-sm font-medium relative z-10 whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User badge */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shrink-0 text-white text-sm font-bold">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="text-sm font-semibold text-primary truncate leading-tight">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted capitalize">{user?.role}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:border-indigo-500/50 transition-colors z-40"
      >
        <motion.div animate={{ rotate: sidebarOpen ? 0 : 180 }} transition={{ duration: 0.25 }}>
          <ChevronLeft className="w-3 h-3 text-secondary" />
        </motion.div>
      </button>
    </motion.aside>
  );
}
