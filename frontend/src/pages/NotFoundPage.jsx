import { Link }   from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home }   from 'lucide-react';
import { Button } from '@/components/common';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="text-center">
        <div className="text-8xl font-display font-bold gradient-text mb-4">404</div>
        <h1 className="text-2xl font-semibold text-primary mb-2">Page not found</h1>
        <p className="text-muted mb-8">The page you're looking for doesn't exist.</p>
        <Link to="/"><Button variant="brand" icon={Home}>Back to Home</Button></Link>
      </motion.div>
    </div>
  );
}
