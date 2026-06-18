import { useQuery } from '@tanstack/react-query';
import { Link }     from 'react-router-dom';
import { motion }   from 'framer-motion';
import { Eye }      from 'lucide-react';
import { permissionApi } from '@/services/api';
import { Badge, Button } from '@/components/common';
import { containerVariants, cardVariants } from '@/animations/variants';

export default function StudentsList() {
  const { data = [] } = useQuery({
    queryKey: ['shared-with-me'],
    queryFn:  () => permissionApi.sharedWithMe().then(r => r.data.data?.sharedReports ?? []),
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <motion.div variants={cardVariants}>
        <h1 className="text-xl font-display font-bold text-primary">Students</h1>
        <p className="text-sm text-muted mt-0.5">Reports shared with you</p>
      </motion.div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Report','Shared By','Permissions','Date','Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map(p => (
                <tr key={p._id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 font-medium text-primary">{p.reportId?.title || 'Report'}</td>
                  <td className="px-4 py-3 text-secondary">{p.grantedBy?.firstName} {p.grantedBy?.lastName}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">{p.permissions?.map(c => <Badge key={c} variant="default">{c}</Badge>)}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Link to={`/psychologist/reports/${p.reportId?._id}`}>
                      <Button variant="ghost" size="sm" icon={Eye}>View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No shared reports yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
