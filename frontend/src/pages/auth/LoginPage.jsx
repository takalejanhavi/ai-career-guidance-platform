import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Divider } from '@/components/common';
import toast from 'react-hot-toast';

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const navigate  = useNavigate();
  const { setAuth } = useAuthStore();
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const loginMut = useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess:  (res) => {
      const { user, accessToken } = res.data.data;
      setAuth(user, accessToken);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/dashboard');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Login failed');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary">Welcome back</h1>
        <p className="text-sm text-muted mt-1">Sign in to your MentorChain account</p>
      </div>

      <form onSubmit={handleSubmit(d => loginMut.mutate(d))} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          icon={Mail}
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="space-y-1.5">
          <Input
            label="Password"
            type={showPw ? 'text' : 'password'}
            placeholder="••••••••"
            icon={Lock}
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="flex items-center gap-1 text-xs text-muted hover:text-secondary transition-colors"
            >
              {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPw ? 'Hide' : 'Show'}
            </button>
            <Link to="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          variant="brand"
          size="lg"
          loading={loginMut.isPending}
          className="w-full"
        >
          Sign in
          <ArrowRight className="w-4 h-4" />
        </Button>
      </form>

      <Divider label="Demo accounts" />

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Student',       email: 'student@demo.com',       pw: 'Student@1234!' },
          { label: 'Psychologist',  email: 'psychologist@demo.com',  pw: 'Psych@1234!' },
        ].map(({ label, email, pw }) => (
          <motion.button
            key={label}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => loginMut.mutate({ email, password: pw })}
            className="btn-ghost text-xs py-2 w-full"
          >
            Demo {label}
          </motion.button>
        ))}
      </div>

      <p className="text-center text-sm text-muted">
        Don't have an account?{' '}
        <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          Create one free
        </Link>
      </p>
    </div>
  );
}
