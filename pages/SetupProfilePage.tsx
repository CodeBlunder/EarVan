import React, { useState, useEffect, useRef } from 'react';
import { HearingProfile, User, BandGains, normalizeProfile, DEFAULT_BINAURAL_PROFILE } from '../types';
import { Button } from '../components/Button';
import { audioEngine } from '../services/audioEngine';
import { authService } from '../services/authService';
import { ThemeToggle } from '../components/ThemeToggle';
import { 
  Play, Sliders, CheckCircle2, Volume2, Sparkles, Ear, 
  Link2, Unlink2, Headphones, Scale
} from 'lucide-react';

interface SetupProfilePageProps {
  user: User;
  onComplete: () => void;
  onStartHearingTest?: () => void;
  initialProfile?: HearingProfile;
}

type EarTab = 'BOTH' | 'LEFT' | 'RIGHT';

const FREQUENCY_BANDS: { freq: keyof BandGains; label: string; desc: string }[] = [
  { freq: 500, label: "Warmth & Body", desc: "Low bass, environmental fullness" },
  { freq: 1000, label: "Speech Core", desc: "Vowels, main human voice energy" },
  { freq: 2000, label: "Speech Clarity", desc: "Consonant crispness & separation" },
  { freq: 4000, label: "Presence", desc: "Definition, closeness (s, th, f sounds)" },
  { freq: 8000, label: "Air & Treble", desc: "High details, brilliance, high pitch" },
];

