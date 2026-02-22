-- ===========================================
-- AI VOICE ASSISTANT - DATABASE SCHEMA
-- ===========================================
-- Run this migration against a fresh PostgreSQL database
-- Example: psql -U postgres -d voice_assistant -f migrations/001_initial.sql

-- -------------------------------------------
-- CUSTOMERS TABLE
-- -------------------------------------------
-- Stores information about callers
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    email VARCHAR(255),
    preferred_language VARCHAR(10) DEFAULT 'en',
    total_reservations INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(full_name);

-- -------------------------------------------
-- RESERVATIONS TABLE
-- -------------------------------------------
-- Stores all reservation data
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no-show')),
    special_requests TEXT,
    table_number VARCHAR(20),
    source VARCHAR(20) DEFAULT 'phone_ai' CHECK (source IN ('phone_ai', 'phone_human', 'website', 'walk_in', 'other')),
    confirmation_code VARCHAR(10) UNIQUE NOT NULL,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reservations_date ON reservations(reservation_date);
CREATE INDEX idx_reservations_datetime ON reservations(reservation_date, reservation_time);
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_confirmation ON reservations(confirmation_code);

-- -------------------------------------------
-- CALL LOGS TABLE
-- -------------------------------------------
-- Tracks all phone calls and their outcomes
CREATE TABLE IF NOT EXISTS call_logs (
    id SERIAL PRIMARY KEY,
    call_sid VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
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
    reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
    was_transferred BOOLEAN DEFAULT FALSE,
    transfer_reason TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_call_logs_sid ON call_logs(call_sid);
CREATE INDEX idx_call_logs_customer ON call_logs(customer_id);
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
-- Dates/times when reservations are not available
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
CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER reservations_updated_at
    BEFORE UPDATE ON reservations
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
    ARRAY['when are you open', 'what time do you open', 'what time do you close', 'hours of operation'],
    'We are open Monday through Thursday from 11 AM to 10 PM, Friday and Saturday from 11 AM to 11 PM, and Sunday from 10 AM to 9 PM for brunch and dinner.',
    'We are open daily from 11 AM, closing at 10 PM on weekdays and 11 PM on weekends.',
    'hours',
    10
),
(
    'Where are you located',
    ARRAY['what is your address', 'how do I get there', 'location', 'directions'],
    'We are located at 123 Main Street in downtown. We are easy to find, right next to the central park. There is street parking available as well as a parking garage two blocks away.',
    'We are at 123 Main Street in downtown, near central park.',
    'location',
    10
),
(
    'Do you have parking',
    ARRAY['where can I park', 'is there parking', 'parking available'],
    'Yes, we have limited street parking directly in front of the restaurant. There is also a public parking garage two blocks east that offers validated parking for our guests. Just bring your ticket in and we will stamp it for you.',
    'Yes, street parking and a garage two blocks away with validation.',
    'parking',
    8
),
(
    'Do you take walk-ins',
    ARRAY['do I need a reservation', 'can I come without reservation', 'walk in'],
    'Yes, we do accept walk-ins based on availability. However, for dinner service especially on weekends, we highly recommend making a reservation to ensure we have a table ready for you.',
    'Yes, but reservations are recommended for dinner and weekends.',
    'reservations',
    9
),
(
    'What is your dress code',
    ARRAY['what should I wear', 'is there a dress code', 'formal attire'],
    'We have a smart casual dress code. We ask that guests avoid athletic wear, flip flops, and overly casual attire. Collared shirts for men are appreciated but not required.',
    'Smart casual. No athletic wear or flip flops please.',
    'dress_code',
    7
),
(
    'Do you have vegetarian options',
    ARRAY['vegan options', 'plant based', 'vegetarian menu', 'dietary restrictions'],
    'Absolutely! We have an extensive selection of vegetarian and vegan dishes. Our menu clearly marks all vegetarian options with a V symbol. We can also accommodate most dietary restrictions with advance notice.',
    'Yes, we have many vegetarian and vegan options marked on our menu.',
    'menu',
    8
),
(
    'Do you have a private dining room',
    ARRAY['private events', 'party room', 'private party', 'large group'],
    'Yes, we have a beautiful private dining room that can accommodate up to 40 guests. It is perfect for special occasions, business dinners, and celebrations. For private dining inquiries, I would recommend speaking with our events coordinator who can help plan your special event.',
    'Yes, our private room holds up to 40 guests. Should I transfer you to our events team?',
    'events',
    6
),
(
    'What is your cancellation policy',
    ARRAY['cancel reservation', 'cancellation fee', 'how to cancel'],
    'We kindly ask for at least 24 hours notice for cancellations. For parties of 6 or more, we require 48 hours notice. Late cancellations or no-shows may be subject to a fee, especially for large parties or special events.',
    '24 hours notice for most reservations, 48 hours for groups of 6 or more.',
    'policy',
    9
);

-- Insert default business settings
INSERT INTO business_settings (key, value, description) VALUES
('max_party_size', '20', 'Maximum party size for online reservations'),
('max_reservations_per_slot', '10', 'Maximum reservations per 30-minute slot'),
('advance_booking_days', '60', 'How far in advance reservations can be made'),
('min_advance_hours', '2', 'Minimum hours before reservation time to book'),
('greeting_message', 'Thank you for calling!', 'Default greeting message');

-- -------------------------------------------
-- HELPFUL VIEWS
-- -------------------------------------------

-- Today's reservations
CREATE OR REPLACE VIEW todays_reservations AS
SELECT 
    r.*,
    c.full_name as customer_name,
    c.phone as customer_phone
FROM reservations r
JOIN customers c ON r.customer_id = c.id
WHERE r.reservation_date = CURRENT_DATE
  AND r.status NOT IN ('cancelled')
ORDER BY r.reservation_time;

-- Daily stats view
CREATE OR REPLACE VIEW daily_call_stats AS
SELECT 
    DATE(started_at) as call_date,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
    AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration,
    COUNT(*) FILTER (WHERE was_transferred = true) as transferred_calls,
    COUNT(*) FILTER (WHERE reservation_id IS NOT NULL) as calls_with_reservation
FROM call_logs
GROUP BY DATE(started_at)
ORDER BY call_date DESC;

COMMENT ON TABLE customers IS 'Customer information and contact details';
COMMENT ON TABLE reservations IS 'All reservation records';
COMMENT ON TABLE call_logs IS 'Phone call history and transcripts';
COMMENT ON TABLE faq_responses IS 'Pre-defined FAQ answers for the AI';
COMMENT ON TABLE conversation_sessions IS 'Backup storage for active conversations';
COMMENT ON TABLE business_settings IS 'Configurable business parameters';
COMMENT ON TABLE blocked_times IS 'Dates/times when reservations are blocked';
