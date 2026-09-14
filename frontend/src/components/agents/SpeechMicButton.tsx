import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/motion/button';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

type SpeechMicButtonProps = {
  value: string;
  onTranscript: (next: string) => void;
  disabled?: boolean;
};

/** Browser speech → composer transcript. Hidden when Web Speech API is unavailable. */
export function SpeechMicButton({ value, onTranscript, disabled }: SpeechMicButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => speechRecognitionSupported());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baselineRef = useRef('');

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  if (!supported) return null;

  const stop = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  const start = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || disabled) return;
    baselineRef.current = value;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    recognition.onresult = (event) => {
      let spoken = '';
      for (let i = 0; i < event.results.length; i += 1) {
        spoken += event.results[i][0]?.transcript ?? '';
      }
      const chunk = spoken.trim();
      const base = baselineRef.current.trim();
      onTranscript(chunk ? (base ? `${base} ${chunk}` : chunk) : baselineRef.current);
    };
    recognition.onerror = () => stop();
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      stop();
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={listening}
      onClick={() => (listening ? stop() : start())}
      className="size-8 rounded-full"
    >
      {listening ? <MicOff className="h-4 w-4 text-primary" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
