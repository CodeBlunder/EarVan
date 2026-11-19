import React, { useState, useEffect, useRef } from 'react';
import { User, HearingProfile, HearingTestResult } from '../types';
import { audioEngine } from '../services/audioEngine';
import { authService } from '../services/authService';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { 
  Ear, Volume2, CheckCircle2, ArrowRight, RotateCcw, 
  Sparkles, Activity, ShieldCheck, ChevronLeft, Sliders
} from 'lucide-react';

interface HearingTestPageProps {
  user: User;
  onComplete: () => void;
  onCancel: () => void;
  onManualEdit?: (profile: HearingProfile) => void;
}

interface TestBandConfig {
  freq: 500 | 1000 | 2000 | 4000 | 8000;
  label: string;
  description: string;
}

const TEST_BANDS: TestBandConfig[] = [
  { freq: 500, label: '500 Hz', description: 'Low Bass & Ambient Tone' },
  { freq: 1000, label: '1,000 Hz', description: 'Vowel & Speech Foundation' },
  { freq: 2000, label: '2,000 Hz', description: 'Speech & Consonant Clarity' },
  { freq: 4000, label: '4,000 Hz', description: 'High Clarity (s, f, th sounds)' },
  { freq: 8000, label: '8,000 Hz', description: 'High Treble & Brilliance' },
];

