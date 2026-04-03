import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { mockPrioritize } from '@/lib/mockPrioritize';
import { useToast } from '@/hooks/use-toast';

export function VoiceWidget() {
  const { voiceState, setVoiceState, tasks, applyPrioritization, undoPrioritization, addVoiceEntry } = useAppStore();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        if (voiceState === 'idle') {
          setVoiceState('listening');
        }
      }
      if (e.key === 'Escape' && voiceState === 'listening') {
        setVoiceState('idle');
        setInput('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voiceState, setVoiceState]);

  useEffect(() => {
    if (voiceState === 'listening') inputRef.current?.focus();
  }, [voiceState]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setVoiceState('processing');
    addVoiceEntry({ id: Date.now().toString(), transcript: input, timestamp: 'Just now' });
    
    try {
      const result = await mockPrioritize(input, tasks);
      applyPrioritization(result.tasks, result.changes);
      setVoiceState('idle');
      setInput('');
      toast({
        title: `↑↓ ${result.changes.length} tasks reprioritized`,
        description: 'Undo',
        duration: 5000,
      });
    } catch {
      setVoiceState('idle');
    }
  };

  const spring = { stiffness: 400, damping: 30 };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {voiceState === 'listening' && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            className="bg-card border border-border rounded-lg p-3 shadow-float w-[280px]"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="What changed in your day?"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        layout
        transition={spring}
        onClick={() => {
          if (voiceState === 'idle') setVoiceState('listening');
          else if (voiceState === 'listening') { setVoiceState('idle'); setInput(''); }
        }}
        className="relative flex items-center justify-center border border-border overflow-hidden"
        style={{
          width: voiceState === 'idle' ? 48 : 240,
          height: 48,
          borderRadius: voiceState === 'idle' ? 24 : 24,
          backgroundColor: voiceState === 'processing'
            ? 'rgba(251,191,36,0.1)'
            : 'hsl(var(--bg-elevated))',
          borderColor: voiceState === 'processing'
            ? 'hsl(var(--amber))'
            : undefined,
        }}
      >
        {voiceState === 'idle' && (
          <>
            <Mic size={20} className="text-primary" />
            <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse-ring" />
          </>
        )}
        {voiceState === 'listening' && (
          <div className="flex items-center gap-3 px-4 w-full">
            <span className="w-2 h-2 rounded-full bg-cap-red animate-pulse" />
            <div className="flex items-center gap-1">
              {[0.3, 0.5, 0.4, 0.6, 0.35].map((d, i) => (
                <motion.span
                  key={i}
                  className="w-[3px] rounded-full bg-primary"
                  animate={{ height: [4, 24, 4] }}
                  transition={{ duration: d, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>
            <span className="text-mono text-[11px] ml-auto">Listening...</span>
            <button onClick={(e) => { e.stopPropagation(); setVoiceState('idle'); setInput(''); }}>
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>
        )}
        {voiceState === 'processing' && (
          <div className="flex items-center gap-3 px-4">
            <Loader2 size={16} className="animate-spin text-amber" />
            <span className="text-[11px] font-mono text-amber">Reprioritizing...</span>
          </div>
        )}
      </motion.button>
    </div>
  );
}
