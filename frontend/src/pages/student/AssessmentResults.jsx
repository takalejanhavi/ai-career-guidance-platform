// ─── AssessmentResults.jsx ────────────────────────────────────────
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion }           from 'framer-motion';
import { CheckCircle2, TrendingUp, FileText, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { assessmentApi }    from '@/services/api';
import { PageLoader, Badge, Button } from '@/components/common';
import { DimensionRadarChart } from '@/components/charts';
import { containerVariants, cardVariants } from '@/animations/variants';

export function AssessmentResults() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: assessment, isLoading } = useQuery({
    queryKey: ['assessment', id],
    queryFn:  () => assessmentApi.getOne(id).then(r => r.data.data.assessment),
    refetchInterval: (d) => ['scored', 'failed'].includes(d?.status) ? false : 5000,
  });

  const retryMutation = useMutation({
    mutationFn: () => assessmentApi.retryScoring(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['assessment', id] }),
  });

  if (isLoading) return <PageLoader />;

  const scores  = assessment?.scores;
  const radarData = scores
    ? Object.entries(scores).filter(([k]) => k !== 'overall').map(([k, v]) => ({
        dimension: k.charAt(0).toUpperCase() + k.slice(1), score: v?.score ?? 0,
      }))
    : [];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-2xl mx-auto space-y-6">
      <motion.div variants={cardVariants} className="card p-8 text-center relative overflow-hidden">
        <div className="orb w-48 h-48 bg-indigo-500 top-0 right-0 opacity-10" />
        <div className="relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-2xl font-display font-bold text-primary mb-2">Assessment Complete!</h1>
          {assessment?.status === 'scored' ? (
            <p className="text-secondary">Your results are ready. Check your overall score below.</p>
          ) : assessment?.status === 'failed' ? (
            <p className="text-secondary">We couldn't generate your results — see below.</p>
          ) : (
            <p className="text-secondary">Your assessment is being scored by our AI engine…</p>
          )}
        </div>
      </motion.div>

      {assessment?.status === 'failed' && (
        <motion.div variants={cardVariants} className="card p-6 text-center border-danger/20">
          <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-danger" />
          </div>
          <h2 className="text-base font-semibold text-primary mb-1">Scoring failed</h2>
          <p className="text-sm text-secondary mb-4">
            {assessment.failureReason || 'An unexpected error occurred while scoring your assessment.'}
          </p>
          <Button
            variant="secondary"
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
            {retryMutation.isPending ? 'Retrying…' : 'Retry scoring'}
          </Button>
        </motion.div>
      )}

      {assessment?.status === 'scored' && scores && (
        <>
          <motion.div variants={cardVariants} className="card p-6 text-center">
            <p className="text-sm text-muted mb-1">Overall Score</p>
            <div className="text-5xl font-display font-bold gradient-text">{scores.overall}%</div>
            <Badge variant="indigo" className="mt-2">
              <TrendingUp className="w-3 h-3" />
              {scores.overall >= 75 ? 'Excellent' : scores.overall >= 50 ? 'Good' : 'Developing'}
            </Badge>
          </motion.div>

          <motion.div variants={cardVariants} className="card p-5">
            <h2 className="text-sm font-semibold text-primary mb-4">Dimension Breakdown</h2>
            <DimensionRadarChart data={radarData} />
            <div className="grid grid-cols-2 gap-3 mt-4">
              {Object.entries(scores).filter(([k]) => k !== 'overall').map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-muted capitalize">{k.replace('_', ' ')}</span>
                  <span className="font-medium text-primary">{v?.score ?? 0}%</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={cardVariants} className="flex gap-3">
            <Link to="/student/reports" className="flex-1">
              <Button variant="brand" className="w-full" icon={FileText}>View My Reports</Button>
            </Link>
            <Link to="/student/dashboard" className="flex-1">
              <Button variant="ghost" className="w-full">Back to Dashboard</Button>
            </Link>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

export default AssessmentResults;
