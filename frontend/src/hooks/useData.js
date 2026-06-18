import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assessmentApi, reportApi, notificationApi } from '@/services/api';
import toast from 'react-hot-toast';

// ─── Assessments ─────────────────────────────────────────────────

export function useAssessments(params = {}) {
  return useQuery({
    queryKey: ['assessments', params],
    queryFn:  () => assessmentApi.getMy(params).then(r => r.data),
  });
}

export function useAssessment(id) {
  return useQuery({
    queryKey: ['assessment', id],
    queryFn:  () => assessmentApi.getOne(id).then(r => r.data.data.assessment),
    enabled:  !!id,
    // Poll until scored
    refetchInterval: (data) =>
      data && ['scored', 'failed'].includes(data.status) ? false : 4000,
  });
}

// ─── Reports ─────────────────────────────────────────────────────

export function useMyReports(params = {}) {
  return useQuery({
    queryKey: ['my-reports', params],
    queryFn:  () => reportApi.getMy(params).then(r => r.data),
  });
}

export function useReport(id) {
  return useQuery({
    queryKey: ['report', id],
    queryFn:  () => reportApi.getOne(id).then(r => r.data.data.report),
    enabled:  !!id,
    // Poll while generating
    refetchInterval: (data) =>
      data && data.status === 'generating' ? 5000 : false,
  });
}

export function useDownloadPdf(reportId) {
  return useMutation({
    mutationFn: () => reportApi.getPdfUrl(reportId),
    onSuccess:  (res) => {
      window.open(res.data.data.url, '_blank');
      toast.success('Opening PDF…');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'PDF unavailable'),
  });
}

// ─── Notifications ────────────────────────────────────────────────

export function useNotifications(params = {}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn:  () => notificationApi.getAll(params).then(r => r.data.data),
    refetchInterval: 30000, // poll every 30s
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });
}
