import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Navbar  from './Navbar';
import { pageTransition } from '@/animations/variants';

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-void overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto bg-void relative">
          {/* Ambient mesh background */}
          <div className="fixed inset-0 bg-mesh pointer-events-none opacity-40" />
          <motion.div
            key={location.pathname}
            {...pageTransition}
            className="relative z-10 p-4 lg:p-6 max-w-[1400px] mx-auto w-full"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
