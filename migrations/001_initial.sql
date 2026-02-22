-- ===========================================
-- AI VOICE ASSISTANT - DATABASE SCHEMA
-- SpineWell Clinic - Appointment Management
-- ===========================================
-- Run this migration against a fresh PostgreSQL database
-- Example: psql -U postgres -d voice_assistant -f migrations/001_initial.sql

-- -------------------------------------------
-- PATIENTS TABLE
-- -------------------------------------------
-- Stores information about callers/patients
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    email VARCHAR(255),
    date_of_birth DATE,
    insurance_provider VARCHAR(255),
    insurance_id VARCHAR(100),
    preferred_language VARCHAR(10) DEFAULT 'en',
    total_appointments INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name ON patients(full_name);

-- -------------------------------------------
-- APPOINTMENTS TABLE
-- -------------------------------------------
-- Stores all appointment data
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no-show')),
    reason_for_visit TEXT,
    special_instructions TEXT,
    provider_name VARCHAR(255),
    treatment_room VARCHAR(20),
    source VARCHAR(20) DEFAULT 'phone_ai' CHECK (source IN ('phone_ai', 'phone_human', 'website', 'walk_in', 'other')),
    confirmation_code VARCHAR(10) UNIQUE NOT NULL,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_datetime ON appointments(appointment_date, appointment_time);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_confirmation ON appointments(confirmation_code);

