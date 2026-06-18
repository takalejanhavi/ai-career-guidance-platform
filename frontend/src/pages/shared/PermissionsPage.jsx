import { useState }   from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion }      from 'framer-motion';
import { Shield, Plus, Trash2, Eye, Download, MessageSquare, Users, Clock } from 'lucide-react';
import { reportApi, permissionApi } from '@/services/api';
import { Badge, Button, EmptyState, Modal, Input } from '@/components/common';
import { containerVariants, cardVariants } from '@/animations/variants';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const CAP_ICONS = { view: Eye, download: Download, annotate: MessageSquare };
const CAP_LABELS = { view: 'View', download: 'Download', annotate: 'Annotate' };

export default function PermissionsPage() {
  const qc = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const { data: reports } = useQuery({
    queryKey: ['my-reports'],
    queryFn:  () => reportApi.getMy({ limit: 50 }).then(r => r.data.data ?? []),
  });

  const { data: sharedWithMe } = useQuery({
    queryKey: ['shared-with-me'],
    queryFn:  () => permissionApi.sharedWithMe().then(r => r.data.data?.sharedReports ?? []),
  });

  const revokeMut = useMutation({
    mutationFn: (id) => permissionApi.revoke(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['permissions'] }); toast.success('Access revoked'); },
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={cardVariants}>
        <h1 className="text-xl font-display font-bold text-primary">Report Sharing</h1>
        <p className="text-sm text-muted mt-0.5">Manage who has access to your career reports</p>
      </motion.div>

      {/* Reports you own */}
      <motion.div variants={cardVariants} className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" /> Your Reports
          </h2>
        </div>
        <div className="space-y-2">
          {reports?.filter(r => r.status === 'ready').map(r => (
            <div key={r._id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-border-light transition-colors">
              <div>
                <p className="text-sm font-medium text-primary">{r.title}</p>
                <p className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={Plus}
                onClick={() => { setSelectedReport(r._id); setGrantOpen(true); }}
              >
                Share
              </Button>
            </div>
          ))}
          {!reports?.filter(r => r.status === 'ready').length && (
            <p className="text-sm text-muted text-center py-4">No ready reports to share</p>
          )}
        </div>
      </motion.div>

      {/* Shared with me */}
      {sharedWithMe?.length > 0 && (
        <motion.div variants={cardVariants} className="card p-5">
          <h2 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-violet-400" /> Shared with You
          </h2>
          <div className="space-y-2">
            {sharedWithMe.map(p => (
              <div key={p._id} className="flex items-center justify-between p-3 rounded-xl bg-violet-500/5 border border-violet-500/15">
                <div>
                  <p className="text-sm font-medium text-primary">{p.reportId?.title || 'Report'}</p>
                  <div className="flex gap-1 mt-1">
                    {p.permissions?.map(cap => {
                      const Icon = CAP_ICONS[cap];
                      return (
                        <span key={cap} className="flex items-center gap-0.5 text-xs text-muted">
                          {Icon && <Icon className="w-3 h-3" />} {CAP_LABELS[cap]}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {p.expiresAt && (
                  <div className="text-xs text-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Expires {new Date(p.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Grant permission modal */}
      <Modal open={grantOpen} onClose={() => setGrantOpen(false)} title="Share Report" size="md">
        <GrantPermissionForm
          reportId={selectedReport}
          onSuccess={() => { setGrantOpen(false); qc.invalidateQueries({ queryKey: ['permissions'] }); }}
        />
      </Modal>
    </motion.div>
  );
}

function GrantPermissionForm({ reportId, onSuccess }) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { grantedToEmail: '', permissions: ['view'] },
  });

  const selectedPerms = watch('permissions') || [];

  const grantMut = useMutation({
    mutationFn: (data) => permissionApi.grant(reportId, data),
    onSuccess:  () => { toast.success('Report shared successfully'); onSuccess(); },
    onError:    (err) => toast.error(err.response?.data?.message || 'Failed to share'),
  });

  const togglePerm = (cap) => {
    const current = selectedPerms;
    if (cap === 'view') return; // view always required
    const updated = current.includes(cap) ? current.filter(c => c !== cap) : [...current, cap];
    setValue('permissions', updated);
  };

  return (
    <form onSubmit={handleSubmit(d => grantMut.mutate(d))} className="space-y-4">
      <Input
        label="Psychologist email"
        type="email"
        placeholder="psychologist@example.com"
        error={errors.grantedToEmail?.message}
        {...register('grantedToEmail', { required: 'Email required' })}
      />

      <div>
        <p className="text-sm font-medium text-secondary mb-2">Permissions</p>
        <div className="flex gap-2">
          {Object.entries(CAP_LABELS).map(([cap, label]) => {
            const Icon = CAP_ICONS[cap];
            const active = selectedPerms.includes(cap);
            return (
              <button
                key={cap}
                type="button"
                onClick={() => togglePerm(cap)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                  active ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400' : 'border-border text-muted hover:border-border-light',
                  cap === 'view' && 'opacity-70 cursor-not-allowed'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        label="Expiry date (optional)"
        type="date"
        hint="Leave blank for no expiry"
        {...register('expiresAt')}
      />

      <Input
        label="Message (optional)"
        placeholder="Add a note for the psychologist…"
        {...register('shareMessage')}
      />

      <Button type="submit" variant="brand" className="w-full" loading={grantMut.isPending} icon={Shield}>
        Grant Access
      </Button>
    </form>
  );
}
