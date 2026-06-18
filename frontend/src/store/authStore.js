import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:            null,
      accessToken:     null,
      isAuthenticated: false,

      setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      setUser: (user)              => set({ user }),
      setToken:(token)             => set({ accessToken: token }),

      logout: () => set({ user: null, accessToken: null, isAuthenticated: false }),

      hasRole: (role) => get().user?.role === role,
      isStudent:       () => get().user?.role === 'student',
      isPsychologist:  () => get().user?.role === 'psychologist',
      isAdmin:         () => get().user?.role === 'admin',
    }),
    {
      name: 'cgp_auth',
      partialise: (state) => ({ user: state.user, accessToken: state.accessToken, isAuthenticated: state.isAuthenticated }),
    }
  )
);

export const useUIStore = create((set) => ({
  sidebarOpen:     true,
  toggleSidebar:   () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar:      (v) => set({ sidebarOpen: v }),
}));
