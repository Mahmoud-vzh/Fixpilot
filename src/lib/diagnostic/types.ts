export type Hypothesis = {
  cause: string;
  probability: number;
  change: 'up' | 'down' | 'same' | 'ruled_out';
  supporting_evidence: string[];
  contradicting_evidence: string[];
};
export type DiagnosticTest = {
  id: string;
  name: string;
  purpose: string;
  difficulty: string;
  estimated_time: string;
  required_tools: string[];
  safety: string;
  instructions: string[];
  outcomes: string[];
};
export type DiagnosticState = {
  device: string;
  category: string;
  problem_summary: string;
  confirmed_symptoms: string[];
  unknowns: string[];
  hypotheses: Hypothesis[];
  tests_completed: { name: string; result: string }[];
  next_test: DiagnosticTest | null;
  diagnosis_confidence: number;
  status: 'investigating' | 'diagnosed' | 'safety_stop';
  assistant_message: string;
  safety_warning: string;
  repair_plan: string[];
  verification: string;
  cost: string;
  image_observations: string[];
  image_interpretations: string[];
  timeline: string[];
};
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  image?: string;
  created_at: string;
};
export type Session = {
  title?: string;
  persisted?: boolean;
  resolved_at?: string;
  id: string;
  mode: 'demo' | 'live';
  scenario: string;
  state: DiagnosticState;
  messages: Message[];
  updated_at: string;
  revision: number;
};
export const blankState = (): DiagnosticState => ({
  device: 'Not identified',
  category: 'General',
  problem_summary: 'New diagnosis',
  confirmed_symptoms: [],
  unknowns: [],
  hypotheses: [],
  tests_completed: [],
  next_test: null,
  diagnosis_confidence: 0,
  status: 'investigating',
  assistant_message:
    'What are you having trouble with? Tell me the device, what happens, and anything that changed recently.',
  safety_warning: '',
  repair_plan: [],
  verification: '',
  cost: 'Not estimated',
  image_observations: [],
  image_interpretations: [],
  timeline: [],
});