export const SetupProfilePage: React.FC<SetupProfilePageProps> = ({ 
  user, 
  onComplete,
  onStartHearingTest,
  initialProfile
}) => {
  const [mode, setMode] = useState<'SELECT' | 'CUSTOMIZE'>(initialProfile ? 'CUSTOMIZE' : 'SELECT');
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Normalized binaural profile state
  const [profile, setProfile] = useState<HearingProfile>(() => {
    return normalizeProfile(initialProfile || user.profile || DEFAULT_BINAURAL_PROFILE);
  });

  const [activeTab, setActiveTab] = useState<EarTab>('BOTH');
  const [isLinked, setIsLinked] = useState<boolean>(profile.isLinked ?? true);
  const [balance, setBalance] = useState<number>(profile.balance ?? 0);

  const audioInitialized = useRef(false);

  useEffect(() => {
    return () => {
      audioEngine.stop();
    };
  }, []);

  const handleQuickStart = async () => {
    setIsSaving(true);
    try {
      await authService.updateProfile(user.id, DEFAULT_BINAURAL_PROFILE);
      audioEngine.setProfile(DEFAULT_BINAURAL_PROFILE);
      onComplete();
    } catch (e) {
      console.error(e);
      setIsSaving(false);
    }
  };

  const startCustomization = async () => {
    try {
      await audioEngine.initialize();
      audioEngine.setProfile(profile);
      audioEngine.setMasterVolume(1.0);
      setIsAudioActive(true);
      audioInitialized.current = true;
      setMode('CUSTOMIZE');
    } catch (err) {
      console.error("Failed to start audio engine", err);
      alert("Could not start audio. Please ensure microphone permissions are granted.");
    }
  };

  const handleSliderChange = (freq: keyof BandGains, value: number, targetEar: 'LEFT' | 'RIGHT' | 'BOTH') => {
    const updatedLeft = { ...profile.leftEar };
    const updatedRight = { ...profile.rightEar };

    if (targetEar === 'BOTH' || isLinked) {
      updatedLeft[freq] = value;
      updatedRight[freq] = value;
    } else if (targetEar === 'LEFT') {
      updatedLeft[freq] = value;
    } else if (targetEar === 'RIGHT') {
      updatedRight[freq] = value;
    }

    const newProfile: HearingProfile = {
      ...profile,
      leftEar: updatedLeft,
      rightEar: updatedRight,
      eqBands: { ...updatedLeft },
      balance,
      isLinked
    };

    setProfile(newProfile);

    // Immediate real-time audio update in headphones
    if (isAudioActive) {
      audioEngine.setProfile(newProfile);
    }
  };

  const handleBalanceChange = (newBalance: number) => {
    setBalance(newBalance);
    const newProfile: HearingProfile = {
      ...profile,
      balance: newBalance,
      isLinked
    };
    setProfile(newProfile);
    if (isAudioActive) {
      audioEngine.setProfile(newProfile);
    }
  };

  const toggleLinked = () => {
    const nextLinked = !isLinked;
    setIsLinked(nextLinked);
    if (nextLinked) {
      // Sync right ear to match left ear when re-linking
      const syncedProfile: HearingProfile = {
        ...profile,
        rightEar: { ...profile.leftEar },
        isLinked: true
      };
      setProfile(syncedProfile);
      if (isAudioActive) audioEngine.setProfile(syncedProfile);
    } else {
      setProfile(prev => ({ ...prev, isLinked: false }));
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const finalProfile: HearingProfile = {
        ...profile,
        balance,
        isLinked
      };
      await authService.updateProfile(user.id, finalProfile);
      audioEngine.setProfile(finalProfile);
      onComplete();
    } catch (e) {
      console.error(e);
      setIsSaving(false);
    }
  };

  if (mode === 'SELECT') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6 transition-colors duration-300">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Set Up Your Hearing Profile</h1>
            <p className="text-slate-600 dark:text-slate-300 text-xl max-w-2xl mx-auto">
              Earvan supports independent <strong>Left & Right ear compensation</strong> for tailored hearing assistance.
            </p>
          </div>

          <div className="space-y-6">
            {/* Interactive Hearing Test Card - Recommended */}
            <div className="bg-gradient-to-r from-primary-500/10 via-sky-500/5 to-transparent dark:from-primary-950/40 dark:via-slate-800 dark:to-slate-800 bg-white dark:bg-slate-800 p-8 rounded-3xl border-2 border-primary-500/40 dark:border-primary-500/30 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary-600 text-white shadow-sm">
                  <Sparkles className="w-3.5 h-3.5" /> Recommended
                </span>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 bg-primary-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/30">
                    <Ear className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                      Binaural Hearing Test
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 max-w-xl text-sm leading-relaxed">
                      Take our 2-minute pure-tone test. Earvan measures your Left and Right ear sensitivity separately to build an accurate binaural profile.
                    </p>
                  </div>
                </div>

                <div className="md:shrink-0">
                  <Button 
                    onClick={onStartHearingTest || startCustomization} 
                    size="lg"
                    className="w-full md:w-auto font-bold px-8 shadow-lg shadow-primary-500/20"
                  >
                    Start Hearing Test
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Quick Start Card */}
              <div className="bg-white dark:bg-slate-800 p-7 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all group relative overflow-hidden">
                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <Play className="w-7 h-7 fill-current" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Quick Start</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                  Use our standard balanced profile optimized for everyday speech and balanced across both ears.
                </p>
                <Button variant="outline" onClick={handleQuickStart} fullWidth isLoading={isSaving}>
                  Use Default Profile
                </Button>
              </div>

              {/* Customize Card */}
              <div className="bg-white dark:bg-slate-800 p-7 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all group relative overflow-hidden">
                <div className="w-14 h-14 bg-secondary-100 dark:bg-secondary-900/30 text-secondary-600 dark:text-secondary-400 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <Sliders className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Manual Tuning</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                  Manually adjust Left & Right ear frequency bands and stereo balance with live audio feedback.
                </p>
                <Button variant="secondary" onClick={startCustomization} fullWidth>
                  Open Binaural Sliders
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CUSTOMIZE MODE (LIVE BINAURAL TUNING)
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
      {/* Sticky Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-10 shadow-sm transition-colors duration-300">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-xl">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">
                Live Binaural Tuning
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Left & Right ear frequency calibration
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
               <div className="w-2 h-2 bg-green-500 rounded-full"></div>
               Live Audio Feedback
             </div>
             <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Ear Navigation Tabs & Link Toggle */}
        <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('BOTH')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'BOTH'
                  ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              Both Ears
            </button>
            <button
              onClick={() => setActiveTab('LEFT')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'LEFT'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-600 dark:text-blue-400 hover:text-blue-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-400"></span> Left Ear (L)
            </button>
            <button
              onClick={() => setActiveTab('RIGHT')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'RIGHT'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-600 dark:text-rose-400 hover:text-rose-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span> Right Ear (R)
            </button>
          </div>

          {/* Link / Unlink Toggle */}
          <button
            onClick={toggleLinked}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              isLinked
                ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300'
                : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
            }`}
            title="When linked, sliders update both ears simultaneously"
          >
            {isLinked ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
            {isLinked ? 'Linked (Both Move)' : 'Independent Ears'}
          </button>
        </div>

        {/* Stereo Balance Slider Card */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-primary-500" />
              Earphone Stereo Balance
            </span>
            <span className="font-mono font-bold text-primary-600 dark:text-primary-400">
              {balance === 0 ? 'Center (0%)' : balance < 0 ? `Left ${Math.abs(Math.round(balance * 100))}%` : `Right ${Math.round(balance * 100)}%`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase w-12 text-left">Left</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={balance}
              onChange={(e) => handleBalanceChange(Number(e.target.value))}
              className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase w-12 text-right">Right</span>
          </div>
        </div>

        {/* Frequency Sliders */}
        <div className="space-y-4">
          {FREQUENCY_BANDS.map((band) => {
            const leftVal = profile.leftEar[band.freq] ?? 0;
            const rightVal = profile.rightEar[band.freq] ?? 0;

            return (
              <div 
                key={band.freq} 
                className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-base leading-tight">
                      {band.label}
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      {band.freq >= 1000 ? `${band.freq / 1000} kHz` : `${band.freq} Hz`} • {band.desc}
                    </p>
                  </div>

                  {/* Badges showing current values */}
                  <div className="flex items-center gap-2 font-mono text-xs font-bold">
                    {(activeTab === 'BOTH' || activeTab === 'LEFT') && (
                      <span className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        L: {leftVal > 0 ? `+${leftVal}` : leftVal} dB
                      </span>
                    )}
                    {(activeTab === 'BOTH' || activeTab === 'RIGHT') && (
                      <span className="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        R: {rightVal > 0 ? `+${rightVal}` : rightVal} dB
                      </span>
                    )}
                  </div>
                </div>

                {/* Slider: Both or Left Ear */}
                {(activeTab === 'BOTH' || activeTab === 'LEFT') && (
                  <div className="space-y-1">
                    {activeTab === 'BOTH' && !isLinked && (
                      <span className="text-[10px] font-bold text-blue-600 uppercase">Left Ear</span>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-slate-400 w-12 text-right">-12dB</span>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="1"
                        value={leftVal}
                        onChange={(e) => handleSliderChange(band.freq, Number(e.target.value), activeTab === 'BOTH' ? 'BOTH' : 'LEFT')}
                        className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span className="text-[11px] font-semibold text-slate-400 w-12 text-left">+12dB</span>
                    </div>
                  </div>
                )}

                {/* Slider: Right Ear (only if Independent/Both, or Right Tab) */}
                {((activeTab === 'BOTH' && !isLinked) || activeTab === 'RIGHT') && (
                  <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                    <span className="text-[10px] font-bold text-rose-600 uppercase">Right Ear</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-slate-400 w-12 text-right">-12dB</span>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="1"
                        value={rightVal}
                        onChange={(e) => handleSliderChange(band.freq, Number(e.target.value), 'RIGHT')}
                        className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-600"
                      />
                      <span className="text-[11px] font-semibold text-slate-400 w-12 text-left">+12dB</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky bottom-0 transition-colors duration-300">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Button 
            variant="outline" 
            onClick={() => setMode('SELECT')}
          >
            Back
          </Button>
          <Button 
            onClick={handleSaveProfile} 
            isLoading={isSaving} 
            className="flex-1 text-base py-3 font-semibold shadow-md shadow-primary-500/20"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Save Binaural Profile
          </Button>
        </div>
      </div>
    </div>
  );
};
