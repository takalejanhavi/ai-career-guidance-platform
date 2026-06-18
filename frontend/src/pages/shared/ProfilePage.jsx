import { motion }      from 'framer-motion';
import { useForm }     from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { userApi }     from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { Input, Button, Badge } from '@/components/common';
import { containerVariants, cardVariants } from '@/animations/variants';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { register, handleSubmit } = useForm({
    defaultValues: { firstName: user?.firstName, lastName: user?.lastName, phone: user?.phone || '' },
  });

  const updateMut = useMutation({
    mutationFn: (data) => userApi.updateProfile(data),
    onSuccess:  (res)  => { setUser(res.data.data.user); toast.success('Profile updated!'); },
    onError:    ()     => toast.error('Update failed'),
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-xl space-y-6">
      <motion.div variants={cardVariants}>
        <h1 className="text-xl font-display font-bold text-primary">Profile</h1>
        <p className="text-sm text-muted mt-0.5">Manage your personal information</p>
      </motion.div>

      <motion.div variants={cardVariants} className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-xl font-bold shadow-glow-sm">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary">{user?.firstName} {user?.lastName}</h2>
            <p className="text-sm text-muted">{user?.email}</p>
            <Badge variant="indigo" className="mt-1 capitalize">{user?.role}</Badge>
          </div>
        </div>

        <form onSubmit={handleSubmit(d => updateMut.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" {...register('firstName')} />
            <Input label="Last name"  {...register('lastName')} />
          </div>
          <Input label="Phone" type="tel" placeholder="+1 234 567 8900" {...register('phone')} />
          <Button type="submit" variant="brand" loading={updateMut.isPending} className="w-full">
            Save Changes
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}
