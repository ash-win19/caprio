import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export function VoiceWidget() {
  const { voiceState, setVoiceState } = useAppStore();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        if (voiceState === 'idle') {
          navigate('/new');
        }
      }
      if (e.key === 'Escape' && voiceState === 'listening') {
        setVoiceState('idle');
        setInput('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voiceState, setVoiceState, navigate]);

  useEffect(() => {
    if (voiceState === 'listening') inputRef.current?.focus();
  }, [voiceState]);

  const handleClick = () => {
    navigate('/new');
  };

  const spring = { stiffness: 400, damping: 30 };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <motion.button
        layout
        transition={spring}
        onClick={handleClick}
        className="relative flex items-center justify-center border border-border overflow-hidden"
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: 'hsl(var(--bg-elevated))',
        }}
      >
        <Mic size={20} className="text-primary" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse-ring" />
      </motion.button>
    </div>
  );
}
