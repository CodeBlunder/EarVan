import React, { useState, useEffect, useRef } from 'react';
import { User, HearingProfile, HearingTestResult, BandGains, DEFAULT_BAND_GAINS } from '../types';
import { audioEngine } from '../services/audioEngine';
import { authService } from '../services/authService';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { 
  Ear, Volume2, CheckCircle2, ArrowRight, RotateCcw, 
  Sparkles, Activity, ShieldCheck, ChevronLeft, Sliders,
  Headphones
} from 'lucide-react';

interface HearingTestPageProps {
  user: User;
  onComplete: () => void;
  onCancel: () => void;
  onManualEdit?: (profile: HearingProfile) => void;
}

interface TestBandConfig {
  freq: keyof BandGains;
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

type ActiveEar = 'LEFT' | 'RIGHT';
type TestStage = 'INTRO' | 'TESTING' | 'BAND_CONFIRMED' | 'EAR_INTERMISSION' | 'RESULTS';

export const HearingTestPage: React.FC<HearingTestPageProps> = ({ 
  user, 
  onComplete, 
  onCancel,
  onManualEdit 
}) => {
  const [stage, setStage] = useState<TestStage>('INTRO');
  const [activeEar, setActiveEar] = useState<ActiveEar>('LEFT');
  const [currentBandIndex, setCurrentBandIndex] = useState(0);
  const [currentVolume, setCurrentVolume] = useState<number>(0.003);
  const [isPlayingTone, setIsPlayingTone] = useState(false);
  const [isSamplePlaying, setIsSamplePlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Store measured threshold gains for Left and Right ear
  const [leftResults, setLeftResults] = useState<HearingTestResult[]>([]);
  const [rightResults, setRightResults] = useState<HearingTestResult[]>([]);

  // Timer refs for tone pulse and volume ramping
  const pulseIntervalRef = useRef<number | null>(null);
  const volumeRef = useRef<number>(0.003);
  const activeEarRef = useRef<ActiveEar>('LEFT');

  useEffect(() => {
    activeEarRef.current = activeEar;
  }, [activeEar]);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  const stopAllAudio = () => {
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }
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
  }, [stage, currentBandIndex, activeEar, leftResults, rightResults]);

  const handlePlaySample = async () => {
    if (isSamplePlaying) {
      stopAllAudio();
      return;
    }
    setIsSamplePlaying(true);
    // Play sample tone centered
    await audioEngine.startTone(1000, 0.08, 0);
    setTimeout(() => {
      audioEngine.stopTone();
      setIsSamplePlaying(false);
    }, 1200);
  };

  const startTest = async () => {
    stopAllAudio();
    setLeftResults([]);
    setRightResults([]);
    setActiveEar('LEFT');
    setCurrentBandIndex(0);
    setStage('TESTING');
    startBandTesting('LEFT', 0);
  };

  const startRightEarTest = () => {
    stopAllAudio();
    setActiveEar('RIGHT');
    setCurrentBandIndex(0);
    setStage('TESTING');
    startBandTesting('RIGHT', 0);
  };

  const startBandTesting = async (ear: ActiveEar, bandIdx: number) => {
    stopAllAudio();
    const band = TEST_BANDS[bandIdx];
    if (!band) return;

    // Start with a faint volume
    const startingVol = 0.003;
    volumeRef.current = startingVol;
    setCurrentVolume(startingVol);
    setIsPlayingTone(true);

    // Pan: Left ear = -1.0, Right ear = 1.0
    const pan = ear === 'LEFT' ? -1.0 : 1.0;
    await audioEngine.startTone(band.freq, startingVol, pan);

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
      ear: activeEar,
      frequency: band.freq,
      thresholdGain: thresholdVol,
      lossClassification: classification,
      recommendedGain: gain
    };

