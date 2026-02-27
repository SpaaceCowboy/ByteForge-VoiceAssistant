
// --- Location ---

export interface Location {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  is_active: boolean;
  operating_hours: OperatingHours;
  created_at: Date;
  updated_at: Date;
}

export interface OperatingHours {
  monday: DayHours | null;
  tuesday: DayHours | null;
  wednesday: DayHours | null;
  thursday: DayHours | null;
  friday: DayHours | null;
  saturday: DayHours | null;
  sunday: DayHours | null;
}

export interface DayHours {
  open: string;  // "08:00"
  close: string; // "17:00"
}

// --- Department ---

export interface Department {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// --- Doctor ---

export interface Doctor {
  id: number;
  full_name: string;
  title: string | null;
  specialty: string;
  department_id: number | null;
  bio: string | null;
  is_accepting_new_patients: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  department_name?: string;
  location_names?: string[];
}

export interface DoctorWithSchedule extends Doctor {
  upcoming_appointments: Appointment[];
  locations: Location[];
}

// --- Patient ---

export interface Patient {
  id: number;
  phone: string;
  full_name: string | null;
  date_of_birth: string | null;
  email: string | null;
  address: string | null;
  insurance_provider: string | null;
  insurance_id: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_language: string;
  preferred_location_id: number | null;
  preferred_doctor_id: number | null;
  total_appointments: number;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PatientWithHistory extends Patient {
  appointments: Appointment[];
  recent_calls: CallLog[];
}

// --- Appointment ---

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

