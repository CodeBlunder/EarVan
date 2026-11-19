import { HearingProfile, EnvironmentMode } from "../types";

export class AudioEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  
  // Nodes
  private micSource: MediaStreamAudioSourceNode | null = null;
  private testSource: AudioBufferSourceNode | null = null;
  private toneOsc: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  private preGainNode: GainNode | null = null;
  private gainNode: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private filters: BiquadFilterNode[] = [];
  
  // State
  private currentProfile: HearingProfile | null = null;
  private currentMode: EnvironmentMode = 'QUIET';
  private isEnabled: boolean = true;
  private isBypassed: boolean = false;
  private isTesting: boolean = false;
  private masterVolume: number = 1.0;
  private micSensitivity: number = 1.2;
  private selectedDeviceId: string | null = null;
  
  private readonly frequencies = [500, 1000, 2000, 4000, 8000];

  public async initialize(): Promise<void> {
    if (this.context) return; // Already initialized

    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Core Processing Chain Nodes
    this.preGainNode = this.context.createGain();
    this.preGainNode.gain.value = this.micSensitivity;
    this.gainNode = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.analyser = this.context.createAnalyser();

    // Compressor Defaults (Hearing Protection)
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 40;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0;
    this.compressor.release.value = 0.25;

    // Analyser Defaults
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;

    // Initialize Filter Bank (disconnected initially)
    this.filters = this.frequencies.map(freq => {
      const filter = this.context!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      return filter;
    });

    // Start with Mic
    await this.useMicrophone();
  }

  private async useMicrophone() {
    if (!this.context) return;
    
    // Stop test source if playing
    if (this.testSource) {
      try { this.testSource.stop(); } catch(e) {}
      this.testSource.disconnect();
      this.testSource = null;
    }

    try {
      const audioConstraints: any = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true, // Auto Gain Control helps capture distant speech
        latency: 0
      };

      if (this.selectedDeviceId) {
        audioConstraints.deviceId = { exact: this.selectedDeviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

      this.micSource = this.context.createMediaStreamSource(this.stream);
      this.connectChain(this.micSource);
    } catch (e) {
      console.error("Mic Error:", e);
    }
  }

  public startTestAudio() {
    if (!this.context) return;
    this.isTesting = true;

    // Disconnect Mic
    if (this.micSource) {
      this.micSource.disconnect();
    }

    // Create Pink Noise Buffer for testing EQ
    const bufferSize = 2 * this.context.sampleRate;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = buffer.getChannelData(0);
    
    // Pink noise generation
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; // Lower volume
        b6 = white * 0.115926;
    }

    this.testSource = this.context.createBufferSource();
    this.testSource.buffer = buffer;
    this.testSource.loop = true;
    
    this.connectChain(this.testSource);
    this.testSource.start();
  }

  public async stopTestAudio() {
    this.isTesting = false;
    if (this.testSource) {
      this.testSource.stop();
      this.testSource.disconnect();
      this.testSource = null;
    }
    // Revert to Mic
    await this.useMicrophone();
  }

  private connectChain(sourceNode: AudioNode) {
    if (!this.context) return;

    // Disconnect everything first to be safe
    sourceNode.disconnect();
    if (this.preGainNode) this.preGainNode.disconnect();
    this.filters.forEach(f => f.disconnect());
    this.compressor!.disconnect();
    this.gainNode!.disconnect();
    this.analyser!.disconnect();

    // 0. Pre-Gain Sensitivity Booster (for picking up distant room audio)
    if (this.preGainNode) {
      sourceNode.connect(this.preGainNode);
    }
    let currentNode: AudioNode = this.preGainNode || sourceNode;

    // 1. Filter Chain
    this.filters.forEach(filter => {
      currentNode.connect(filter);
      currentNode = filter;
    });

    // 2. Compressor
    currentNode.connect(this.compressor!);

    // 3. Master Gain
    this.compressor!.connect(this.gainNode!);

    // 4. Analyser
    this.gainNode!.connect(this.analyser!);

    // 5. Output
    this.analyser!.connect(this.context.destination);
  }

  public async setAudioInputDevice(deviceId: string): Promise<void> {
    this.selectedDeviceId = deviceId;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.context) {
      await this.useMicrophone();
    }
  }

  public getSelectedDeviceId(): string | null {
    return this.selectedDeviceId;
  }

  public async getAvailableInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch (e) {
      return [];
    }
  }

  public setMicSensitivity(gain: number) {
    this.micSensitivity = Math.max(0.5, Math.min(gain, 3.0));
    if (this.preGainNode && this.context) {
      this.preGainNode.gain.setTargetAtTime(this.micSensitivity, this.context.currentTime, 0.05);
    }
  }

  public setProfile(profile: HearingProfile) {
    this.currentProfile = profile;
    this.applySettings();
  }

  public setEnvironment(mode: EnvironmentMode) {
    this.currentMode = mode;
    this.applySettings();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.isBypassed = !enabled;

    if (!this.context || !this.gainNode) return;

    if (!enabled) {
      // Immediate, absolute silence to prevent any audio leakage or feedback
      try {
        this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.context.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.03);
      } catch (e) {}

      // Stop any test audio if it was running
      if (this.testSource) {
        try { this.testSource.stop(); } catch(e) {}
        this.testSource = null;
        this.isTesting = false;
      }
      this.stopTone();
    } else {
      // Restore user's configured master volume smoothly
      try {
        this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
        this.gainNode.gain.setValueAtTime(0, this.context.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(this.masterVolume, this.context.currentTime + 0.08);
      } catch (e) {}
      this.applySettings();
    }
  }

  public setBypass(bypass: boolean) {
    this.setEnabled(!bypass);
  }

  private applySettings() {
    if (!this.context || !this.currentProfile) return;

    // Base Gains from Profile
    const baseGains = { ...this.currentProfile.eqBands };

    // Apply Environment Offsets
    // This logic implements the specific hearing requirements
    if (!this.isBypassed) {
      switch (this.currentMode) {
        case 'CONVERSATION':
          // Boost Speech (1k-4k), Cut Rumbe (500), Cut Hiss (8k)
          // Helping user listen to only the person's audio in crowded area
          baseGains[500] -= 5; 
          baseGains[1000] += 4;
          baseGains[2000] += 6;
          baseGains[4000] += 4;
          baseGains[8000] -= 2;
          this.compressor!.threshold.value = -30; // Aggressive compression for consistent volume
          break;
        case 'NOISY':
          // Cut background noise aggressively
          baseGains[500] -= 10;
          baseGains[1000] += 2;
          baseGains[2000] += 5; // Focus on clarity
          baseGains[8000] -= 5; // Cut high pitch noise
          this.compressor!.threshold.value = -15; 
          break;
        case 'QUIET':
        default:
          // True to profile
          this.compressor!.threshold.value = -20;
          break;
      }
    }

    // Apply to nodes
    this.filters.forEach(filter => {
      const freq = filter.frequency.value as keyof HearingProfile['eqBands'];
      // If bypassed, gain is 0 (flat), otherwise Profile + Environment Mode
      const targetGain = this.isBypassed ? 0 : (baseGains[freq] || 0);
      filter.gain.setTargetAtTime(targetGain, this.context!.currentTime, 0.2);
    });
  }

  public setMasterVolume(value: number) {
    this.masterVolume = value;
    if (this.gainNode && this.context && this.isEnabled) {
      try {
        this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
        this.gainNode.gain.setTargetAtTime(value, this.context.currentTime, 0.05);
      } catch (e) {}
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public isRunning(): boolean {
    return !!this.context && this.context.state === 'running';
  }

  public async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    return this.context;
  }

  public async startTone(frequency: number, initialVolume: number = 0.005): Promise<void> {
    const ctx = await this.ensureContext();
    this.stopTone();

    // Temporarily disconnect mic so room noise isn't amplified during tone test
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (e) {}
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Smooth entry to prevent clicking
    const safeInitial = Math.max(initialVolume, 0.0001);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(safeInitial, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    this.toneOsc = osc;
    this.toneGain = gain;
  }

  public setToneVolume(volume: number): void {
    if (this.toneGain && this.context) {
      const safeVolume = Math.min(Math.max(volume, 0.0001), 0.6); // Safety cap
      this.toneGain.gain.setTargetAtTime(safeVolume, this.context.currentTime, 0.08);
    }
  }

  public stopTone(): void {
    if (this.toneGain && this.context) {
      try {
        this.toneGain.gain.setValueAtTime(this.toneGain.gain.value, this.context.currentTime);
        this.toneGain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.05);
      } catch (e) {}
    }
    if (this.toneOsc) {
      try {
        const osc = this.toneOsc;
        setTimeout(() => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e) {}
        }, 60);
      } catch (e) {}
      this.toneOsc = null;
    }
    this.toneGain = null;
  }

  public async restoreMic(): Promise<void> {
    this.stopTone();
    await this.useMicrophone();
  }

  public stop() {
    this.stopTone();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.testSource) {
      this.testSource.stop();
    }
    if (this.context) {
      this.context.close();
    }
    this.context = null;
  }
}

export const audioEngine = new AudioEngine();