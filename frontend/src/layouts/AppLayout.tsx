import { Outlet } from 'react-router-dom';
import { AppSidebar, MobileBottomNav } from '@/components/AppSidebar';
import { VoiceWidget } from '@/components/VoiceWidget';
import { motion } from 'framer-motion';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <MobileBottomNav />
      <main className="md:ml-[240px] pb-20 md:pb-0">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
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
