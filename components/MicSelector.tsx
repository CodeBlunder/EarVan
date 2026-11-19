import React, { useState, useEffect } from 'react';
import { audioEngine } from '../services/audioEngine';
import { Mic, Settings2, Sliders, ChevronDown } from 'lucide-react';

export const MicSelector: React.FC = () => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [sensitivity, setSensitivity] = useState<number>(1.2);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const fetchDevices = async () => {
      const devList = await audioEngine.getAvailableInputDevices();
      setDevices(devList);
      const activeId = audioEngine.getSelectedDeviceId();
      if (activeId) {
        setSelectedId(activeId);
      } else if (devList.length > 0) {
        setSelectedId(devList[0].deviceId);
      }
    };

    fetchDevices();

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', fetchDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', fetchDevices);
    }
  }, []);

  const handleDeviceSelect = async (deviceId: string) => {
    setSelectedId(deviceId);
    await audioEngine.setAudioInputDevice(deviceId);
  };

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val);
    audioEngine.setMicSensitivity(val);
  };

  return (
    <div className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-750/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
            <Mic className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="font-bold text-sm text-slate-900 dark:text-white">
              Microphone Source & Sensitivity
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {devices.find(d => d.deviceId === selectedId)?.label || 'System Default Microphone'} • {Math.round(sensitivity * 100)}% Gain
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <Settings2 className="w-4 h-4" />
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-4">
          {/* Device Selection Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Input Device
            </label>
            <select
              value={selectedId}
              onChange={(e) => handleDeviceSelect(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              {devices.length === 0 && (
                <option value="">Default Internal Microphone</option>
              )}
              {devices.map((device, idx) => (
                <option key={device.deviceId || idx} value={device.deviceId}>
                  {device.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Tip: Select your laptop/phone's built-in microphone when placing it on a table facing another person.
            </p>
          </div>

          {/* Distant Voice Sensitivity Boost */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary-500" />
                Mic Sensitivity (Distant Speech)
              </span>
              <span className="font-mono font-bold text-primary-600 dark:text-primary-400">
                {Math.round(sensitivity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={sensitivity}
              onChange={(e) => handleSensitivityChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Close Mouth (Headset)</span>
              <span>Balanced</span>
              <span>Distant Person Across Table</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

