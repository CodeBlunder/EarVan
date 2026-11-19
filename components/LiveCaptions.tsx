import React, { useState, useEffect, useRef } from 'react';
import { 
  Captions, Trash2, Copy, Check, Volume2, 
  AlertCircle, Maximize2, Minimize2, Sparkles, Languages,
  PlayCircle, StopCircle, HelpCircle
} from 'lucide-react';

interface LiveCaptionsProps {
  isAudioActive: boolean;
}

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: string;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
];

export const LiveCaptions: React.FC<LiveCaptionsProps> = ({ isAudioActive }) => {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('earvan_captions_enabled') === 'true';
  });
  const [selectedLang, setSelectedLang] = useState<string>('en-US');
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [isSimulatingPartner, setIsSimulatingPartner] = useState<boolean>(false);
  const [showHelpTip, setShowHelpTip] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const isEnabledRef = useRef(isEnabled);
  const isAudioActiveRef = useRef(isAudioActive);
  const selectedLangRef = useRef(selectedLang);

  // Keep refs up-to-date for async event listeners
  useEffect(() => {
    isEnabledRef.current = isEnabled;
    localStorage.setItem('earvan_captions_enabled', String(isEnabled));
  }, [isEnabled]);

  useEffect(() => {
    isAudioActiveRef.current = isAudioActive;
  }, [isAudioActive]);

  useEffect(() => {
    selectedLangRef.current = selectedLang;
    if (recognitionRef.current) {
      recognitionRef.current.lang = selectedLang;
    }
  }, [selectedLang]);

  // Initialize SpeechRecognition on mount
  useEffect(() => {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = selectedLangRef.current;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        const newFinalEntries: TranscriptEntry[] = [];

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            if (transcriptChunk.trim()) {
              newFinalEntries.push({
                id: crypto.randomUUID(),
                text: transcriptChunk.trim(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              });
            }
          } else {
            currentInterim += transcriptChunk;
          }
        }

        if (newFinalEntries.length > 0) {
          setHistory(prev => [...prev.slice(-40), ...newFinalEntries]);
        }
        setInterimText(currentInterim);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('[LiveCaptions] Speech error:', event.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Browser speech engines auto-stop on silence; auto-restart if still enabled
        if (isEnabledRef.current && isAudioActiveRef.current) {
          restartTimeoutRef.current = window.setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {}
          }, 350);
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.error('[LiveCaptions] Failed to setup SpeechRecognition:', e);
      setIsSupported(false);
    }

    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  // Control speech recognition start/stop based on isEnabled and isAudioActive
  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isSupported) return;

    if (isEnabled && isAudioActive) {
      try {
        recognition.start();
      } catch (e) {
        // May already be active
      }
    } else {
      try {
        recognition.stop();
        setIsListening(false);
        setInterimText('');
      } catch (e) {}
    }
  }, [isEnabled, isAudioActive, isSupported]);

  // Auto-scroll to latest captions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, interimText]);

  const handleClear = () => {
    setHistory([]);
    setInterimText('');
  };

  const handleCopy = async () => {
    const fullText = history.map(h => `[${h.timestamp}] ${h.text}`).join('\n');
    if (!fullText) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  // Simulate Partner Voice via SpeechSynthesis
  const handleSimulatePartnerSpeech = () => {
    if (!('speechSynthesis' in window)) return;
    if (isSimulatingPartner) {
      window.speechSynthesis.cancel();
      setIsSimulatingPartner(false);
      return;
    }

    setIsSimulatingPartner(true);
    window.speechSynthesis.cancel();

    const samplePhrases = [
      "Hello there! I am your conversation partner sitting across the table. Can you read and hear my words clearly?",
      "Good morning! The weather is fantastic today and our meeting starts in five minutes.",
      "Could you please pass me the documents when you have a moment?"
    ];
    const phrase = samplePhrases[Math.floor(Math.random() * samplePhrases.length)];

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = selectedLang;
    utterance.rate = 0.95;

    utterance.onend = () => setIsSimulatingPartner(false);
    utterance.onerror = () => setIsSimulatingPartner(false);

    window.speechSynthesis.speak(utterance);
  };

  if (!isSupported) {
    return (
      <div className="w-full bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <span>Live Captions requires Chrome, Edge, or a browser with Web Speech API support.</span>
      </div>
    );
  }

  return (
    <div className={`
      w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700
      transition-all duration-300 overflow-hidden flex flex-col
      ${isExpanded ? 'fixed inset-4 z-50 max-w-3xl mx-auto shadow-2xl' : 'relative'}
    `}>
      {/* Captions Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2.5">
          <div className={`
            p-2 rounded-xl transition-colors
            ${isEnabled && isAudioActive
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400' 
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}
          `}>
            <Captions className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                Live Speech Captions
              </h3>
              {isEnabled && isAudioActive && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
                  Transcribing
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Real-time speech-to-text transcription
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {isEnabled && (
            <>
              {/* Language Selector */}
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none"
                title="Select Spoken Language"
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>

              <button
                onClick={() => setFontSize(prev => prev === 'normal' ? 'large' : 'normal')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-xs font-bold"
                title={fontSize === 'normal' ? 'Larger font' : 'Standard font'}
              >
                {fontSize === 'normal' ? 'A+' : 'A-'}
              </button>
              {history.length > 0 && (
                <>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Copy transcript"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleClear}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Clear transcript"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand full screen'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </>
          )}

          {/* Toggle Switch */}
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`
              relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent 
              transition-colors duration-200 ease-in-out focus:outline-none
              ${isEnabled ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'}
            `}
            role="switch"
            aria-checked={isEnabled}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
                transition duration-200 ease-in-out
                ${isEnabled ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Captions Body / Transcript View */}
      {isEnabled ? (
        <div 
          ref={scrollRef}
          className={`
            p-4 overflow-y-auto space-y-2.5 transition-all
            ${isExpanded ? 'flex-1 max-h-[calc(100vh-140px)]' : 'h-48 max-h-48'}
            ${fontSize === 'large' ? 'text-lg leading-relaxed' : 'text-sm leading-normal'}
          `}
        >
          {history.length === 0 && !interimText && (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 dark:text-slate-500 space-y-2">
              <Captions className="w-7 h-7 opacity-40" />
              <p className="font-medium text-xs">
                {isAudioActive ? 'Listening for speech in the room...' : 'Turn on Hearing Assist to start transcribing.'}
              </p>
              
              {/* Simulate Partner Button for Solo Testing */}
              {isAudioActive && (
                <button
                  onClick={handleSimulatePartnerSpeech}
                  disabled={isSimulatingPartner}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 transition-colors shadow-sm"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  {isSimulatingPartner ? 'Partner is speaking...' : 'Test Conversation Partner Voice'}
                </button>
              )}
            </div>
          )}

          {/* Transcript History */}
          {history.map((entry) => (
            <div key={entry.id} className="group flex items-start gap-2">
              <span className="text-[10px] font-mono text-slate-400 pt-0.5 select-none shrink-0 opacity-60">
                {entry.timestamp}
              </span>
              <p className="text-slate-800 dark:text-slate-100 font-medium break-words">
                {entry.text}
              </p>
            </div>
          ))}

          {/* Active Interim Text (currently being spoken) */}
          {interimText && (
            <div className="flex items-start gap-2 animate-pulse">
              <span className="text-[10px] font-mono text-primary-500 pt-0.5 select-none shrink-0 font-bold">
                Live
              </span>
              <p className="text-primary-600 dark:text-primary-400 italic break-words">
                {interimText}
                <span className="inline-block w-1.5 h-4 ml-1 bg-primary-500 animate-pulse align-middle" />
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-850 text-xs text-slate-400 dark:text-slate-500 flex items-center justify-between">
          <span>Live captions are currently paused. Toggle switch to enable.</span>
        </div>
      )}

      {/* Helpful Partner Audio Explanation Footer */}
      {isEnabled && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 truncate">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              Mic listens to room audio. For video clips, play through speakers or phone.
            </span>
          </div>
          {history.length > 0 && isAudioActive && (
            <button
              onClick={handleSimulatePartnerSpeech}
              disabled={isSimulatingPartner}
              className="ml-2 text-primary-600 dark:text-primary-400 font-medium hover:underline shrink-0"
            >
              {isSimulatingPartner ? 'Speaking...' : 'Test Partner Voice'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
