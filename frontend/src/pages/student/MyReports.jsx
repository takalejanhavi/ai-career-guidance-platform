import { useState }   from 'react';
import { Link }        from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion }      from 'framer-motion';
import { FileText, Download, Share2, Clock, Shield, ExternalLink, Plus, Trash2, Eye, AlertCircle } from 'lucide-react';
import { reportApi, permissionApi } from '@/services/api';
import { Badge, Button, EmptyState, PageLoader, Modal, Input } from '@/components/common';
import { containerVariants, cardVariants } from '@/animations/variants';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ─── My Reports ───────────────────────────────────────────────────
export function MyReports() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn:  () => reportApi.getMy({ limit: 20 }).then(r => r.data.data),
  });

  if (isLoading) return <PageLoader />;
  const reports = data ?? [];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <motion.div variants={cardVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-primary">My Reports</h1>
          <p className="text-sm text-muted mt-0.5">{reports.length} career guidance reports</p>
        </div>
      </motion.div>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="Complete an assessment to generate your first career guidance report"
          action={<Link to="/student/assessment"><Button variant="brand" icon={FileText}>Take Assessment</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r, i) => (
            <motion.div
              key={r._id}
              variants={cardVariants}
              className="card p-5 card-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary">{r.title}</h3>
                  <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant={r.status === 'ready' ? 'success' : 'warning'}>{r.status}</Badge>
                    {r.blockchain?.status === 'confirmed' && <Badge variant="indigo"><Shield className="w-3 h-3" />Verified</Badge>}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Link to={`/student/reports/${r._id}`}>
                  <Button variant="ghost" size="sm" icon={Eye}>View</Button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default MyReports;
