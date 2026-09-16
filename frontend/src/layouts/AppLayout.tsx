import { Outlet, useLocation } from 'react-router-dom';
import { VoiceWidget } from '@/components/VoiceWidget';
import { motion, useReducedMotion } from 'framer-motion';
import { AppShell } from './AppShell';

export default function AppLayout() {
  const reduceMotion = useReducedMotion();
  const isToday = useLocation().pathname === '/today';
  return (
    <AppShell>
      <main id="main-content" tabIndex={-1} className={`workspace-main ${isToday ? 'pb-28 md:pb-16' : 'pb-44 md:pb-24'}`}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 py-6 md:px-6 md:py-8"
        >
          <Outlet />
        </motion.div>
      </main>
      <VoiceWidget showLauncher={!isToday} />
    </AppShell>
  );
}