    if (activeEar === 'LEFT') {
      const updatedLeft = [...leftResults, bandResult];
      setLeftResults(updatedLeft);
      setStage('BAND_CONFIRMED');

      setTimeout(() => {
        const nextIdx = currentBandIndex + 1;
        if (nextIdx < TEST_BANDS.length) {
          setCurrentBandIndex(nextIdx);
          setStage('TESTING');
          startBandTesting('LEFT', nextIdx);
        } else {
          // Left ear complete -> Show Intermission before Right Ear
          setStage('EAR_INTERMISSION');
        }
      }, 700);
    } else {
      const updatedRight = [...rightResults, bandResult];
      setRightResults(updatedRight);
      setStage('BAND_CONFIRMED');

      setTimeout(() => {
        const nextIdx = currentBandIndex + 1;
        if (nextIdx < TEST_BANDS.length) {
          setCurrentBandIndex(nextIdx);
          setStage('TESTING');
          startBandTesting('RIGHT', nextIdx);
        } else {
          // Both ears complete!
          finishTest();
        }
      }, 700);
    }
  };

  const finishTest = () => {
    stopAllAudio();
    setStage('RESULTS');
  };

  const constructBinauralProfile = (): HearingProfile => {
    const leftBands: BandGains = { ...DEFAULT_BAND_GAINS };
    const rightBands: BandGains = { ...DEFAULT_BAND_GAINS };

    leftResults.forEach(r => {
      const freq = r.frequency as keyof BandGains;
      if (freq in leftBands) {
        leftBands[freq] = r.recommendedGain;
      }
    });

    rightResults.forEach(r => {
      const freq = r.frequency as keyof BandGains;
      if (freq in rightBands) {
        rightBands[freq] = r.recommendedGain;
      }
    });

    return {
      eqBands: { ...leftBands }, // fallback
      leftEar: leftBands,
      rightEar: rightBands,
      balance: 0,
      isLinked: false
    };
  };

  const handleSaveAndApply = async () => {
    setIsSaving(true);
    try {
      const newProfile = constructBinauralProfile();
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
    const newProfile = constructBinauralProfile();
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
              <h1 className="font-bold text-base leading-tight">Binaural Hearing Test</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Independent Left & Right ear calibration</p>
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
                <Sparkles className="w-3.5 h-3.5" /> Binaural 5-Frequency Calibration
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight">Calibrate Both Ears Individually</h2>
              <p className="text-slate-600 dark:text-slate-300 text-base max-w-lg mx-auto">
                We will play faint pulsing tones in your <strong>Left Ear first</strong>, followed by your <strong>Right Ear</strong>. Tap the button the moment you hear each sound.
              </p>
            </div>

            {/* Preparation Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Before you begin</h3>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700">
                  <div className="text-primary-500 font-bold mb-1 flex items-center gap-1.5">
                    <Headphones className="w-4 h-4" /> 1. Earphones On
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Ensure left & right earphones are correctly inserted.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700">
                  <div className="text-primary-500 font-bold mb-1 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4" /> 2. Volume at 50%
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Set your phone or laptop volume to about half.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700">
                  <div className="text-primary-500 font-bold mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> 3. Quiet Room
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Minimizes background acoustic interference.</p>
                </div>
              </div>
            </div>

            {/* Ear Indicator Graphic */}
            <div className="flex items-center justify-around p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-sm">L</span>
                <div>
                  <div className="font-semibold text-sm">Step 1: Left Ear</div>
                  <div className="text-xs text-slate-500">5 Frequencies</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold flex items-center justify-center text-sm">R</span>
                <div>
                  <div className="font-semibold text-sm">Step 2: Right Ear</div>
                  <div className="text-xs text-slate-500">5 Frequencies</div>
                </div>
              </div>
            </div>

            {/* Sound Preview */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-primary-50/50 dark:bg-primary-950/20 border border-primary-100 dark:border-primary-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Sound Preview</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Sample 1,000 Hz calibration tone</div>
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
                Start Test (Left Ear First) <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STAGE 2: TESTING & BAND_CONFIRMED */}
        {(stage === 'TESTING' || stage === 'BAND_CONFIRMED') && (
          <div className="w-full space-y-8 flex flex-col items-center text-center">
            {/* Active Ear Banner */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm transition-all">
              {activeEar === 'LEFT' ? (
                <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5" /> Testing Left Ear (Channel L)
                </span>
              ) : (
                <span className="bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5" /> Testing Right Ear (Channel R)
                </span>
              )}
            </div>

            {/* Progress indicators */}
            <div className="w-full max-w-md">
              <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                <span>Band {currentBandIndex + 1} of {TEST_BANDS.length}</span>
                <span>{TEST_BANDS[currentBandIndex]?.label}</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 rounded-full ${activeEar === 'LEFT' ? 'bg-blue-500' : 'bg-rose-500'}`}
                  style={{ width: `${((currentBandIndex + (stage === 'BAND_CONFIRMED' ? 1 : 0.3)) / TEST_BANDS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Center Visual Radar */}
            <div className="relative flex items-center justify-center my-4">
              {stage === 'TESTING' && (
                <>
                  <div className={`absolute w-64 h-64 rounded-full animate-ping opacity-75 ${activeEar === 'LEFT' ? 'bg-blue-400/10' : 'bg-rose-400/10'}`} />
                  <div className={`absolute w-48 h-48 rounded-full animate-pulse ${activeEar === 'LEFT' ? 'bg-blue-500/20' : 'bg-rose-500/20'}`} />
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
                  : activeEar === 'LEFT'
                    ? 'bg-white dark:bg-slate-800 border-blue-500 text-slate-900 dark:text-white'
                    : 'bg-white dark:bg-slate-800 border-rose-500 text-slate-900 dark:text-white'}
              `}>
                {stage === 'BAND_CONFIRMED' ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 mb-1" />
                    <span className="text-xs font-bold uppercase tracking-wider">Detected!</span>
                  </>
                ) : (
                  <>
                    <Activity className={`w-6 h-6 mb-1 animate-pulse ${activeEar === 'LEFT' ? 'text-blue-500' : 'text-rose-500'}`} />
                    <span className="text-xl font-extrabold tracking-tight">
                      {TEST_BANDS[currentBandIndex]?.label}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      {activeEar} EAR
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
                  ? `Listen in your ${activeEar.toLowerCase()} ear. The tone will pulse and gently rise in volume.`
                  : 'Recording threshold...'}
              </p>
            </div>

            {/* Tactile Response Button */}
            <div className="w-full max-w-md pt-4 space-y-3">
              <button
                disabled={stage === 'BAND_CONFIRMED'}
                onClick={handleUserDetectedTone}
                className={`
                  w-full py-6 px-8 rounded-2xl font-bold text-xl shadow-xl transition-all duration-150
                  flex items-center justify-center gap-3 active:scale-95
                  ${stage === 'BAND_CONFIRMED'
                    ? 'bg-green-600 text-white opacity-90 cursor-default'
                    : activeEar === 'LEFT'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/30'}
                `}
              >
                <Volume2 className="w-6 h-6" />
                I Hear It Now!
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Tip: Press <kbd className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px]">Spacebar</kbd> on your keyboard.
              </p>
            </div>
          </div>
        )}

        {/* STAGE: EAR INTERMISSION (Between Left and Right Ear) */}
        {stage === 'EAR_INTERMISSION' && (
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold tracking-tight">Left Ear Calibrated!</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                All 5 frequencies for your left ear have been recorded. Next, we will calibrate your <strong>Right Ear</strong>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Next Step:
              </div>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold flex items-center justify-center text-xs">
                  R
                </span>
                <span className="text-sm font-semibold">Tones will now switch exclusively to your Right Ear</span>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full py-4 text-base font-semibold bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/20"
              onClick={startRightEarTest}
            >
              Continue to Right Ear <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* STAGE: RESULTS */}
        {stage === 'RESULTS' && (
          <div className="w-full space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-3.5 h-3.5" /> Binaural Calibration Complete
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Your Custom Binaural Profile</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Independent frequency gains calculated for your Left and Right ears:
              </p>
            </div>

            {/* Side-by-Side Dual Ear Results Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-5 text-xs font-bold text-slate-400 uppercase pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="col-span-1">Frequency</span>
                <span className="col-span-2 text-center text-blue-600 dark:text-blue-400 font-bold">Left Ear (L)</span>
                <span className="col-span-2 text-center text-rose-600 dark:text-rose-400 font-bold">Right Ear (R)</span>
              </div>

              {TEST_BANDS.map((band) => {
                const lRes = leftResults.find(r => r.frequency === band.freq);
                const rRes = rightResults.find(r => r.frequency === band.freq);

                return (
                  <div key={band.freq} className="grid grid-cols-5 items-center py-2 text-sm border-b border-slate-50 dark:border-slate-750 last:border-0">
                    <div className="col-span-1 font-semibold text-slate-900 dark:text-white">
                      {band.freq >= 1000 ? `${band.freq / 1000}k Hz` : `${band.freq} Hz`}
                    </div>
                    {/* Left Ear Values */}
                    <div className="col-span-2 flex items-center justify-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        {lRes?.lossClassification || 'Normal'}
                      </span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {(lRes?.recommendedGain || 0) > 0 ? `+${lRes?.recommendedGain}dB` : '0dB'}
                      </span>
                    </div>
                    {/* Right Ear Values */}
                    <div className="col-span-2 flex items-center justify-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                        {rRes?.lossClassification || 'Normal'}
                      </span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        {(rRes?.recommendedGain || 0) > 0 ? `+${rRes?.recommendedGain}dB` : '0dB'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Audio Protection Disclaimer */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary-500" />
                <span>Protected by Earvan's real-time stereo dynamics compressor limiter.</span>
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
                {isSaving ? 'Applying Binaural Profile...' : 'Save & Apply to Hearing Aid'}
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
