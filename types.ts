export interface BandGains {
  500: number;
  1000: number;
  2000: number;
  4000: number;
  8000: number;
}

export interface HearingProfile {
  // Legacy single eqBands kept for backward compatibility
  eqBands?: BandGains;
  // Binaural independent EQ bands
  leftEar: BandGains;
  rightEar: BandGains;
  balance?: number; // -1.0 (100% Left) to +1.0 (100% Right), 0 is center
  isLinked?: boolean; // Whether left & right sliders move together in UI
}

export const DEFAULT_BAND_GAINS: BandGains = {
  500: 0,
  1000: 0,
  2000: 0,
  4000: 0,
  8000: 0
};

export const DEFAULT_BINAURAL_PROFILE: HearingProfile = {
  leftEar: { ...DEFAULT_BAND_GAINS },
  rightEar: { ...DEFAULT_BAND_GAINS },
  balance: 0,
  isLinked: true
};

export function normalizeProfile(profile?: HearingProfile | null): HearingProfile {
  if (!profile) return { ...DEFAULT_BINAURAL_PROFILE };
  const fallback = profile.eqBands || DEFAULT_BAND_GAINS;
  return {
    eqBands: profile.eqBands ? { ...profile.eqBands } : { ...fallback },
    leftEar: profile.leftEar ? { ...profile.leftEar } : { ...fallback },
    rightEar: profile.rightEar ? { ...profile.rightEar } : { ...fallback },
    balance: typeof profile.balance === 'number' ? profile.balance : 0,
    isLinked: profile.isLinked !== undefined ? profile.isLinked : true
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  password?: string;
  profile?: HearingProfile;
}

export type AuthMode = 'LOGIN' | 'SIGNUP';

export type AppView = 'AUTH' | 'SPLASH' | 'PERMISSIONS' | 'SETUP_PROFILE' | 'HOME' | 'HEARING_TEST';

export interface HearingTestResult {
  ear?: 'LEFT' | 'RIGHT';
  frequency: number;
  thresholdGain: number;
  lossClassification: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  recommendedGain: number;
}

export type EnvironmentMode = 'QUIET' | 'CONVERSATION' | 'NOISY';

export interface DatabaseSchema {
  users: User[];
}
