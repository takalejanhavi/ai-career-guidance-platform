import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Phone, ArrowRight, GraduationCap, Stethoscope } from 'lucide-react';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { Button, Input } from '@/components/common';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const schema = z.object({
  firstName : z.string().min(1, 'Required'),
  lastName  : z.string().min(1, 'Required'),
  email     : z.string().email('Enter a valid email'),
  password  : z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'One uppercase letter')
    .regex(/[0-9]/, 'One number')
    .regex(/[^A-Za-z0-9]/, 'One special character'),
  role: z.enum(['student', 'psychologist']),
});

function PasswordStrength({ password = '' }) {
  const checks = [
    { label: '8+ characters',    ok: password.length >= 8 },
    { label: 'Uppercase',        ok: /[A-Z]/.test(password) },
    { label: 'Number',           ok: /[0-9]/.test(password) },
    { label: 'Special char',     ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-danger', 'bg-warning', 'bg-warning', 'bg-success', 'bg-success'];

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={clsx('h-1 flex-1 rounded-full transition-colors duration-300',
            i < score ? colors[score] : 'bg-border'
          )} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map(({ label, ok }) => (
          <span key={label} className={clsx('text-xs transition-colors', ok ? 'text-success' : 'text-muted')}>
            {ok ? '✓' : '·'} {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const navigate  = useNavigate();
  const { setAuth } = useAuthStore();
  const [role, setRole] = useState('student');
  const [pwVal, setPwVal] = useState('');

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: 'student' },
  });

  const pw = watch('password', '');

  const registerMut = useMutation({
    mutationFn: (data) => authApi.register(data),
    onSuccess:  (res) => {
      toast.success('Account created! Please verify your email.');
      navigate('/login');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Registration failed');
    },
  });

  const handleRoleSelect = (r) => {
    setRole(r);
    setValue('role', r);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary">Create account</h1>
        <p className="text-sm text-muted mt-1">Start your career guidance journey</p>
      </div>

      {/* Role selector */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: 'student',      icon: GraduationCap, label: 'Student',      desc: 'Take assessments' },
          { value: 'psychologist', icon: Stethoscope,   label: 'Psychologist', desc: 'Guide students' },
        ].map(({ value, icon: Icon, label, desc }) => (
          <motion.button
            key={value}
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelect(value)}
            className={clsx(
              'p-4 rounded-xl border text-left transition-all duration-150',
              role === value
                ? 'border-indigo-500/60 bg-indigo-500/10'
                : 'border-border hover:border-border-light bg-transparent'
            )}
          >
            <Icon className={clsx('w-5 h-5 mb-2', role === value ? 'text-indigo-400' : 'text-muted')} />
            <div className="text-sm font-semibold text-primary">{label}</div>
            <div className="text-xs text-muted">{desc}</div>
          </motion.button>
        ))}
      </div>

      <form onSubmit={handleSubmit(d => registerMut.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" placeholder="Alex" icon={User} error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name"  placeholder="Smith" error={errors.lastName?.message} {...register('lastName')} />
        </div>

        <Input label="Email" type="email" placeholder="you@example.com" icon={Mail} error={errors.email?.message} {...register('email')} />

        <div>
          <Input
            label="Password"
            type="password"
            placeholder="Create a strong password"
            icon={Lock}
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrength password={pw} />
        </div>

        <input type="hidden" {...register('role')} />

        <Button type="submit" variant="brand" size="lg" loading={registerMut.isPending} className="w-full">
          Create account
          <ArrowRight className="w-4 h-4" />
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
