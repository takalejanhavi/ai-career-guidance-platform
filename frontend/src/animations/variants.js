// Shared Framer Motion animation variants

export const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

export const slideInRight = {
  hidden:  { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export const stagger = (delay = 0.08) => ({
  visible: { transition: { staggerChildren: delay } },
});

export const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export const cardVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export const sidebarVariants = {
  open:   { width: 256, transition: { duration: 0.25, ease: 'easeInOut' } },
  closed: { width: 72,  transition: { duration: 0.25, ease: 'easeInOut' } },
};

export const pageTransition = {
  initial:   { opacity: 0, y: 12 },
  animate:   { opacity: 1, y: 0 },
  exit:      { opacity: 0, y: -12 },
  transition:{ duration: 0.3, ease: 'easeInOut' },
};
