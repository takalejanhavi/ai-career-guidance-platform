import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Download, Share2, Shield, CheckCircle2, Clock,
  ExternalLink, ChevronRight, Star, TrendingUp, Brain, ArrowLeft,
  Lock, Globe, Users, MessageSquare, Lightbulb, ChevronDown, ChevronUp,
  Zap, BarChart2
} from 'lucide-react';
import { reportApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { Button, Badge, Modal, PageLoader, ProgressBar } from '@/components/common';
import { DimensionRadarChart, MatchScoreBar } from '@/components/charts';
import { containerVariants, cardVariants } from '@/animations/variants';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const matchColor = (score) => {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
};

// ── Confidence tier helpers ────────────────────────────────────────────────
const TIER_CONFIG = {
  HIGH:      { label: 'HIGH',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-400' },
  MEDIUM:    { label: 'MEDIUM',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/25',     dot: 'bg-amber-400'   },
  EMERGING:  { label: 'EMERGING', color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/25',   dot: 'bg-orange-400'  },
  LOW:       { label: 'LOW',      color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/25',         dot: 'bg-red-400'     },
  // legacy v1.0.x
  'Very High': { label: 'HIGH',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-400' },
  'High':      { label: 'HIGH',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-400' },
  'Moderate':  { label: 'MEDIUM', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/25',     dot: 'bg-amber-400'   },
  'Low':       { label: 'LOW',    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/25',         dot: 'bg-red-400'     },
};

function ConfidenceTierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.LOW;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold tracking-wide', cfg.bg, cfg.color)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function ModelAgreementBar({ agreement }) {
  if (agreement == null) return null;
  const pct = Math.round(agreement * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-muted mb-1">
        <span title="How closely Random Forest and XGBoost agree on this prediction">Model agreement</span>
        <span className="font-medium text-secondary">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SpecializedPaths({ roles }) {
  const [open, setOpen] = useState(false);
  if (!roles?.length) return null;
  return (
    <div className="mt-3 border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-secondary hover:bg-border/40 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          Specialized Paths ({roles.length})
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-3 space-y-1.5 overflow-hidden"
          >
            {roles.map((role, i) => (
              <div key={role} className="flex items-center gap-2 text-sm text-secondary">
                <span className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-400 text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                {role}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WhyMatchModal({ open, onClose, career }) {
  if (!career) return null;
  const drivers = career.topDrivers || [];
  const maxImpact = Math.max(...drivers.map(d => Math.abs(d.impact)), 0.001);
  return (
    <Modal open={open} onClose={onClose} title={`Why ${career.careerTitle}?`} size="md">
      <div className="space-y-4">
        <p className="text-sm text-secondary">{career.description}</p>

        {drivers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Top Feature Drivers</p>
            <div className="space-y-3">
              {drivers.map((d, i) => {
                const pct = Math.round((Math.abs(d.impact) / maxImpact) * 100);
                const isPos = d.direction !== 'negative';
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-secondary capitalize">{d.feature?.replace(/_/g, ' ')}</span>
                      <span className={clsx('font-semibold', isPos ? 'text-emerald-400' : 'text-red-400')}>
                        {isPos ? '+' : '-'}{Math.abs(Math.round(d.impact * 1000)) / 10}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full', isPos ? 'bg-emerald-500' : 'bg-red-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 p-3 bg-border/30 rounded-xl">
          <BarChart2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="text-xs text-secondary">
            Match confidence: <span className="font-semibold text-primary">{career.matchScore}%</span>
            {career.confidenceTier && (
              <> · <ConfidenceTierBadge tier={career.confidenceTier} /></>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const visibilityConfig = {
  private: { icon: Lock,   label: 'Private',  badge: 'default' },
  shared:  { icon: Users,  label: 'Shared',   badge: 'indigo'  },
  public:  { icon: Globe,  label: 'Public',   badge: 'success' },
};

export default function ReportPage() {
  const { id }       = useParams();
  const { user }     = useAuthStore();
  const qc           = useQueryClient();
  const [shareOpen,  setShareOpen]  = useState(false);
  const [annotOpen,  setAnnotOpen]  = useState(false);
  const [annotText,  setAnnotText]  = useState('');
  const [whyCareer,  setWhyCareer]  = useState(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', id],
    queryFn:  () => reportApi.getOne(id).then(r => r.data.data.report),
  });

  const downloadMut = useMutation({
    mutationFn: () => reportApi.getPdfUrl(id),
    onSuccess:  (res) => {
      window.open(res.data.data.url, '_blank');
      toast.success('Opening PDF…');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not get PDF'),
  });

  const anchorMut = useMutation({
    mutationFn: () => reportApi.anchor(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['report', id] });
      toast.success('Blockchain anchoring initiated!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Anchoring failed'),
  });

  const visibilityMut = useMutation({
    mutationFn: (v) => reportApi.updateVisibility(id, v),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['report', id] }),
  });

  const annotMut = useMutation({
    mutationFn: (data) => reportApi.addAnnotation(id, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['report', id] });
      setAnnotText('');
      setAnnotOpen(false);
      toast.success('Annotation added');
    },
  });

  if (isLoading) return <PageLoader />;
  if (!report)   return <div className="text-center py-16 text-muted">Report not found</div>;

  const isOwner = String(report.userId?._id || report.userId) === String(user?._id);
  const vc      = visibilityConfig[report.visibility] || visibilityConfig.private;

  const radarData = report.assessmentId?.scores
    ? Object.entries(report.assessmentId.scores)
        .filter(([k]) => k !== 'overall')
        .map(([k, v]) => ({ dimension: k.charAt(0).toUpperCase() + k.slice(1), score: v?.score ?? 0 }))
    : [];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.div variants={cardVariants}>
        <Link to={isOwner ? '/student/reports' : '#'} className="inline-flex items-center gap-1 text-sm text-muted hover:text-secondary mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to reports
        </Link>

        <div className="card p-6 relative overflow-hidden">
          <div className="orb w-48 h-48 bg-indigo-500 top-[-30%] right-[-5%] opacity-10" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-display font-bold text-primary">{report.title}</h1>
                  <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    Generated {new Date(report.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant={report.status === 'ready' ? 'success' : 'warning'}>
                  {report.status}
                </Badge>
                <Badge variant={vc.badge}>
                  <vc.icon className="w-3 h-3" />
                  {vc.label}
                </Badge>
                {report.blockchain?.status === 'confirmed' && (
                  <Badge variant="indigo">
                    <Shield className="w-3 h-3" />
                    Blockchain Verified
                  </Badge>
                )}
                {report.aiModelVersion && (
                  <Badge variant="default">AI {report.aiModelVersion}</Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {report.pdf?.url && (
                <Button variant="brand" size="sm" icon={Download} loading={downloadMut.isPending} onClick={() => downloadMut.mutate()}>
                  Download PDF
                </Button>
              )}
              {isOwner && (
                <>
                  <Button variant="ghost" size="sm" icon={Share2} onClick={() => setShareOpen(true)}>
                    Share
                  </Button>
                  {report.blockchain?.status === 'not_anchored' && report.status === 'ready' && (
                    <Button variant="outline" size="sm" icon={Shield} loading={anchorMut.isPending} onClick={() => anchorMut.mutate()}>
                      Anchor on Chain
                    </Button>
                  )}
                </>
              )}
              {user?.role === 'psychologist' && (
                <Button variant="ghost" size="sm" icon={MessageSquare} onClick={() => setAnnotOpen(true)}>
                  Annotate
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Narrative ──────────────────────────────────────────── */}
      {report.narrative && (
        <motion.div variants={cardVariants} className="card p-6">
          <h2 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            Career Profile Summary
          </h2>
          <p className="text-secondary text-sm leading-relaxed">{report.narrative}</p>
        </motion.div>
      )}

      {/* ── Career recommendations ─────────────────────────────── */}
      <motion.div variants={cardVariants} className="space-y-3">
        <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          Top Career Recommendations ({report.careerRecommendations?.length})
        </h2>

        <div className="space-y-3">
          {report.careerRecommendations?.map((career, i) => (
            <motion.div
              key={career.careerSlug}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={clsx(
                'card p-5 card-hover',
                i === 0 && 'border-indigo-500/30 bg-indigo-500/3'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={clsx(
                    'w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
                    i === 0 ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-border text-secondary'
                  )}>
                    {i === 0 ? <Star className="w-4 h-4" /> : career.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-primary">{career.careerTitle}</h3>
                      {i === 0 && <Badge variant="indigo">Best Match</Badge>}
                      {career.confidenceTier && <ConfidenceTierBadge tier={career.confidenceTier} />}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{career.category}</p>
                    {career.description && (
                      <p className="text-sm text-secondary mt-2 leading-relaxed line-clamp-2">{career.description}</p>
                    )}
                    {career.keySkills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {career.keySkills.slice(0, 4).map(s => (
                          <span key={s} className="text-xs px-2 py-0.5 bg-border rounded-full text-muted">{s}</span>
                        ))}
                      </div>
                    )}
                    <ModelAgreementBar agreement={career.modelAgreement} />
                    <SpecializedPaths roles={career.recommendedRoles} />
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-2">
                  <div>
                    <span className={clsx('text-2xl font-display font-bold', matchColor(career.matchScore))}>
                      {career.matchScore}%
                    </span>
                    <p className="text-xs text-muted">match</p>
                  </div>
                  {career.salaryRange?.min && (
                    <p className="text-xs text-secondary">
                      ${(career.salaryRange.min/1000).toFixed(0)}k–${(career.salaryRange.max/1000).toFixed(0)}k
                    </p>
                  )}
                  {career.topDrivers?.length > 0 && (
                    <button
                      onClick={() => setWhyCareer(career)}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                    >
                      <Lightbulb className="w-3 h-3" />
                      Why this?
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <MatchScoreBar score={career.matchScore} label="Match strength" />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── Dimension breakdown + Blockchain ──────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {radarData.length > 0 && (
          <motion.div variants={cardVariants} className="card p-5">
            <h2 className="text-sm font-semibold text-primary mb-3">Dimension Breakdown</h2>
            <DimensionRadarChart data={radarData} />
          </motion.div>
        )}

        <motion.div variants={cardVariants} className="card p-5">
          <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Blockchain Verification
          </h2>
          <div className={clsx('p-4 rounded-xl border', report.blockchain?.status === 'confirmed' ? 'bg-success/5 border-success/20' : 'bg-border/30 border-border')}>
            {report.blockchain?.status === 'confirmed' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-success font-medium text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Verified on {report.blockchain.network}
                </div>
                {report.blockchain.txHash && (
                  <div>
                    <p className="text-xs text-muted mb-1">Transaction hash</p>
                    <p className="font-mono text-xs text-secondary break-all">{report.blockchain.txHash}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted">Block</p>
                    <p className="text-secondary font-mono">{report.blockchain.blockNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted">Confirmed</p>
                    <p className="text-secondary">{new Date(report.blockchain.confirmedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ) : report.blockchain?.status === 'pending' ? (
              <div className="flex items-center gap-2 text-warning text-sm">
                <Clock className="w-4 h-4 animate-spin" />
                Anchoring in progress…
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-secondary mb-3">This report has not been anchored yet</p>
                {isOwner && report.status === 'ready' && (
                  <Button variant="outline" size="sm" icon={Shield} loading={anchorMut.isPending} onClick={() => anchorMut.mutate()}>
                    Anchor on Blockchain
                  </Button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Annotations ────────────────────────────────────────── */}
      {report.annotations?.filter(a => !a.isPrivate || user?.role === 'psychologist').length > 0 && (
        <motion.div variants={cardVariants} className="card p-5">
          <h2 className="text-sm font-semibold text-primary mb-4">Psychologist Annotations</h2>
          <div className="space-y-3">
            {report.annotations.filter(a => !a.isPrivate || user?.role === 'psychologist').map(ann => (
              <div key={ann._id} className="p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
                <p className="text-sm text-secondary">{ann.content}</p>
                <p className="text-xs text-muted mt-2">{new Date(ann.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Why This Match Modal ───────────────────────────────── */}
      <WhyMatchModal open={!!whyCareer} onClose={() => setWhyCareer(null)} career={whyCareer} />

      {/* ── Modals ─────────────────────────────────────────────── */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share Report" size="md">
        <div className="space-y-4">
          <p className="text-sm text-secondary">Control who can view this report</p>
          <div className="space-y-2">
            {['private','shared','public'].map(v => {
              const vc = visibilityConfig[v];
              return (
                <button
                  key={v}
                  onClick={() => { visibilityMut.mutate(v); setShareOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                    report.visibility === v ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-border hover:border-border-light'
                  )}
                >
                  <vc.icon className="w-4 h-4 text-secondary" />
                  <div>
                    <p className="text-sm font-medium text-primary capitalize">{v}</p>
                    <p className="text-xs text-muted">
                      {v === 'private' ? 'Only you can see this' : v === 'shared' ? 'Share with specific users' : 'Anyone with link'}
                    </p>
                  </div>
                  {report.visibility === v && <CheckCircle2 className="w-4 h-4 text-indigo-400 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal open={annotOpen} onClose={() => setAnnotOpen(false)} title="Add Annotation">
        <div className="space-y-4">
          <textarea
            className="input !min-h-[100px] resize-none"
            placeholder="Add your professional observation…"
            value={annotText}
            onChange={e => setAnnotText(e.target.value)}
          />
          <Button
            variant="brand"
            className="w-full"
            loading={annotMut.isPending}
            disabled={!annotText.trim()}
            onClick={() => annotMut.mutate({ content: annotText, isPrivate: false })}
          >
            Add Annotation
          </Button>
        </div>
      </Modal>
    </motion.div>
  );
}
