import React, { useState, useEffect, useRef } from 'react';
import { 
  Captions, Trash2, Copy, Check, Volume2, 
  AlertCircle, Maximize2, Minimize2, Sparkles, Languages,
  HelpCircle, RefreshCw, Mic, MicOff
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';

interface LiveCaptionsProps {
  isAudioActive: boolean;
}

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: string;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)' },
];

export const LiveCaptions: React.FC<LiveCaptionsProps> = ({ isAudioActive }) => {
  // Determine best default language prioritizing Indian locale
  const getInitialLang = (): string => {
    const saved = localStorage.getItem('earvan_captions_lang');
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) return saved;
    const browserLang = (navigator.language || (navigator as any).userLanguage || 'en-IN').toLowerCase();
    if (browserLang.startsWith('kn')) return 'kn-IN';
    if (browserLang.startsWith('hi')) return 'hi-IN';
    if (browserLang === 'en-us') return 'en-US';
    return 'en-IN'; // Quality-first default
  };

  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('earvan_captions_enabled');
    // Default to true so users immediately experience live captions
    return saved === null ? true : saved === 'true';
  });

  const [selectedLang, setSelectedLang] = useState<string>(getInitialLang);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micActivityLevel, setMicActivityLevel] = useState<number>(0); // 0 to 5 level

  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [isSimulatingPartner, setIsSimulatingPartner] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const isExplicitlyStoppedRef = useRef<boolean>(false);
  const animFrameRef = useRef<number | null>(null);

  const isEnabledRef = useRef(isEnabled);
  const isAudioActiveRef = useRef(isAudioActive);
  const selectedLangRef = useRef(selectedLang);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
    localStorage.setItem('earvan_captions_enabled', String(isEnabled));
  }, [isEnabled]);

  useEffect(() => {
    isAudioActiveRef.current = isAudioActive;
  }, [isAudioActive]);

  useEffect(() => {
    selectedLangRef.current = selectedLang;
  }, [selectedLang]);

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  // Real-time Mic Activity Sound Meter (Reads from audioEngine AnalyserNode)
  useEffect(() => {
    if (!isAudioActive) {
      setMicActivityLevel(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const checkLevel = () => {
      const analyser = audioEngine.getAnalyser();
      if (analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Calculate average speech energy in 300Hz - 3400Hz frequency range
        let sum = 0;
        const sampleCount = Math.min(bufferLength, 32);
        for (let i = 1; i < sampleCount; i++) {
          sum += dataArray[i];
        }
        const avg = sum / (sampleCount - 1);
        
        // Map 0-120 to 0-5 visual bars
        let level = 0;
        if (avg > 10) level = 1;
        if (avg > 25) level = 2;
        if (avg > 45) level = 3;
        if (avg > 70) level = 4;
        if (avg > 95) level = 5;
        setMicActivityLevel(level);
      }
      animFrameRef.current = requestAnimationFrame(checkLevel);
    };

    animFrameRef.current = requestAnimationFrame(checkLevel);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isAudioActive]);

  // Clean, robust SpeechRecognition runner
  const startRecognition = () => {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    // Terminate existing instance if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = selectedLangRef.current;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        const newFinalEntries: TranscriptEntry[] = [];

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptChunk = result[0]?.transcript || '';
          
          if (result.isFinal) {
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
          setHistory(prev => [...prev.slice(-50), ...newFinalEntries]);
        }
        setInterimText(currentInterim);
      };

      recognition.onerror = (event: any) => {
        const err = event.error;
        console.warn('[LiveCaptions] Speech error:', err);

        if (err === 'no-speech') {
          // Normal silence timeout in Chromium; do not treat as fatal error
          return;
        }

        if (err === 'not-allowed') {
          setErrorMsg('Microphone blocked by browser. Click the lock/settings icon in your address bar to allow microphone.');
        } else if (err === 'network') {
          setErrorMsg('Browser speech service offline. Check internet connection (Chrome/Edge Speech requires network).');
        } else if (err === 'audio-capture') {
          setErrorMsg('No microphone detected or mic is locked by another program.');
        } else if (err === 'language-not-supported') {
          setErrorMsg(`Language "${selectedLangRef.current}" is not supported by your browser's speech model.`);
        } else if (err !== 'aborted') {
          setErrorMsg(`Speech recognition paused: ${err}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);

        // Auto-restart if still enabled and not manually stopped
        if (isEnabledRef.current && isAudioActiveRef.current && !isExplicitlyStoppedRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = window.setTimeout(() => {
            if (isEnabledRef.current && isAudioActiveRef.current && !isExplicitlyStoppedRef.current) {
              startRecognition();
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('[LiveCaptions] Failed to start recognition:', err);
      if (err.name === 'InvalidStateError') {
        // Recognition already transitioning; retry shortly
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = window.setTimeout(() => {
          if (isEnabledRef.current && isAudioActiveRef.current) {
            startRecognition();
          }
        }, 500);
      } else {
        setErrorMsg('Could not start speech recognition: ' + (err.message || 'Error'));
      }
    }
  };

  const stopRecognition = () => {
    isExplicitlyStoppedRef.current = true;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
    setInterimText('');
  };

  // Manage start/stop triggers based on isEnabled and isAudioActive
  useEffect(() => {
    if (!isSupported) return;

    if (isEnabled && isAudioActive) {
      isExplicitlyStoppedRef.current = false;
      startRecognition();
    } else {
      stopRecognition();
    }

    return () => {
      stopRecognition();
    };
  }, [isEnabled, isAudioActive, isSupported]);

  // Language Change: cleanly restart recognition with newly selected language model
  const handleLanguageChange = (newLang: string) => {
    setSelectedLang(newLang);
    selectedLangRef.current = newLang;
    localStorage.setItem('earvan_captions_lang', newLang);

    if (isEnabled && isAudioActive) {
      stopRecognition();
      setTimeout(() => {
        isExplicitlyStoppedRef.current = false;
        startRecognition();
      }, 200);
    }
  };

  // Manual Jumpstart / Retry
  const handleManualRestart = () => {
    setErrorMsg(null);
    stopRecognition();
    setTimeout(() => {
      isExplicitlyStoppedRef.current = false;
      startRecognition();
    }, 200);
  };

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

    const samplePhrasesByLang: Record<string, string[]> = {
      'kn-IN': [
        "ನಮಸ್ಕಾರ! ನೀವು ಮಾತನಾಡುವ ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸುತ್ತಿದೆ.",
        "ಶುಭ ದಿನ! ಇವತ್ತಿನ ಸಂಭಾಷಣೆಗೆ ಎಲ್ಲವೂ ಸಿದ್ಧವಾಗಿದೆ.",
        "ನನ್ನ ಮಾತುಗಳು ನಿಮಗೆ ಸ್ಪಷ್ಟವಾಗಿ ಅರ್ಥವಾಗುತ್ತಿವೆಯೇ?"
      ],
      'hi-IN': [
        "नमस्ते! क्या आप मेरी आवाज़ स्पष्ट रूप से सुन और पढ़ पा रहे हैं?",
        "सुप्रभात! आज का दिन बहुत अच्छा है और हम बातचीत कर रहे हैं।",
        "ईयरवैन आपके कमरे में बोली जाने वाली बातों को तुरंत स्क्रीन पर लिखता है।"
      ],
      'en-IN': [
        "Hello! I am speaking to you across the room. Can you hear and read my words clearly?",
        "Good morning! Everything is ready for our conversation today.",
        "Earvan transcribes nearby speech into real-time text alongside your audio."
      ],
      'en-US': [
        "Hello! I am speaking to you across the room. Can you hear and read my words clearly?",
        "Good morning! Everything is ready for our conversation today.",
        "Earvan transcribes nearby speech into real-time text alongside your audio."
      ]
    };

    const phraseList = samplePhrasesByLang[selectedLang] || samplePhrasesByLang['en-IN'];
    const phrase = phraseList[Math.floor(Math.random() * phraseList.length)];

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
        <span>Live Captions requires Google Chrome, Microsoft Edge, or a browser with Web Speech API support.</span>
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
            ${isEnabled && isAudioActive && isListening
              ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' 
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}
          `}>
            <Captions className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                Live Speech Captions
              </h3>
              
              {/* Dynamic Status Badge */}
              {isEnabled && isAudioActive && (
                isListening ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
                    Listening
                  </span>
                ) : (
                  <button 
                    onClick={handleManualRestart}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200"
                    title="Click to reconnect speech recognizer"
                  >
                    <RefreshCw className="w-3 h-3" /> Reconnecting...
                  </button>
                )
              )}
            </div>

            {/* Subtitle with live sound detection meter */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Speech-to-text
              </span>
              
              {/* Real-time Mic VU Audio Level Meter */}
              {isAudioActive && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px]" title="Microphone sound activity in the room">
                  <Mic className="w-2.5 h-2.5 text-slate-400" />
                  <div className="flex items-end gap-0.5 h-2.5">
                    {[1, 2, 3, 4, 5].map(barIdx => (
                      <div
                        key={barIdx}
                        className={`w-0.5 rounded-full transition-all duration-75 ${
                          micActivityLevel >= barIdx 
                            ? barIdx >= 4 ? 'h-2.5 bg-amber-500' : 'h-2 bg-green-500' 
                            : 'h-1 bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {isEnabled && (
            <>
              {/* Language Selector */}
              <select
                value={selectedLang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                title="Select Spoken Language / Accent Model"
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

      {/* Error / Diagnostic Alert Banner */}
      {errorMsg && isEnabled && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={handleManualRestart}
            className="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-white font-semibold text-[11px] hover:bg-amber-300 shrink-0 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Captions Body / Transcript View */}
      {isEnabled ? (
        <div 
          ref={scrollRef}
          className={`
            p-4 overflow-y-auto space-y-2.5 transition-all
            ${isExpanded ? 'flex-1 max-h-[calc(100vh-140px)]' : 'h-48 max-h-48'}
            ${fontSize === 'large' ? 'text-lg leading-loose' : 'text-sm leading-relaxed'}
          `}
        >
          {history.length === 0 && !interimText && (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 dark:text-slate-500 space-y-2">
              <Captions className="w-7 h-7 opacity-40" />
              <p className="font-medium text-xs">
                {!isAudioActive 
                  ? 'Turn on Hearing Assist above to start transcribing.' 
                  : isListening 
                    ? `Listening in ${SUPPORTED_LANGUAGES.find(l => l.code === selectedLang)?.label || selectedLang}... Speak or play audio.`
                    : 'Starting speech recognizer...'}
              </p>
              
              {/* Simulate Partner Button for Solo Testing */}
              {isAudioActive && (
                <button
                  onClick={handleSimulatePartnerSpeech}
                  disabled={isSimulatingPartner}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 transition-colors shadow-sm"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  {isSimulatingPartner ? 'Partner speaking...' : 'Test Speech Recognition with Voice'}
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
              Room voices quiet? Increase <strong>Mic Sensitivity</strong> in the selector above.
            </span>
          </div>
          {history.length > 0 && isAudioActive && (
            <button
              onClick={handleSimulatePartnerSpeech}
              disabled={isSimulatingPartner}
              className="ml-2 text-primary-600 dark:text-primary-400 font-medium hover:underline shrink-0"
            >
              {isSimulatingPartner ? 'Speaking...' : 'Test Voice'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
