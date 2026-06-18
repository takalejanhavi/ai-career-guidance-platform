import { motion } from 'framer-motion';
import { Zap }    from 'lucide-react';
import { Link }   from 'react-router-dom';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="orb w-96 h-96 bg-indigo-500 top-[-10%] left-[-10%]" />
      <div className="orb w-80 h-80 bg-violet-500 bottom-[-10%] right-[-5%]" />
      <div className="orb w-64 h-64 bg-azure-500 top-[40%] right-[20%]" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(#6366F1 1px, transparent 1px), linear-gradient(90deg, #6366F1 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow-sm">
            <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-display font-bold gradient-text">CareerAI</span>
        </Link>

        {/* Card */}
        <div className="card p-8">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
