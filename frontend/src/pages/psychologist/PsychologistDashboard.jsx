import { useQuery }   from '@tanstack/react-query';
import { Link }       from 'react-router-dom';
import { motion }     from 'framer-motion';
import { Users, FileText, Star, Eye } from 'lucide-react';
import { dashboardApi, permissionApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { StatCard, SkeletonCard, Badge, Button, EmptyState } from '@/components/common';
import { containerVariants, cardVariants } from '@/animations/variants';

export default function PsychologistDashboard() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => dashboardApi.get().then(r => r.data.data),
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={cardVariants}>
        <h1 className="text-2xl font-display font-bold text-primary">
          Welcome, <span className="gradient-text">{user?.firstName}</span>
        </h1>
        <p className="text-sm text-secondary mt-1">Your students and shared reports</p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <motion.div variants={cardVariants}><StatCard label="Shared Reports" value={data?.sharedWithMe?.length ?? 0} icon={FileText} color="indigo" /></motion.div>
            <motion.div variants={cardVariants}><StatCard label="Students" value={data?.studentSummary?.length ?? 0} icon={Users} color="violet" /></motion.div>
            <motion.div variants={cardVariants}><StatCard label="Unread Notifs" value={data?.unreadCount ?? 0} icon={Star} color="warning" /></motion.div>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <motion.div variants={cardVariants} className="card p-5">
          <h2 className="text-sm font-semibold text-primary mb-4">Recent Shared Reports</h2>
          <div className="space-y-2">
            {data?.sharedWithMe?.slice(0,5).map(p => (
              <div key={p._id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-primary">{p.reportId?.title || 'Report'}</p>
                  <p className="text-xs text-muted">From: {p.grantedBy?.firstName} {p.grantedBy?.lastName}</p>
                </div>
                <Link to={`/psychologist/reports/${p.reportId?._id}`}>
                  <Button variant="ghost" size="sm" icon={Eye}>View</Button>
                </Link>
              </div>
            ))}
            {!data?.sharedWithMe?.length && (
              <EmptyState icon={FileText} title="No shared reports" description="Students will share reports with you here" />
            )}
          </div>
        </motion.div>

        <motion.div variants={cardVariants} className="card p-5">
          <h2 className="text-sm font-semibold text-primary mb-4">Students Activity</h2>
          <div className="space-y-2">
            {data?.studentSummary?.slice(0,5).map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center text-white text-xs font-bold">
                    {i + 1}
                  </div>
                  <p className="text-sm text-secondary">{s.reportCount} report{s.reportCount > 1 ? 's' : ''} shared</p>
                </div>
                <p className="text-xs text-muted">{new Date(s.lastSharedAt).toLocaleDateString()}</p>
              </div>
            ))}
            {!data?.studentSummary?.length && <p className="text-sm text-muted text-center py-4">No student activity yet</p>}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
