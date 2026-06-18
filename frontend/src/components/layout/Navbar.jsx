import { useState, useRef, useEffect } from 'react';
import { useNavigate }   from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Search, LogOut, User, Settings, ChevronDown, Menu } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi, notificationApi } from '@/services/api';
import { useAuthStore, useUIStore }  from '@/store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout }     = useAuthStore();
  const { toggleSidebar }    = useUIStore();
  const [menuOpen, setMenu]  = useState(false);
  const [notifOpen, setNotif]= useState(false);
  const menuRef   = useRef();
  const notifRef  = useRef();

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn:  () => notificationApi.getAll({ limit: 8 }).then(r => r.data.data),
    refetchInterval: 30000,
  });

  const logoutMut = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess:  () => { logout(); navigate('/login'); },
    onError:    () => { logout(); navigate('/login'); },
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))  setMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotif(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifData?.data?.filter(n => !n.isRead).length ?? 0;
  const basePath = user?.role === 'psychologist' || user?.role === 'admin' ? '/psychologist' : '/student';

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20 shrink-0">

      {/* Left */}
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="btn-ghost !p-2 lg:hidden">
          <Menu className="w-5 h-5" />
        </button>

        {/* Search */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-muted pointer-events-none" />
          <input
            className="input !py-2 !pl-9 !pr-4 w-64 text-sm"
            placeholder="Search reports, students…"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setNotif(v => !v); setMenu(false); }}
            className={clsx('btn-ghost !p-2 relative', notifOpen && 'border-border-light')}
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-80 card shadow-card z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {unread > 0 && (
                    <button
                      onClick={() => notificationApi.markAllRead()}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {notifData?.data?.length ? notifData.data.map(n => (
                    <div key={n._id} className={clsx(
                      'px-4 py-3 hover:bg-white/3 transition-colors',
                      !n.isRead && 'bg-indigo-500/5'
                    )}>
                      <p className="text-sm font-medium text-primary leading-snug">{n.title}</p>
                      <p className="text-xs text-muted mt-0.5">{n.summary}</p>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center text-sm text-muted">No notifications</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => { setMenu(v => !v); setNotif(false); }}
            className="flex items-center gap-2 btn-ghost !py-1.5 !px-2"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center text-white text-xs font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <span className="hidden sm:block text-sm font-medium text-primary max-w-[100px] truncate">
              {user?.firstName}
            </span>
            <ChevronDown className={clsx('w-4 h-4 text-muted transition-transform', menuOpen && 'rotate-180')} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-48 card shadow-card z-50 py-1.5"
              >
                {[
                  { icon: User,     label: 'Profile',  path: `${basePath}/profile` },
                  { icon: Settings, label: 'Settings', path: `${basePath}/settings` },
                ].map(({ icon: Icon, label, path }) => (
                  <button
                    key={path}
                    onClick={() => { navigate(path); setMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-secondary hover:text-primary hover:bg-white/4 transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => logoutMut.mutate()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
