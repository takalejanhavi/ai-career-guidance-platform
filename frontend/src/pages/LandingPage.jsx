import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, ArrowRight, Brain, FileText, Shield, BarChart3, CheckCircle2, Sparkles, Star } from 'lucide-react';
import { containerVariants, cardVariants, fadeUp } from '@/animations/variants';

const features = [
  { icon: Brain,     color: 'indigo', title: 'AI-Powered Analysis',  desc: 'Advanced psychometric assessment powered by Scikit-Learn models trained on 10,000+ career trajectories.' },
  { icon: FileText,  color: 'violet', title: 'Detailed PDF Reports',  desc: 'Beautiful, downloadable reports with career breakdowns, salary ranges, and personalised growth paths.' },
  { icon: Shield,    color: 'azure',  title: 'Blockchain Verified',   desc: 'Every report is anchored to Polygon blockchain. Tamper-proof, permanent, and cryptographically verifiable.' },
  { icon: BarChart3, color: 'indigo', title: 'Analytics Dashboard',   desc: 'Track progress over time. Compare assessment scores, see trending careers, and measure growth.' },
];

const stats = [
  { value: '50K+',  label: 'Students Guided' },
  { value: '98%',   label: 'Satisfaction Rate' },
  { value: '200+',  label: 'Career Paths' },
  { value: '24hr',  label: 'Report Delivery' },
];

const colorMap = {
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400' },
  violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400' },
  azure:  { bg: 'bg-azure-500/10',  border: 'border-azure-500/20',  text: 'text-azure-400' },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-void text-primary overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 glass-dark border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow-sm">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-display font-bold gradient-text">CareerAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-ghost text-sm">Sign in</Link>
            <Link to="/register" className="btn-brand text-sm">Get started <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-32 px-4 overflow-hidden">
        {/* Orbs */}
        <div className="orb w-[600px] h-[600px] bg-indigo-500 top-[-20%] left-[-20%]" style={{ opacity: 0.08 }} />
        <div className="orb w-[400px] h-[400px] bg-violet-500 top-[10%] right-[-10%]" style={{ opacity: 0.06 }} />
        <div className="orb w-[300px] h-[300px] bg-azure-500 bottom-[0] left-[30%]" style={{ opacity: 0.05 }} />

        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div {...fadeUp} className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Career Guidance Platform
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-5xl md:text-7xl font-display font-bold leading-[1.1] mb-6"
          >
            Discover Your{' '}
            <span className="gradient-text">Perfect Career</span>{' '}
            Path
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-lg md:text-xl text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Take our scientifically-validated psychometric assessment. Get an AI-analysed career report,
            verified on blockchain, reviewed by certified psychologists.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/register" className="btn-brand text-base py-3 px-8">
              Start Free Assessment
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/login" className="btn-ghost text-base py-3 px-8">
              Sign in to dashboard
            </Link>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-2 mt-8"
          >
            <div className="flex -space-x-2">
              {['AB','KM','PR','SJ','TL'].map(initials => (
                <div key={initials} className="w-8 h-8 rounded-full bg-brand-gradient flex items-center justify-center text-white text-xs font-bold ring-2 ring-void">
                  {initials}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-sm text-secondary">
              <div className="flex text-warning">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}
              </div>
              <span className="ml-1">50,000+ students guided</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="py-12 border-y border-border bg-surface/50">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map(({ value, label }) => (
              <motion.div key={label} variants={cardVariants} className="text-center">
                <div className="text-3xl font-display font-bold gradient-text mb-1">{value}</div>
                <div className="text-sm text-muted">{label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Everything you need to <span className="gradient-text">launch your career</span>
            </h2>
            <p className="text-secondary max-w-xl mx-auto">
              From psychometric assessment to blockchain-verified reports — a complete career guidance ecosystem.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            className="grid md:grid-cols-2 gap-5"
          >
            {features.map(({ icon: Icon, color, title, desc }) => {
              const c = colorMap[color];
              return (
                <motion.div
                  key={title}
                  variants={cardVariants}
                  className="card p-6 card-hover"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center border mb-4 ${c.bg} ${c.border}`}>
                    <Icon className={`w-5 h-5 ${c.text}`} />
                  </div>
                  <h3 className="text-base font-semibold text-primary mb-2">{title}</h3>
                  <p className="text-sm text-secondary leading-relaxed">{desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section className="py-20 px-4 bg-surface/30">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-3">How it works</h2>
            <p className="text-secondary">Three steps to your personalised career path</p>
          </motion.div>
          <div className="space-y-4">
            {[
              { step: '01', title: 'Take the assessment',    desc: '30-minute psychometric test covering aptitude, interests, personality, and values.' },
              { step: '02', title: 'Get your AI report',     desc: 'Our model analyses your profile across 200+ career paths and generates a detailed PDF report.' },
              { step: '03', title: 'Review with a psychologist', desc: 'Share your report with a certified psychologist for expert interpretation and guidance.' },
            ].map(({ step, title, desc }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="flex gap-5 items-start"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-mono font-bold text-sm shrink-0">
                  {step}
                </div>
                <div className="card p-4 flex-1">
                  <h4 className="font-semibold text-primary mb-1">{title}</h4>
                  <p className="text-sm text-secondary">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card p-12 relative overflow-hidden"
          >
            <div className="orb w-64 h-64 bg-indigo-500 top-0 left-0 opacity-10" />
            <div className="orb w-48 h-48 bg-violet-500 bottom-0 right-0 opacity-10" />
            <div className="relative z-10">
              <CheckCircle2 className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
              <h2 className="text-3xl font-display font-bold mb-3">Ready to find your path?</h2>
              <p className="text-secondary mb-8">Join 50,000+ students who discovered their ideal career with CareerAI.</p>
              <Link to="/register" className="btn-brand text-base py-3 px-8">
                Start for free — it takes 30 min
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span>CareerAI © {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-secondary transition-colors">Privacy</a>
            <a href="#" className="hover:text-secondary transition-colors">Terms</a>
            <a href="#" className="hover:text-secondary transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
