import { useState, useEffect, useCallback } from 'react';
import { useNavigate }  from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Clock, ChevronRight, ChevronLeft, CheckCircle2, Zap, AlertCircle } from 'lucide-react';
import { assessmentApi } from '@/services/api';
import { Button, Badge, ProgressBar, Modal } from '@/components/common';
import { DimensionRadarChart } from '@/components/charts';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const LIKERT_LABELS = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
const SECTION_COLORS = {
  aptitude:      { text: 'text-azure-400',   bg: 'bg-azure-500/10',   border: 'border-azure-500/20' },
  interest:      { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  personality:   { text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  values:        { text: 'text-success',     bg: 'bg-success/10',     border: 'border-success/20' },
  learning_style:{ text: 'text-warning',     bg: 'bg-warning/10',     border: 'border-warning/20' },
};

// ── Timer ──────────────────────────────────────────────────────────
function Timer({ seconds, className }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const isUrgent = seconds < 300;

  return (
    <div className={clsx('flex items-center gap-2 font-mono text-sm', isUrgent ? 'text-danger' : 'text-secondary', className)}>
      <Clock className={clsx('w-4 h-4', isUrgent && 'animate-pulse')} />
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  );
}

// ── Likert question card ──────────────────────────────────────────
function LikertCard({ question, value, onChange, index }) {
  const colors = SECTION_COLORS[question.section] || SECTION_COLORS.aptitude;

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="card p-6 md:p-8"
    >
      {/* Section badge */}
      <div className="flex items-center gap-3 mb-6">
        <span className={clsx('badge', colors.bg, colors.text, colors.border)}>
          {question.section.replace('_', ' ')}
        </span>
        <span className="text-xs text-muted">Question {index + 1}</span>
      </div>

      {/* Question text */}
      <p className="text-lg md:text-xl font-medium text-primary leading-relaxed mb-8">
        {question.text}
      </p>

      {/* Likert scale */}
      <div className="space-y-3">
        <div className="grid grid-cols-5 gap-2">
          {[1,2,3,4,5].map(score => (
            <motion.button
              key={score}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onChange(score)}
              className={clsx(
                'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-150',
                value === score
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                  : 'border-border hover:border-border-light hover:bg-white/3 text-muted'
              )}
            >
              <span className={clsx('text-xl font-bold', value === score ? 'text-indigo-300' : 'text-secondary')}>
                {score}
              </span>
            </motion.button>
          ))}
        </div>
        <div className="flex justify-between px-1 text-xs text-muted">
          <span>Strongly Disagree</span>
          <span>Strongly Agree</span>
        </div>
      </div>

      {/* Selected label */}
      <AnimatePresence>
        {value && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 text-center text-sm text-indigo-400"
          >
            <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
            {LIKERT_LABELS[value - 1]}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Assessment Page ──────────────────────────────────────────
export default function AssessmentPage() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [sessionId,  setSessionId]  = useState(null);
  const [questions,  setQuestions]  = useState([]);
  const [current,    setCurrent]    = useState(0);
  const [answers,    setAnswers]    = useState({});
  const [elapsed,    setElapsed]    = useState(0);
  const [phase,      setPhase]      = useState('intro'); // intro | testing | submitting | done
  const [confirmQuit,setConfirmQuit]= useState(false);

  // Load questions
  const { data: qData, isLoading: qLoading } = useQuery({
    queryKey: ['questions'],
    queryFn:  () => assessmentApi.getQuestions({ limit: 100 }).then(r => r.data.data),
    enabled:  phase !== 'intro',
  });

  useEffect(() => {
    if (qData) setQuestions(qData);
  }, [qData]);

  // Timer
  useEffect(() => {
    if (phase !== 'testing') return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Start assessment session
  const startMut = useMutation({
    mutationFn: () => assessmentApi.start({ totalQuestions: 30, deviceType: 'desktop' }),
    onSuccess:  (res) => {
      setSessionId(res.data.data.assessment._id);
      setPhase('testing');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not start assessment'),
  });

  // Submit individual answer
  const answerMut = useMutation({
    mutationFn: ({ id, data }) => assessmentApi.submitResponse(id, data),
  });

  // Final submission
  const submitMut = useMutation({
    mutationFn: (id) => assessmentApi.submit(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Assessment submitted! Generating your report…');
      navigate(`/student/assessment/${sessionId}/results`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Submission failed'),
  });

  const displayQuestions = questions.slice(0, 30);
  const q = displayQuestions[current];
  const answeredCount = Object.keys(answers).length;
  const progress = displayQuestions.length ? (answeredCount / displayQuestions.length) * 100 : 0;
  const isLast = current === displayQuestions.length - 1;

  const handleAnswer = useCallback((score) => {
    if (!q || !sessionId) return;
    const newAnswers = { ...answers, [q.id]: score };
    setAnswers(newAnswers);

    // Fire-and-forget answer submission
    answerMut.mutate({
      id: sessionId,
      data: {
        questionId:   q.id,
        questionText: q.text,
        answer:       score,
        section:      q.section,
        rawScore:     (score - 1) * 2.5,   // map Likert 1-5 → 0-10 (backend expects 0-10, multiplies by 10 for AI)
      },
    });

    // Auto-advance after short delay
    setTimeout(() => {
      if (!isLast) setCurrent(c => c + 1);
    }, 250);
  }, [q, sessionId, answers, isLast]);

  const handleSubmit = () => {
    if (!sessionId) return;
    submitMut.mutate(sessionId);
  };

  // ── Intro screen ───────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto space-y-6"
      >
        <div className="card p-8 text-center relative overflow-hidden">
          <div className="orb w-64 h-64 bg-indigo-500 top-0 left-0 opacity-10" />
          <div className="relative z-10">
            <div className="w-20 h-20 rounded-2xl bg-brand-gradient flex items-center justify-center mx-auto mb-6 shadow-glow-md">
              <Brain className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-primary mb-2">Career Assessment</h1>
            <p className="text-secondary mb-6">
              A 30-question psychometric test covering aptitude, interests, personality, and values.
              Takes approximately 15–20 minutes.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-8 text-left">
              {[
                { icon: '🎯', label: '30 Questions',   desc: 'Scientifically validated' },
                { icon: '⏱',  label: '15-20 minutes',  desc: 'Take your time' },
                { icon: '🤖', label: 'AI Analysis',    desc: 'Instant scoring' },
                { icon: '📊', label: 'Detailed Report', desc: 'PDF + blockchain verified' },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-border">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-primary">{label}</p>
                    <p className="text-xs text-muted">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="brand"
              size="lg"
              className="w-full"
              icon={Zap}
              loading={startMut.isPending}
              onClick={() => startMut.mutate()}
            >
              Begin Assessment
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted">
          Answer honestly — there are no right or wrong answers. Your results are private and secure.
        </p>
      </motion.div>
    );
  }

  // ── Testing screen ─────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Progress header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-secondary">
            {answeredCount} / {displayQuestions.length} answered
          </div>
          <Timer seconds={elapsed} />
        </div>
        <ProgressBar value={progress} showValue={false} />
      </motion.div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {['aptitude','interest','personality','values','learning_style'].map(s => {
          const c = SECTION_COLORS[s];
          const sectionQs = displayQuestions.filter(q => q.section === s);
          const answered  = sectionQs.filter(q => answers[q.id]).length;
          return (
            <button
              key={s}
              className={clsx('badge shrink-0 cursor-default', c.bg, c.text, c.border)}
            >
              {s.replace('_',' ')} {answered}/{sectionQs.length}
            </button>
          );
        })}
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        {q && (
          <LikertCard
            key={q.id}
            question={q}
            value={answers[q.id]}
            onChange={handleAnswer}
            index={current}
          />
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          icon={ChevronLeft}
          onClick={() => setCurrent(c => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          Previous
        </Button>

        <span className="text-xs text-muted font-mono">
          {current + 1} / {displayQuestions.length}
        </span>

        {isLast ? (
          <Button
            variant="brand"
            icon={CheckCircle2}
            loading={submitMut.isPending}
            onClick={handleSubmit}
            disabled={answeredCount < displayQuestions.length * 0.8}
          >
            Submit Assessment
          </Button>
        ) : (
          <Button
            variant={answers[q?.id] ? 'brand' : 'ghost'}
            onClick={() => setCurrent(c => c + 1)}
            disabled={current >= displayQuestions.length - 1}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      {answeredCount < displayQuestions.length * 0.8 && isLast && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-xl p-3"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          Please answer at least 80% of questions before submitting.
        </motion.div>
      )}
    </div>
  );
}