-- -------------------------------------------
-- CALL LOGS TABLE
-- -------------------------------------------
-- Tracks all phone calls and their outcomes
CREATE TABLE IF NOT EXISTS call_logs (
    id SERIAL PRIMARY KEY,
    call_sid VARCHAR(50) UNIQUE NOT NULL,
    patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    status VARCHAR(30),
    transcript TEXT,
    summary TEXT,
    intent VARCHAR(50),
    sentiment VARCHAR(20),
    sentiment_score DECIMAL(3, 2),
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    was_transferred BOOLEAN DEFAULT FALSE,
    transfer_reason TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_call_logs_sid ON call_logs(call_sid);
CREATE INDEX idx_call_logs_patient ON call_logs(patient_id);
CREATE INDEX idx_call_logs_started ON call_logs(started_at);
CREATE INDEX idx_call_logs_intent ON call_logs(intent);

-- -------------------------------------------
-- FAQ RESPONSES TABLE
-- -------------------------------------------
-- Pre-defined answers for common questions
CREATE TABLE IF NOT EXISTS faq_responses (
    id SERIAL PRIMARY KEY,
    question_pattern TEXT NOT NULL,
    question_variations TEXT[] DEFAULT '{}',
    answer TEXT NOT NULL,
    answer_short TEXT,
    category VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    times_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_faq_category ON faq_responses(category);
CREATE INDEX idx_faq_active ON faq_responses(is_active);

-- -------------------------------------------
-- CONVERSATION SESSIONS TABLE
-- -------------------------------------------
-- Backup storage for session data (Redis is primary)
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id SERIAL PRIMARY KEY,
    call_sid VARCHAR(50) UNIQUE NOT NULL,
    state JSONB,
    message_history JSONB,
    collected_data JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_call_sid ON conversation_sessions(call_sid);
CREATE INDEX idx_sessions_active ON conversation_sessions(is_active);

-- -------------------------------------------
-- BUSINESS SETTINGS TABLE
-- -------------------------------------------
-- Configurable business settings
CREATE TABLE IF NOT EXISTS business_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------
-- BLOCKED TIMES TABLE
-- -------------------------------------------
-- Dates/times when appointments are not available
CREATE TABLE IF NOT EXISTS blocked_times (
    id SERIAL PRIMARY KEY,
    blocked_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(255),
    is_recurring BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_blocked_date ON blocked_times(blocked_date);

-- -------------------------------------------
-- TRIGGER: Update timestamp
-- -------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER call_logs_updated_at
    BEFORE UPDATE ON call_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER faq_responses_updated_at
    BEFORE UPDATE ON faq_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversation_sessions_updated_at
    BEFORE UPDATE ON conversation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------
-- SAMPLE FAQ DATA
-- -------------------------------------------
INSERT INTO faq_responses (question_pattern, question_variations, answer, answer_short, category, priority) VALUES
(
    'What are your hours',
    ARRAY['when are you open', 'what time do you open', 'what time do you close', 'hours of operation', 'office hours'],
    'SpineWell Clinic is open Monday through Friday from 8 AM to 5 PM. We are closed on weekends and major holidays.',
    'We are open Monday through Friday, 8 AM to 5 PM.',
    'hours',
    10
),
(
    'Where are you located',
    ARRAY['what is your address', 'how do I get there', 'location', 'directions', 'where is the clinic'],
    'SpineWell Clinic is located at 450 Spine Health Boulevard, Suite 200. We are easy to find, just off the main highway near the medical district. There is free parking available in our building lot.',
    'We are at 450 Spine Health Boulevard, Suite 200, near the medical district.',
    'location',
    10
),
(
    'Do you have parking',
    ARRAY['where can I park', 'is there parking', 'parking available', 'parking lot'],
    'Yes, we have a free parking lot directly in front of our building with handicap-accessible spaces near the entrance. There is also additional street parking available.',
    'Yes, free parking is available in our building lot.',
    'parking',
    8
),
(
    'Do I need a referral',
    ARRAY['do you need a referral', 'referral required', 'can I come without referral', 'self referral', 'do I need a doctor referral'],
    'In most cases, you do not need a referral to schedule an appointment at SpineWell Clinic. However, some insurance plans may require a referral from your primary care physician. We recommend checking with your insurance provider beforehand.',
    'Most patients do not need a referral, but check with your insurance to be sure.',
    'referrals',
    9
),
(
    'What insurance do you accept',
    ARRAY['insurance accepted', 'do you take my insurance', 'which insurance', 'insurance plans', 'do you accept medicare', 'do you accept medicaid'],
    'We accept most major insurance plans including Blue Cross Blue Shield, Aetna, Cigna, UnitedHealthcare, Medicare, and many others. Please call our office or provide your insurance details so we can verify your coverage before your appointment.',
    'We accept most major insurance plans. Please verify with us before your visit.',
    'insurance',
    10
),
(
    'What conditions do you treat',
    ARRAY['what do you treat', 'spinal conditions', 'back pain', 'neck pain', 'what services', 'treatments offered', 'herniated disc', 'sciatica', 'scoliosis'],
    'SpineWell Clinic specializes in a wide range of spinal conditions including back pain, neck pain, herniated discs, sciatica, spinal stenosis, scoliosis, degenerative disc disease, and sports-related spine injuries. We offer consultations, physical therapy, injection therapies, and surgical referrals when needed.',
    'We treat back pain, neck pain, herniated discs, sciatica, stenosis, scoliosis, and more.',
    'services',
    10
),
(
    'What should I bring to my first appointment',
    ARRAY['first visit', 'what to bring', 'new patient', 'first appointment', 'prepare for visit'],
    'For your first appointment, please bring a valid photo ID, your insurance card, a list of current medications, any relevant imaging such as X-rays or MRI results, and a referral letter if your insurance requires one. Please arrive 15 minutes early to complete new patient paperwork.',
    'Bring your ID, insurance card, medication list, and any imaging results. Arrive 15 minutes early.',
    'new_patient',
    9
),
(
    'What is your cancellation policy',
    ARRAY['cancel appointment', 'cancellation fee', 'how to cancel', 'reschedule appointment'],
    'We kindly ask for at least 24 hours notice for cancellations or rescheduling. Late cancellations or no-shows may be subject to a fee. If you need to cancel or reschedule, please call us as soon as possible so we can offer that time slot to another patient.',
    '24 hours notice required for cancellations. Late cancellations may incur a fee.',
    'policy',
    9
);

-- Insert default business settings
INSERT INTO business_settings (key, value, description) VALUES
('default_appointment_duration', '30', 'Default appointment duration in minutes'),
('max_appointments_per_slot', '3', 'Maximum appointments per time slot'),
('advance_booking_days', '90', 'How far in advance appointments can be made'),
('min_advance_hours', '2', 'Minimum hours before appointment time to book'),
('greeting_message', 'Thank you for calling SpineWell Clinic!', 'Default greeting message');

-- -------------------------------------------
-- HELPFUL VIEWS
-- -------------------------------------------

-- Today's appointments
CREATE OR REPLACE VIEW todays_appointments AS
SELECT
    a.*,
    p.full_name as patient_name,
    p.phone as patient_phone
FROM appointments a
JOIN patients p ON a.patient_id = p.id
WHERE a.appointment_date = CURRENT_DATE
  AND a.status NOT IN ('cancelled')
ORDER BY a.appointment_time;

-- Daily stats view
CREATE OR REPLACE VIEW daily_call_stats AS
SELECT
    DATE(started_at) as call_date,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
    AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration,
    COUNT(*) FILTER (WHERE was_transferred = true) as transferred_calls,
    COUNT(*) FILTER (WHERE appointment_id IS NOT NULL) as calls_with_appointment
FROM call_logs
GROUP BY DATE(started_at)
ORDER BY call_date DESC;

COMMENT ON TABLE patients IS 'Patient information and contact details';
COMMENT ON TABLE appointments IS 'All appointment records';
COMMENT ON TABLE call_logs IS 'Phone call history and transcripts';
COMMENT ON TABLE faq_responses IS 'Pre-defined FAQ answers for the AI';
COMMENT ON TABLE conversation_sessions IS 'Backup storage for active conversations';
COMMENT ON TABLE business_settings IS 'Configurable business parameters';
COMMENT ON TABLE blocked_times IS 'Dates/times when appointments are blocked';
