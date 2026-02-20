/**
 * ===========================================
 * TYPE DEFINITIONS
 * ===========================================
 * 
 * Central type definitions for the entire application.
 * Provides type safety and IntelliSense support.
 */

// -------------------------------------------
// DATABASE MODELS
// -------------------------------------------

export interface Customer {
    id: number;
    phone: string;
    full_name: string | null;
    email: string | null;
    preferred_language: string;
    total_reservations: number;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }
  
  export interface CustomerWithHistory extends Customer {
    reservations: Reservation[];
    recent_calls: CallLog[];
  }
  
  export type ReservationStatus = 
    | 'pending' 
    | 'confirmed' 
    | 'cancelled' 
    | 'completed' 
    | 'no-show';
  
  export type ReservationSource = 'phone_ai' | 'phone_human' | 'website' | 'walk_in' | 'other';
  
  export interface Reservation {
    id: number;
    customer_id: number;
    reservation_date: string; // YYYY-MM-DD
    reservation_time: string; // HH:MM
    party_size: number;
    status: ReservationStatus;
    special_requests: string | null;
    table_number: string | null;
    source: ReservationSource;
    confirmation_code: string;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
    created_at: Date;
    updated_at: Date;
    // Joined fields
    customer_name?: string;
    phone?: string;
  }
  
  export interface ReservationCreateInput {
    customerId: number;
    date: string;
    time: string;
    partySize: number;
    specialRequests?: string;
    source?: ReservationSource;
  }
  
  export interface ReservationModifyInput {
    date?: string;
    time?: string;
    partySize?: number;
    specialRequests?: string;
    status?: ReservationStatus;
    tableNumber?: string;
  }
  
  export interface CallLog {
    id: number;
    call_sid: string;
    customer_id: number | null;
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
    reservation_id: number | null;
    was_transferred: boolean;
    transfer_reason: string | null;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
    // Joined fields
    customer_name?: string;
  }
  
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
    pendingReservation: PendingReservation | null;
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
  
  export interface PendingReservation {
    date?: string;
    time?: string;
    partySize?: number;
    specialRequests?: string;
  }
  
  export interface CollectedData {
    customerName?: string;
    date?: string;
    time?: string;
    partySize?: number;
    specialRequests?: string;
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
    customer: Customer | null;
    upcomingReservations: Reservation[];
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
    customerPhone: string;
    customerName: string | null;
    reservationCount: number;
    currentDate: string;
    openingHour: string;
    closingHour: string;
  }
  
  // -------------------------------------------
  // AVAILABILITY
  // -------------------------------------------
  
  export interface AvailabilityResult {
    available: boolean;
    currentBookings?: number;
    maxCapacity?: number;
    reason?: string;
    alternativeSlots?: Array<{
      date: string;
      time: string;
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
  
  export interface ReservationStats {
    total: string;
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
    MAX_PARTY_SIZE: number;
    MAX_RESERVATIONS_PER_SLOT: number;
    
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