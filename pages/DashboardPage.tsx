import React, { useEffect, useRef, useState } from 'react';
import { User, HearingProfile, EnvironmentMode, normalizeProfile, BandGains } from '../types';
import { audioEngine } from '../services/audioEngine';
import { authService } from '../services/authService';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { MicSelector } from '../components/MicSelector';
import { 
  LogOut, Activity, Power, Mic, Waves, 
  MessageCircle, CloudRain, Zap, 
  Sliders, Ear, Volume2, Sparkles,
  Headphones, AlertTriangle, X, Scale
} from 'lucide-react';

interface DashboardPageProps {
  user: User;
  onLogout: () => void;
  onEditProfile: () => void;
  onRetestHearing?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ 
  user, 
  onLogout, 
  onEditProfile,
  onRetestHearing 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  
  // State
  const [isAssistOn, setIsAssistOn] = useState(true);
  const [mode, setMode] = useState<EnvironmentMode>('QUIET');
  const [volume, setVolume] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [disconnectAlert, setDisconnectAlert] = useState<string | null>(null);

  const normalizedProfile = normalizeProfile(user.profile);
  const [balance, setBalance] = useState<number>(normalizedProfile.balance ?? 0);

  useEffect(() => {
    const initAudio = async () => {
      if (!audioEngine.isRunning()) {
        try {
          await audioEngine.initialize();
        } catch (e) {
          console.error("Audio init error", e);
        }
      }
      
      audioEngine.setProfile(normalizedProfile);
      
      // Initial State Sync
      audioEngine.setEnvironment(mode);
      audioEngine.setEnabled(isAssistOn);
      setIsProcessing(true);
      startVisualizer();
    };

    initAudio();

    return () => {
      cancelAnimationFrame(animationRef.current);
      audioEngine.stop();
    };
  }, [user]);

  // Effect for Mode/Assist toggle changes
  useEffect(() => {
    audioEngine.setEnvironment(mode);
    audioEngine.setEnabled(isAssistOn);
  }, [mode, isAssistOn]);

  // Automatic Earphone Disconnect Guard
  useEffect(() => {
    const handleDeviceChange = async () => {
      if (isAssistOn) {
        audioEngine.setEnabled(false);
        setIsAssistOn(false);
        setDisconnectAlert(
          'Earphones or Bluetooth audio disconnected! Hearing Assist was automatically paused to prevent loud sounds through your device speakers.'
        );
      }
    };

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [isAssistOn]);

  const handleBalanceChange = (newBal: number) => {
    setBalance(newBal);
    audioEngine.setBalance(newBal);
    if (user.profile) {
      const updated = { ...user.profile, balance: newBal };
      authService.updateProfile(user.id, updated).catch(() => {});
    }
  };

  const startVisualizer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const analyser = audioEngine.getAnalyser();

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      const w = canvas.width;
      const h = canvas.height;
      const isDark = document.documentElement.classList.contains('dark');
      
      ctx.clearRect(0, 0, w, h);

      if (!analyser || !isAssistOn) {
        ctx.beginPath();
        ctx.moveTo(0, h/2);
        ctx.lineTo(w, h/2);
        ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1';
        ctx.stroke();
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      ctx.lineWidth = 3;
      ctx.strokeStyle = isAssistOn ? (isDark ? '#38bdf8' : '#0ea5e9') : '#94a3b8';
      ctx.beginPath();

      const sliceWidth = w * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * h / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(w, h / 2);
      ctx.stroke();
    };
    draw();
  };

  // Helper for mode appearance
  const getModeStyles = (m: EnvironmentMode) => {
    const isActive = mode === m;
    const base = "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border cursor-pointer select-none";
    
    if (isActive && isAssistOn) {
      return `${base} bg-primary-600 text-white border-primary-600 shadow-lg shadow-primary-500/30 scale-105`;
    }
    return `${base} bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-400 dark:hover:border-primary-500`;
  };

