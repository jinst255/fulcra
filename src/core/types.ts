// Data model. Blueprint section 12.2 (v1.1).

export type Source = 'page' | 'email' | 'paste';
export type JobStatus = 'open' | 'closed' | 'unknown';
export type ScoreState = 'current' | 'pending' | 'outdated' | 'preliminary';
export type PayPeriod = 'hour' | 'week' | 'month' | 'year' | 'total' | 'unknown';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';
export type Remote = 'yes' | 'no' | 'hybrid' | 'unknown';
export type JobType = 'full_time' | 'part_time' | 'internship' | 'seasonal' | 'contract' | 'unknown';
export type ProfileId = 'money' | 'balanced' | 'future' | 'good' | 'life' | 'custom';
export type LanguageLevel = 'native' | 'fluent' | 'conversational';
export type ModelChoice = 'standard' | 'sharper';

export interface Pay {
  min: number | null;
  max: number | null;
  period: PayPeriod;
  currency: string;
  is_estimate: boolean;
}

/** Facts extracted by the model (section 5.8). */
export interface Facts {
  title: string;
  company: string | null;
  location: string | null;
  remote: Remote;
  pay: Pay;
  hours_per_week: number | null;
  duration_weeks: number | null;
  job_type: JobType;
  commission_or_variable: YesNoUnknown;
  relocation_required: YesNoUnknown;
  languages_required: string[];
  status: JobStatus;
}

export interface DimScore {
  score: number;
  reason: string;
  dimVersion: number;
  state: ScoreState;
  override: number | null;
}

/** Why a job has no usable scores yet. */
export type ScoringState = 'scored' | 'notScored' | 'queued' | 'failed';

export interface JobRecord {
  id: string;
  dedupeKey: string;
  source: Source;
  sourceUrl: string | null;
  siteJobId: string | null;
  listingText: string;
  facts: Facts;
  payUnitCorrection: { from: PayPeriod; to: PayPeriod; reason: string } | null;
  scores: Record<string, DimScore>;
  status: JobStatus;
  addedAt: number;
  updatedAt: number;
  lastSeenAt: number;
  flags: string[];
  /** True while the job has only been scored from an alert email snippet. */
  preliminary: boolean;
  scoring: ScoringState;
  /** Error code from section 7 when scoring failed, for the job row. */
  scoreError: string | null;
  /** Known costs such as relocation, subtracted from take-home (section 5.5). */
  knownCosts: number;
  /** Last validated model output, shown only with the developer setting on. */
  rawOutput: string | null;
  /** True when the job came from "Load sample data". */
  sample?: boolean;
}

export interface Dimension {
  id: string;
  name: string;
  definition: string;
  anchorLow: string;
  anchorHigh: string;
  version: number;
  active: boolean;
  color: string;
  computedByApp: boolean;
}

export interface Language {
  name: string;
  level: LanguageLevel;
}

export interface About {
  targetWork: string;
  enjoys: string;
  homeBase: string;
  communityImportance: 'very' | 'somewhat' | 'not';
  remote: 'yes' | 'maybe' | 'no';
  relocate: 'yes' | 'maybe' | 'no';
  languages: Language[];
  windowWeeks: number;
  payGoal: number | null;
}

export interface Dealbreakers {
  minTakeHome: number | null;
  maxHours: number | null;
  mustRemote: boolean;
  noRelocation: boolean;
  languageGap: boolean;
}

export interface EmailSettings {
  provider: 'gmail' | 'outlook' | null;
  intervalMinutes: number;
  senders: string[];
  lastCheck: { at: number; result: string; count: number | null } | null;
  /** When a check last finished without a problem; the next check looks back to here. */
  lastOkAt: number | null;
  accountIndex: number;
  /** Days of past alerts to import; null means everything. */
  importDays: number | null;
}

export interface Settings {
  model: ModelChoice;
  weights: Record<string, number>;
  profileId: ProfileId;
  dimensions: Dimension[];
  about: About;
  dealbreakers: Dealbreakers;
  email: EmailSettings;
  scoring: {
    autoScore: boolean;
    upgradeOnVisit: boolean;
    notify: boolean;
    notifyThreshold: number;
    /** Stretch each dimension's model scores so your best job on it is 10 and your worst is 1. */
    spread: boolean;
  };
  ui: {
    showOutsideDealbreakers: boolean | null;
    baselineOrder: string[];
    lastOpenedAt: number;
    setupSkipped: boolean;
    learnSuppressed: Record<string, number>;
    /** Jobs per page in the ranked list; 0 shows all. */
    pageSize: number;
    /** Light, dark, or follow the system. */
    theme: 'system' | 'light' | 'dark';
    /** Job types shown in the ranked list and radar; empty shows every type. */
    jobTypes: JobType[];
  };
  retentionDays: number | null;
  developerMode: boolean;
  verboseLog: boolean;
  showRawOutput: boolean;
}

export interface OverrideEntry {
  id?: number;
  jobId: string;
  dimensionId: string;
  modelScore: number;
  userScore: number;
  at: number;
}

export interface LogEntry {
  id?: number;
  at: number;
  code: string;
  surface: 'background' | 'popup' | 'app' | 'content';
  detail: string;
}