  export type AppointmentType =
  | 'consultation'
  | 'follow_up'
  | 'procedure'
  | 'imaging'
  | 'urgent_care'
  | 'pre_surgical'
  | 'post_surgical'
  | 'pain_management'
  | 'therapy';

export type AppointmentSource =
  | 'phone_ai'
  | 'phone_human'
  | 'website'
  | 'walk_in'
  | 'referral'
  | 'other';

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  department_id: number | null;
  location_id: number | null;
  appointment_date: string;       // YYYY-MM-DD
  appointment_time: string;       // HH:MM
  duration_minutes: number;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  reason_for_visit: string | null;
  special_instructions: string | null;
  is_new_patient: boolean;
  referral_required: boolean;
  referral_source: string | null;
  insurance_verified: boolean;
  source: AppointmentSource;
  confirmation_code: string;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  patient_name?: string;
  patient_phone?: string;
  doctor_name?: string;
  doctor_title?: string;
  department_name?: string;
  location_name?: string;
  insurance_provider?: string;
}

export interface AppointmentCreateInput {
  patientId: number;
  doctorId?: number;
  departmentId?: number;
  locationId?: number;
  date: string;
  time: string;
  durationMinutes?: number;
  appointmentType?: AppointmentType;
  reasonForVisit?: string;
  specialInstructions?: string;
  isNewPatient?: boolean;
  referralRequired?: boolean;
  referralSource?: string;
  source?: AppointmentSource;
}

export interface AppointmentModifyInput {
  date?: string;
  time?: string;
  doctorId?: number;
  departmentId?: number;
  locationId?: number;
  durationMinutes?: number;
  appointmentType?: AppointmentType;
  reasonForVisit?: string;
  specialInstructions?: string;
  status?: AppointmentStatus;
}

// --- Call Log ---

export interface CallLog {
  id: number;
  call_sid: string;
  patient_id: number | null;
  from_number: string;
  to_number: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  status: string;
  transcript: string | null;
  summary: string | null;
  intent: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  appointment_id: number | null;
  was_transferred: boolean;
  transfer_reason: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  patient_name?: string;
}

// --- FAQ ---

export interface FAQ {
  id: number;
  question_pattern: string;
  question_variations: string[];
  answer: string;
  answer_short: string | null;
  category: string;
  priority: number;
  is_active: boolean;
  times_used: number;
  created_at: Date;
  updated_at: Date;
}

export interface FAQCreateInput {
  questionPattern: string;
  questionVariations?: string[];
  answer: string;
  answerShort?: string;
  category: string;
  priority?: number;
}

// --- Dashboard User ---

export type DashboardUserRole = 'user' | 'moderator';

export interface DashboardUser {
  id: number;
  email: string;
  password_hash: string;
  full_name: string;
  role: DashboardUserRole;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardUserPublic {
  id: number;
  email: string;
  full_name: string;
  role: DashboardUserRole;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
}

// --- Conversation Session ---

export interface ConversationSession {
  id: number;
  call_sid: string;
  state: SessionState;
  message_history: Message[];
  collected_data: CollectedData;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// -------------------------------------------
// SESSION STATE (Redis)
// -------------------------------------------

export interface SessionState {
  currentStep: ConversationStep;
  confirmationPending: boolean;
  pendingAppointment: PendingAppointment | null;
  transferRequested: boolean;
  endRequested: boolean;
}

export type ConversationStep =
  | 'greeting'
  | 'listening'
  | 'collecting_info'
  | 'confirming'
  | 'processing'
  | 'ending';

export interface PendingAppointment {
  date?: string;
  time?: string;
  doctorId?: number;
  doctorName?: string;
  departmentId?: number;
  departmentName?: string;
  locationId?: number;
  locationName?: string;
  appointmentType?: AppointmentType;
  reasonForVisit?: string;
  specialInstructions?: string;
}

export interface CollectedData {
  patientName?: string;
  date?: string;
  time?: string;
  doctorName?: string;
  departmentName?: string;
  locationName?: string;
  appointmentType?: AppointmentType;
  reasonForVisit?: string;
  specialInstructions?: string;
  insuranceProvider?: string;
  insuranceId?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Session {
  callSid: string;
  patient: Patient | null;
  upcomingAppointments: Appointment[];
  state: SessionState;
  messageHistory: Message[];
  collectedData: CollectedData;
  createdAt: Date;
}

// -------------------------------------------
// SERVICE RESPONSES
// -------------------------------------------

export interface ConversationResponse {
  text: string;
  audio?: Buffer;
  shouldEnd: boolean;
  shouldTransfer: boolean;
  transferReason?: string;
}

export interface GreetingResponse {
  text: string;
  audio?: Buffer;
}

export interface OpenAIChatResponse {
  content: string | null;
  functionCall: FunctionCallResult | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

export interface FunctionCallResult {
  name: string;
  arguments: Record<string, unknown>;
  id: string;
}

export interface FunctionExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  shouldEnd?: boolean;
  shouldTransfer?: boolean;
  transferReason?: string;
}

// -------------------------------------------
// DEEPGRAM
// -------------------------------------------

export interface DeepgramCallbacks {
  onTranscript: (text: string, confidence: number) => void;
  onInterim?: (text: string) => void;
  onUtteranceEnd?: () => void;
  onError?: (error: Error) => void;
}

export interface DeepgramController {
  send: (audioData: Buffer) => void;
  close: () => void;
  isOpen: () => boolean;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  words: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  duration: number;
}

// -------------------------------------------
// TTS
// -------------------------------------------

export type TTSProvider = 'openai' | 'elevenlabs';

export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export type OpenAITTSModel = 'tts-1' | 'tts-1-hd';

// -------------------------------------------
// TWILIO
// -------------------------------------------

export interface TwilioVoiceRequest {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
  AccountSid: string;
  ApiVersion: string;
  SpeechResult?: string;
  Confidence?: string;
}

export interface TwilioStatusRequest {
  CallSid: string;
  CallStatus: string;
  CallDuration?: string;
  From: string;
  To: string;
}

export interface TwilioMediaStreamMessage {
  event: 'connected' | 'start' | 'media' | 'stop';
  start?: {
    callSid: string;
    streamSid: string;
    accountSid: string;
    tracks: string[];
    customParameters: Record<string, string>;
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string;
  };
}

// -------------------------------------------
// TOOLS (Function Calling)
// -------------------------------------------

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

export interface ToolContext {
  businessName: string;
  patientPhone: string;
  patientName: string | null;
  appointmentCount: number;
  currentDate: string;
  openingHour: string;
  closingHour: string;
  locations: string[];
  departments: string[];
}

// -------------------------------------------
// AVAILABILITY
// -------------------------------------------

export interface AvailabilityResult {
  available: boolean;
  currentBookings?: number;
  maxCapacity?: number;
  reason?: string;
  doctorName?: string;
  locationName?: string;
  alternativeSlots?: Array<{
    date: string;
    time: string;
    doctorName?: string;
    locationName?: string;
    available: boolean;
  }>;
}

// -------------------------------------------
// ANALYTICS
// -------------------------------------------

export interface CallStats {
  total_calls: string;
  completed_calls: string;
  avg_duration: string;
  transferred_calls: string;
  calls_with_errors: string;
}

export interface AppointmentStats {
  total: string;
  scheduled: string;
  confirmed: string;
  completed: string;
  cancelled: string;
  no_shows: string;
  from_ai: string;
}

export interface IntentBreakdown {
  intent: string;
  count: string;
  percentage: string;
}

export interface HourlyDistribution {
  hour: number;
  call_count: string;
}

// -------------------------------------------
// API RESPONSES
// -------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  count: number;
  offset?: number;
  limit?: number;
  total?: number;
}

// -------------------------------------------
// ENVIRONMENT VARIABLES
// -------------------------------------------

export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';

  // Database
  DATABASE_URL?: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;

  // Redis
  REDIS_URL: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;

  // Deepgram
  DEEPGRAM_API_KEY: string;

  // OpenAI
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;

  // TTS
  TTS_PROVIDER: TTSProvider;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  OPENAI_TTS_VOICE: OpenAIVoice;
  OPENAI_TTS_MODEL: OpenAITTSModel;

  // Business
  BUSINESS_NAME: string;
  BUSINESS_TIMEZONE: string;
  BUSINESS_OPENING_HOUR: string;
  BUSINESS_CLOSING_HOUR: string;
  MAX_APPOINTMENTS_PER_SLOT: number;
  DEFAULT_APPOINTMENT_DURATION: number;

  // JWT (Dashboard)
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;

  // Other
  TRANSFER_NUMBER?: string;
  CORS_ORIGIN: string;
}

// -------------------------------------------
// LOGGER
// -------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  callSid?: string;
  data?: unknown;
}