export const HearingTestPage: React.FC<HearingTestPageProps> = ({ 
  user, 
  onComplete, 
  onCancel,
  onManualEdit 
}) => {
  type TestStage = 'INTRO' | 'TESTING' | 'BAND_CONFIRMED' | 'RESULTS';
  const [stage, setStage] = useState<TestStage>('INTRO');
  const [currentBandIndex, setCurrentBandIndex] = useState(0);
  const [currentVolume, setCurrentVolume] = useState<number>(0.004);
  const [isPlayingTone, setIsPlayingTone] = useState(false);
  const [isSamplePlaying, setIsSamplePlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Store measured threshold gains
  const [results, setResults] = useState<HearingTestResult[]>([]);

  // Timer refs for tone pulse and volume ramping
  const timerRef = useRef<number | null>(null);
  const pulseIntervalRef = useRef<number | null>(null);
  const volumeRef = useRef<number>(0.004);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  const stopAllAudio = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pulseIntervalRef.current) clearInterval(pulseIntervalRef.current);
    audioEngine.stopTone();
    setIsPlayingTone(false);
    setIsSamplePlaying(false);
  };

  // Keyboard shortcut listener for spacebar during testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && stage === 'TESTING') {
        e.preventDefault();
        handleUserDetectedTone();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stage, currentBandIndex, results]);

  const handlePlaySample = async () => {
    if (isSamplePlaying) {
      stopAllAudio();
      return;
    }
    setIsSamplePlaying(true);
    await audioEngine.startTone(1000, 0.08);
    setTimeout(() => {
      audioEngine.stopTone();
      setIsSamplePlaying(false);
    }, 1200);
  };

  const startTest = async () => {
    stopAllAudio();
    setResults([]);
    setCurrentBandIndex(0);
    setStage('TESTING');
    startBandTesting(0);
  };

  const startBandTesting = async (bandIdx: number) => {
    stopAllAudio();
    const band = TEST_BANDS[bandIdx];
    if (!band) {
      finishTest(results);
      return;
    }

    // Start with a faint volume
    const startingVol = 0.003;
    volumeRef.current = startingVol;
    setCurrentVolume(startingVol);
    setIsPlayingTone(true);

    // Initial tone start
    await audioEngine.startTone(band.freq, startingVol);

    // Tone pulsing loop: beep for 350ms, pause 150ms, ramp volume up slowly
    let isOn = true;
    pulseIntervalRef.current = window.setInterval(() => {
      if (isOn) {
        // Turn off momentarily
        audioEngine.setToneVolume(0.0001);
        isOn = false;
      } else {
        // Ramp up volume slightly and turn back on
        volumeRef.current = Math.min(volumeRef.current * 1.18 + 0.0012, 0.45);
        setCurrentVolume(volumeRef.current);
        audioEngine.setToneVolume(volumeRef.current);
        isOn = true;

        // Auto-advance if max volume reached without response
        if (volumeRef.current >= 0.40) {
          handleUserDetectedTone();
        }
      }
    }, 450);
  };

  const classifyLoss = (vol: number): { classification: HearingTestResult['lossClassification'], gain: number } => {
    // Volume threshold mapping:
    // vol <= 0.035 -> Normal (0 dB boost)
    // vol <= 0.085 -> Mild (+3 to +5 dB)
    // vol <= 0.170 -> Moderate (+6 to +9 dB)
    // vol > 0.170  -> High (+10 to +14 dB)
    if (vol <= 0.035) {
      return { classification: 'Normal', gain: 0 };
    } else if (vol <= 0.085) {
      const g = Math.round(3 + (vol - 0.035) / (0.085 - 0.035) * 2);
      return { classification: 'Mild', gain: g };
    } else if (vol <= 0.170) {
      const g = Math.round(6 + (vol - 0.085) / (0.170 - 0.085) * 3);
      return { classification: 'Moderate', gain: g };
    } else {
      const g = Math.min(14, Math.round(10 + (vol - 0.170) / (0.40 - 0.170) * 4));
      return { classification: 'Severe', gain: g };
    }
  };

  const handleUserDetectedTone = () => {
    stopAllAudio();
    const band = TEST_BANDS[currentBandIndex];
    const thresholdVol = volumeRef.current;
    const { classification, gain } = classifyLoss(thresholdVol);

    const bandResult: HearingTestResult = {
      frequency: band.freq,
      thresholdGain: thresholdVol,
      lossClassification: classification,
      recommendedGain: gain
    };

    const updatedResults = [...results, bandResult];
    setResults(updatedResults);
    setStage('BAND_CONFIRMED');

    setTimeout(() => {
      const nextIdx = currentBandIndex + 1;
      if (nextIdx < TEST_BANDS.length) {
        setCurrentBandIndex(nextIdx);
        setStage('TESTING');
        startBandTesting(nextIdx);
      } else {
        finishTest(updatedResults);
      }
    }, 800);
  };

  const finishTest = (finalResults: HearingTestResult[]) => {
    stopAllAudio();
    setStage('RESULTS');
  };

  const constructProfile = (): HearingProfile => {
    const eqBands = { 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0 };
    results.forEach(r => {
      const freq = r.frequency as keyof HearingProfile['eqBands'];
      if (freq in eqBands) {
        eqBands[freq] = r.recommendedGain;
      }
    });
    return { eqBands };
  };

  const handleSaveAndApply = async () => {
    setIsSaving(true);
    try {
      const newProfile = constructProfile();
      await authService.updateProfile(user.id, newProfile);
      audioEngine.setProfile(newProfile);
      await audioEngine.restoreMic();
      onComplete();
    } catch (e) {
      console.error("Failed to save profile", e);
      setIsSaving(false);
    }
  };

  const handleManualEditClick = () => {
    const newProfile = constructProfile();
    if (onManualEdit) {
      onManualEdit(newProfile);
    } else {
      onComplete();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white flex flex-col transition-colors duration-300">
      {/* Top Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors"
            title="Cancel and return"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-xl">
              <Ear className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">Interactive Hearing Test</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pure-tone audiometry calibration</p>
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
        {/* STAGE 1: INTRO */}
        {stage === 'INTRO' && (
          <div className="w-full space-y-6">
            <div className="text-center space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                <Sparkles className="w-3.5 h-3.5" /> 5-Frequency Audiometry
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight">Let's Calibrate Your Ears</h2>
              <p className="text-slate-600 dark:text-slate-300 text-base max-w-lg mx-auto">
                We will play faint, pulsing tones across 5 frequencies. Tap the button the moment you hear each sound to generate your custom hearing profile.
              </p>
            </div>

            {/* Preparation Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Before you begin</h3>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700">
                  <div className="text-primary-500 font-bold mb-1">1. Earphones On</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Required for accurate frequency isolation.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700">
                  <div className="text-primary-500 font-bold mb-1">2. Volume at 50%</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Set your phone or laptop volume to about half.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700">
                  <div className="text-primary-500 font-bold mb-1">3. Quiet Spot</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Minimizes background interference.</p>
                </div>
              </div>
            </div>

            {/* Sample Tone Preview */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-primary-50/50 dark:bg-primary-950/20 border border-primary-100 dark:border-primary-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Sound Preview</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Listen to a sample 1,000 Hz calibration tone</div>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handlePlaySample}
              >
                {isSamplePlaying ? 'Playing...' : 'Play Sample'}
              </Button>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <Button 
                size="lg" 
                className="w-full text-base py-4 font-semibold shadow-lg shadow-primary-500/20"
                onClick={startTest}
              >
                Start Test <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STAGE 2: TESTING & BAND_CONFIRMED */}
        {(stage === 'TESTING' || stage === 'BAND_CONFIRMED') && (
          <div className="w-full space-y-8 flex flex-col items-center text-center">
            {/* Progress indicators */}
            <div className="w-full max-w-md">
              <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                <span>Band {currentBandIndex + 1} of {TEST_BANDS.length}</span>
                <span>{TEST_BANDS[currentBandIndex]?.label}</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 transition-all duration-300 rounded-full"
                  style={{ width: `${((currentBandIndex + (stage === 'BAND_CONFIRMED' ? 1 : 0.3)) / TEST_BANDS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Center Visual Radar */}
            <div className="relative flex items-center justify-center my-4">
              {/* Outer pulsing ripple circles */}
              {stage === 'TESTING' && (
                <>
                  <div className="absolute w-64 h-64 rounded-full bg-primary-400/10 animate-ping opacity-75" />
                  <div className="absolute w-48 h-48 rounded-full bg-primary-500/20 animate-pulse" />
                </>
              )}
              {stage === 'BAND_CONFIRMED' && (
                <div className="absolute w-48 h-48 rounded-full bg-green-500/20 animate-pulse" />
              )}

              {/* Central frequency badge */}
              <div className={`
                relative z-10 w-36 h-36 rounded-full flex flex-col items-center justify-center
                border-4 shadow-xl transition-all duration-300
                ${stage === 'BAND_CONFIRMED' 
                  ? 'bg-green-500 text-white border-green-300 dark:border-green-400 scale-105' 
                  : 'bg-white dark:bg-slate-800 border-primary-500 text-slate-900 dark:text-white'}
              `}>
                {stage === 'BAND_CONFIRMED' ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 mb-1" />
                    <span className="text-xs font-bold uppercase tracking-wider">Detected!</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-6 h-6 text-primary-500 mb-1 animate-pulse" />
                    <span className="text-xl font-extrabold tracking-tight">
                      {TEST_BANDS[currentBandIndex]?.label}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      Testing...
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Description & Instruction */}
            <div className="space-y-1 max-w-sm">
              <h3 className="text-lg font-bold">
                {TEST_BANDS[currentBandIndex]?.description}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {stage === 'TESTING' 
                  ? 'Listen carefully. The tone will gently increase in volume.'
                  : 'Recording your threshold frequency...'}
              </p>
            </div>

            {/* The Tactile "I HEAR IT" Response Button */}
            <div className="w-full max-w-md pt-4 space-y-3">
              <button
                disabled={stage === 'BAND_CONFIRMED'}
                onClick={handleUserDetectedTone}
                className={`
                  w-full py-6 px-8 rounded-2xl font-bold text-xl shadow-xl transition-all duration-150
                  flex items-center justify-center gap-3 active:scale-95
                  ${stage === 'BAND_CONFIRMED'
                    ? 'bg-green-600 text-white opacity-90 cursor-default'
                    : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-500/30 hover:shadow-primary-500/50'}
                `}
              >
                <Volume2 className="w-6 h-6" />
                I Hear It Now!
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Tip: You can also press <kbd className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px]">Spacebar</kbd> on your keyboard.
              </p>
            </div>
          </div>
        )}

        {/* STAGE 3: RESULTS & AUDIOGRAM */}
        {stage === 'RESULTS' && (
          <div className="w-full space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-3.5 h-3.5" /> Audiogram Complete
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Your Custom Hearing Profile</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Based on your responses, we calculated these compensation gain values for each frequency band:
              </p>
            </div>

            {/* Frequency Bands Table / Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
              <div className="grid grid-cols-3 text-xs font-bold text-slate-400 uppercase pb-2 border-b border-slate-100 dark:border-slate-700">
                <span>Frequency</span>
                <span className="text-center">Sensitivity</span>
                <span className="text-right">EQ Boost</span>
              </div>
              {results.map((res) => {
                const badgeColor = 
                  res.lossClassification === 'Normal' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                  res.lossClassification === 'Mild' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                  res.lossClassification === 'Moderate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';

                return (
                  <div key={res.frequency} className="flex items-center justify-between py-2 text-sm">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {res.frequency >= 1000 ? `${res.frequency / 1000} kHz` : `${res.frequency} Hz`}
                    </div>
                    <div className="text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                        {res.lossClassification}
                      </span>
                    </div>
                    <div className="text-right font-mono font-bold text-primary-600 dark:text-primary-400">
                      {res.recommendedGain > 0 ? `+${res.recommendedGain} dB` : '0 dB'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual Audiogram Curve */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary-500" />
                <span>Protected by Earvan's active dynamics compressor limiter.</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <Button
                size="lg"
                className="w-full font-semibold shadow-lg shadow-primary-500/20 py-4"
                onClick={handleSaveAndApply}
                disabled={isSaving}
              >
                {isSaving ? 'Applying Profile...' : 'Save & Apply to Hearing Aid'}
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  onClick={handleManualEditClick}
                  className="flex items-center justify-center gap-2"
                >
                  <Sliders className="w-4 h-4" /> Fine-tune Manually
                </Button>
                <Button 
                  variant="outline" 
                  onClick={startTest}
                  className="flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Retest
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

