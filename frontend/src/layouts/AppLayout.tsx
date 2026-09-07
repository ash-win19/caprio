import { Outlet } from 'react-router-dom';
import { AppSidebar, MobileBottomNav } from '@/components/AppSidebar';
import { VoiceWidget } from '@/components/VoiceWidget';
import { CONTENT_OFFSET_CLASS, useSidebarStore } from '@/lib/sidebar';
import { motion, useReducedMotion } from 'framer-motion';

export default function AppLayout() {
  const reduceMotion = useReducedMotion();
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <MobileBottomNav />
      <main className={`pb-44 transition-[margin-left] duration-300 ease-in-out motion-reduce:transition-none md:pb-24 ${collapsed ? CONTENT_OFFSET_CLASS.collapsed : CONTENT_OFFSET_CLASS.expanded}`}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 md:px-6 py-6"
        >
          <Outlet />
        </motion.div>
      </main>
      <VoiceWidget />
    </div>
  );
}
