import React, { useState, useEffect, useRef } from 'react';
import { HearingProfile, User } from '../types';
import { Button } from '../components/Button';
import { audioEngine } from '../services/audioEngine';
import { authService } from '../services/authService';
import { ThemeToggle } from '../components/ThemeToggle';
import { Play, Sliders, CheckCircle2, Volume2 } from 'lucide-react';

interface SetupProfilePageProps {
  user: User;
  onComplete: () => void;
}

const DEFAULT_PROFILE: HearingProfile = {
  eqBands: { 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0 }
};

export const SetupProfilePage: React.FC<SetupProfilePageProps> = ({ user, onComplete }) => {
  const [mode, setMode] = useState<'SELECT' | 'CUSTOMIZE'>('SELECT');
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<HearingProfile>(DEFAULT_PROFILE);
  
  // Ref to track if we mounted audio
  const audioInitialized = useRef(false);

  useEffect(() => {
    return () => {
      // Cleanup audio when leaving page if we started it here
      audioEngine.stop();
    };
  }, []);

  const handleQuickStart = async () => {
    setIsSaving(true);
    try {
      await authService.updateProfile(user.id, DEFAULT_PROFILE);
      onComplete();
    } catch (e) {
      console.error(e);
    }
  };

  const startCustomization = async () => {
    try {
      await audioEngine.initialize();
      // Start with default profile
      audioEngine.setProfile(DEFAULT_PROFILE);
      audioEngine.setMasterVolume(1.0);
      setIsAudioActive(true);
      audioInitialized.current = true;
      setMode('CUSTOMIZE');
    } catch (err) {
      console.error("Failed to start audio engine", err);
      alert("Could not start audio. Please ensure permissions are granted.");
    }
  };

  const handleSliderChange = (freq: keyof HearingProfile['eqBands'], value: number) => {
    const newProfile = {
      ...profile,
      eqBands: {
        ...profile.eqBands,
        [freq]: value
      }
    };
    setProfile(newProfile);
    
    // Real-time update
    if (isAudioActive) {
      audioEngine.setProfile(newProfile);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await authService.updateProfile(user.id, profile);
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
              We can use a standard enhancement profile or you can customize the audio to match your specific hearing needs.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Quick Start Card */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl hover:shadow-2xl transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100 dark:bg-primary-900 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
              
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 fill-current" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Quick Start</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 h-12">
                Use our balanced profile optimized for general conversation and clarity.
              </p>
              <Button onClick={handleQuickStart} fullWidth isLoading={isSaving}>
                Use Default Profile
              </Button>
            </div>

            {/* Customize Card */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl hover:shadow-2xl transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-100 dark:bg-secondary-900 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>

              <div className="w-16 h-16 bg-secondary-100 dark:bg-secondary-900/30 text-secondary-600 dark:text-secondary-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sliders className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Customize</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 h-12">
                Fine-tune specific frequencies while listening to real-time audio feedback.
              </p>
              <Button variant="secondary" onClick={startCustomization} fullWidth>
                Start Customization
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Customization UI
  const bands = [
    { freq: 500, label: "Warmth & Body", desc: "Low frequencies, fullness" },
    { freq: 1000, label: "Speech Core", desc: "Vowels, main energy" },
    { freq: 2000, label: "Clarity", desc: "Consonants clarity" },
    { freq: 4000, label: "Presence", desc: "Definition, closeness" },
    { freq: 8000, label: "Detail & Air", desc: "High details, crispness" },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col transition-colors duration-300">
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 p-4 sticky top-0 z-10 shadow-sm transition-colors duration-300">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
            Live Tuning
          </h2>
          <div className="flex items-center gap-4">
             <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full flex items-center gap-1 animate-pulse">
               <div className="w-2 h-2 bg-green-500 rounded-full"></div>
               Audio Active
             </div>
             <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="mb-8 text-center">
          <p className="text-slate-600 dark:text-slate-300">
            Adjust the sliders below. Listen to your surroundings or your own voice as you move them.
          </p>
        </div>

        <div className="space-y-6">
          {bands.map((band) => (
            <div key={band.freq} className="bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 transition-colors duration-300">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-lg">{band.label}</h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium tracking-wide uppercase">{band.freq} Hz • {band.desc}</p>
                </div>
                <div className="text-secondary-600 dark:text-secondary-400 font-mono font-bold">
                  {profile.eqBands[band.freq as keyof HearingProfile['eqBands']] > 0 ? '+' : ''}
                  {profile.eqBands[band.freq as keyof HearingProfile['eqBands']]} dB
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold text-slate-400 uppercase w-16 text-right">Hear Less</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={profile.eqBands[band.freq as keyof HearingProfile['eqBands']]}
                  onChange={(e) => handleSliderChange(band.freq as any, Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-secondary-600"
                />
                <span className="text-xs font-semibold text-slate-400 uppercase w-16">Hear More</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 sticky bottom-0 transition-colors duration-300">
        <div className="max-w-3xl mx-auto">
          <Button onClick={handleSaveProfile} fullWidth isLoading={isSaving} className="text-lg py-4">
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Save Profile & Finish
          </Button>
        </div>
      </div>
    </div>
  );
};