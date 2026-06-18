// ─── hooks/useAuth.js ─────────────────────────────────────────────
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate }           from 'react-router-dom';
import { authApi }               from '@/services/api';
import { useAuthStore }          from '@/store/authStore';
import toast from 'react-hot-toast';

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate    = useNavigate();

  return useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess: (res) => {
      const { user, accessToken } = res.data.data;
      setAuth(user, accessToken);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/dashboard');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Login failed'),
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const navigate   = useNavigate();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled:  () => { logout(); navigate('/login'); },
  });
}

export function useMe() {
  const { isAuthenticated, setUser } = useAuthStore();
  return useQuery({
    queryKey: ['me'],
    queryFn:  () => authApi.me().then(r => {
      setUser(r.data.data.user);
      return r.data.data.user;
    }),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
  });
}
