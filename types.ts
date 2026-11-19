export interface HearingProfile {
  eqBands: {
    500: number;
    1000: number;
    2000: number;
    4000: number;
    8000: number;
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
  frequency: number;
  thresholdGain: number;
  lossClassification: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  recommendedGain: number;
}

export type EnvironmentMode = 'QUIET' | 'CONVERSATION' | 'NOISY';

export interface DatabaseSchema {
  users: User[];
}