  // Generate dual-ear mini bar visualizer for the profile card
  const getProfileBars = () => {
    const frequencies: (keyof BandGains)[] = [500, 1000, 2000, 4000, 8000];
    const leftBands = normalizedProfile.leftEar;
    const rightBands = normalizedProfile.rightEar;
    
    return frequencies.map((f) => {
      const lVal = leftBands[f] || 0;
      const rVal = rightBands[f] || 0;
      const lHeight = Math.max(16, 20 + lVal * 2.2);
      const rHeight = Math.max(16, 20 + rVal * 2.2);
      
      return (
        <div key={f} className="flex items-end gap-0.5 group" title={`${f}Hz: Left ${lVal}dB | Right ${rVal}dB`}>
          {/* Left Ear Bar (Blue) */}
          <div className="w-1.5 bg-slate-200 dark:bg-slate-700 rounded-full h-12 flex items-end overflow-hidden">
            <div 
              style={{ height: `${(lHeight / 48) * 100}%` }} 
              className={`w-full rounded-full transition-all duration-500 ${lVal > 0 ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-600'}`}
            />
          </div>
          {/* Right Ear Bar (Rose) */}
          <div className="w-1.5 bg-slate-200 dark:bg-slate-700 rounded-full h-12 flex items-end overflow-hidden">
            <div 
              style={{ height: `${(rHeight / 48) * 100}%` }} 
              className={`w-full rounded-full transition-all duration-500 ${rVal > 0 ? 'bg-rose-500' : 'bg-slate-400 dark:bg-slate-600'}`}
            />
          </div>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors duration-300">
      
      {/* Navbar */}
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-slate-800 dark:text-white">Earvan</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button variant="outline" onClick={onLogout} className="h-9 px-3 text-sm">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Safety Alert: Earphones Disconnected */}
      {disconnectAlert && (
        <div className="bg-amber-500 text-white px-6 py-3 flex items-center justify-between text-sm font-medium shadow-md transition-all animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 animate-bounce" />
            <span>{disconnectAlert}</span>
          </div>
          <button 
            onClick={() => setDisconnectAlert(null)}
            className="p-1 hover:bg-amber-600 rounded-md transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center p-6 max-w-md mx-auto w-full gap-7">
        
        {/* 1. Big Power / Toggle Button */}
        <div className="flex flex-col items-center gap-4 mt-2">
          <div className="relative">
            {isAssistOn && (
              <div className="absolute inset-0 bg-green-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
            )}
            
            <button
              onClick={() => {
                if (disconnectAlert) setDisconnectAlert(null);
                setIsAssistOn(!isAssistOn);
              }}
              className={`
                relative w-32 h-32 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300
                ${isAssistOn 
                  ? 'bg-gradient-to-br from-green-500 to-green-600 text-white scale-110 ring-4 ring-green-500/20' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}
              `}
            >
              <Power className="w-10 h-10 mb-1" />
              <span className="text-xs font-bold tracking-widest uppercase">
                {isAssistOn ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
          <h2 className={`text-xl font-bold transition-colors ${isAssistOn ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
            {isAssistOn ? 'Binaural Assist Active' : 'Hearing Assist Paused'}
          </h2>
        </div>

        {/* 2. Environment Mode Selector */}
        <div className={`w-full space-y-3 transition-opacity duration-300 ${!isAssistOn ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Environment Mode</span>
            {isAssistOn && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                </span>
                Active Listening...
              </div>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={() => setMode('QUIET')} className={getModeStyles('QUIET')}>
              <CloudRain className="w-4 h-4" /> Quiet
            </button>
            <button onClick={() => setMode('CONVERSATION')} className={getModeStyles('CONVERSATION')}>
              <MessageCircle className="w-4 h-4" /> Conversation
            </button>
            <button onClick={() => setMode('NOISY')} className={getModeStyles('NOISY')}>
              <Zap className="w-4 h-4" /> Traffic/Noisy
            </button>
          </div>
        </div>

        {/* 3. Amplification & Stereo Balance Card */}
        <div className={`w-full bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4 transition-opacity duration-300 ${!isAssistOn ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {/* Master Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-primary-500" /> Master Amplification
              </span>
              <span className="text-xs font-mono font-bold text-primary-600 dark:text-primary-400">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.05"
              value={volume}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVolume(val);
                audioEngine.setMasterVolume(val);
              }}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
          </div>

          {/* Quick Stereo Balance */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary-500" /> Stereo Balance
              </span>
              <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                {balance === 0 ? 'Center' : balance < 0 ? `L ${Math.abs(Math.round(balance * 100))}%` : `R ${Math.round(balance * 100)}%`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-600 uppercase">L</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={balance}
                onChange={(e) => handleBalanceChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <span className="text-[10px] font-bold text-rose-600 uppercase">R</span>
            </div>
          </div>
        </div>

        {/* 4. Real-time Waveform Visualizer */}
        <div className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 h-24 relative overflow-hidden">
           <canvas ref={canvasRef} width={400} height={100} className="w-full h-full" />
           {!isAssistOn && (
             <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 backdrop-blur-[1px]">
               <span className="text-sm font-medium text-slate-400">Processing Paused</span>
             </div>
           )}
        </div>

        {/* 5. Microphone Input Source & Sensitivity */}
        <MicSelector />

        {/* 6. Binaural Profile Summary Card */}
        <div className="w-full bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
             <Ear className="w-16 h-16 text-slate-900 dark:text-white" />
           </div>
           
           <div className="relative z-10">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Binaural Profile</h3>
                   <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> L
                   </span>
                   <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                     <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> R
                   </span>
                 </div>
                 <p className="text-lg font-bold text-slate-900 dark:text-white">Active Hearing Curves</p>
                 <p className="text-xs text-slate-500">Dual 5-band calibrated channels</p>
               </div>
               <div className="flex items-end gap-1.5 h-12 pb-1">
                 {getProfileBars()}
               </div>
             </div>
             
             <div className="grid grid-cols-2 gap-3 mt-4">
                <Button 
                  variant="outline" 
                  onClick={onRetestHearing} 
                  className="text-xs h-10 border-primary-500/40 text-primary-600 dark:text-primary-400 font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Retest Both Ears
                </Button>
                <Button variant="outline" onClick={onEditProfile} className="text-xs h-10">
                  <Sliders className="w-3.5 h-3.5 mr-1.5" /> Fine-tune EQ
                </Button>
             </div>
           </div>
        </div>

      </main>
    </div>
  );
};
