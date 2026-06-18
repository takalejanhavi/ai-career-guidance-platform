import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Brain, FileText, Shield, ArrowRight, Trophy, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { dashboardApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { StatCard, SkeletonCard, EmptyState, Badge, Button } from '@/components/common';
import { ScoreTrendChart, CareerPieChart, DimensionRadarChart } from '@/components/charts';
import { containerVariants, cardVariants } from '@/animations/variants';

export default function StudentDashboard() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => dashboardApi.get().then(r => r.data.data),
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Build radar data from latest assessment scores
  const radarData = data?.latestAssessment?.scores
    ? Object.entries(data.latestAssessment.scores)
        .filter(([k]) => k !== 'overall')
        .map(([k, v]) => ({ dimension: k.charAt(0).toUpperCase() + k.slice(1), score: v?.score ?? 0 }))
    : [];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.div variants={cardVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted mb-0.5">{greeting()},</p>
          <h1 className="text-2xl font-display font-bold text-primary">
            {user?.firstName} <span className="gradient-text">👋</span>
          </h1>
          <p className="text-sm text-secondary mt-1">Here's your career guidance overview</p>
        </div>
        <Link to="/student/assessment">
          <Button variant="brand" icon={Brain}>
            Start Assessment
          </Button>
        </Link>
      </motion.div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <motion.div variants={cardVariants}>
              <StatCard label="Assessments" value={data?.stats?.assessmentCount ?? 0} icon={Brain} color="indigo" />
            </motion.div>
            <motion.div variants={cardVariants}>
              <StatCard
                label="Overall Score"
                value={data?.latestAssessment?.scores?.overall ? `${data.latestAssessment.scores.overall}%` : '—'}
                icon={TrendingUp}
                color="violet"
              />
            </motion.div>
            <motion.div variants={cardVariants}>
              <StatCard label="Reports Shared" value={data?.stats?.sharedCount ?? 0} icon={Shield} color="azure" />
            </motion.div>
            <motion.div variants={cardVariants}>
              <StatCard label="Notifications" value={data?.stats?.unreadCount ?? 0} icon={CheckCircle} color="success" />
            </motion.div>
          </>
        )}
      </div>

      {/* ── Charts row ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Score trend */}
        <motion.div variants={cardVariants} className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-primary">Score Trend</h2>
              <p className="text-xs text-muted">Overall assessment scores over time</p>
            </div>
            <Badge variant="indigo"><TrendingUp className="w-3 h-3" /> Progress</Badge>
          </div>
          {data?.scoreTrend?.length > 1 ? (
            <ScoreTrendChart data={data.scoreTrend} />
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-muted">Complete more assessments to see your trend</p>
            </div>
          )}
        </motion.div>

        {/* Dimension radar */}
        <motion.div variants={cardVariants} className="card p-5">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-primary">Dimension Profile</h2>
            <p className="text-xs text-muted">Latest assessment breakdown</p>
          </div>
          {radarData.length > 0 ? (
            <DimensionRadarChart data={radarData} />
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-muted text-center">Take an assessment to see your profile</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Bottom row ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Career distribution */}
        <motion.div variants={cardVariants} className="card p-5">
          <h2 className="text-sm font-semibold text-primary mb-4">Top Career Categories</h2>
          {data?.careerDistribution?.length > 0 ? (
            <CareerPieChart data={data.careerDistribution} />
          ) : (
            <EmptyState icon={Trophy} title="No data yet" description="Generate a report to see your top career matches" />
          )}
        </motion.div>

        {/* Latest report preview */}
        <motion.div variants={cardVariants} className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-primary">Latest Report</h2>
            <Link to="/student/reports" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              All reports <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {data?.latestReport ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-primary">{data.latestReport.title}</h3>
                  <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(data.latestReport.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Badge variant={data.latestReport.status === 'ready' ? 'success' : 'warning'}>
                    {data.latestReport.status}
                  </Badge>
                  {data.latestReport.blockchain?.status === 'confirmed' && (
                    <Badge variant="indigo">⛓ Verified</Badge>
                  )}
                </div>
              </div>

              {data.latestReport.topCareer && (
                <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-4">
                  <p className="text-xs text-indigo-400 font-medium mb-1">Top Match</p>
                  <p className="font-semibold text-primary">{data.latestReport.topCareer.careerTitle}</p>
                  <p className="text-xs text-secondary">{data.latestReport.topCareer.matchScore}% match · {data.latestReport.topCareer.category}</p>
                </div>
              )}

              <Link to={`/student/reports/${data.latestReport._id}`}>
                <Button variant="ghost" size="sm" className="w-full" icon={FileText}>
                  View full report
                </Button>
              </Link>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description="Complete an assessment to generate your first career report"
              action={
                <Link to="/student/assessment">
                  <Button variant="brand" size="sm" icon={Brain}>Take assessment</Button>
                </Link>
              }
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
