import { motion }      from 'framer-motion';
import { useForm }     from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { authApi }     from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { Input, Button, Badge } from '@/components/common';
import { containerVariants, cardVariants } from '@/animations/variants';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { register, handleSubmit, reset } = useForm();

  const changePwMut = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess:  () => { toast.success('Password changed'); reset(); },
    onError:    (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-xl space-y-6">
      <motion.div variants={cardVariants}>
        <h1 className="text-xl font-display font-bold text-primary">Settings</h1>
        <p className="text-sm text-muted mt-0.5">Account and security settings</p>
      </motion.div>

      <motion.div variants={cardVariants} className="card p-6">
        <h2 className="text-sm font-semibold text-primary mb-4">Account Info</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted">Email</span>
            <span className="text-secondary">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted">Role</span>
            <Badge variant="indigo" className="capitalize">{user?.role}</Badge>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted">Email verified</span>
            <Badge variant={user?.isEmailVerified ? 'success' : 'warning'}>
              {user?.isEmailVerified ? 'Verified' : 'Pending'}
            </Badge>
          </div>
        </div>
      </motion.div>

      <motion.div variants={cardVariants} className="card p-6">
        <h2 className="text-sm font-semibold text-primary mb-4">Change Password</h2>
        <form onSubmit={handleSubmit(d => changePwMut.mutate(d))} className="space-y-4">
          <Input label="Current password"     type="password" placeholder="••••••••" {...register('currentPassword')} />
          <Input label="New password"         type="password" placeholder="••••••••" {...register('newPassword')} />
          <Input label="Confirm new password" type="password" placeholder="••••••••" {...register('confirmPassword')} />
          <Button type="submit" variant="brand" loading={changePwMut.isPending} className="w-full">
            Update Password
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}
