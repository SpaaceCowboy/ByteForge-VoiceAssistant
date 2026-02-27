-- ===========================================
-- NEUROSPINE INSTITUTE - CLINIC DATABASE SCHEMA
-- ===========================================
-- Migration: 002_neurospine_clinic.sql
-- Description: Transforms restaurant reservation system into
--              NeuroSpine Institute appointment booking system
--
-- Run: psql -d voice_assistant -f migrations/002_neurospine_clinic.sql
-- ===========================================

-- -------------------------------------------
-- DROP OLD RESTAURANT SCHEMA
-- -------------------------------------------
-- Drop in reverse dependency order
DROP VIEW IF EXISTS daily_call_stats CASCADE;
DROP VIEW IF EXISTS todays_reservations CASCADE;

DROP TABLE IF EXISTS blocked_times CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS faq_responses CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- Drop old trigger function
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;


-- ===========================================
-- NEW CLINIC SCHEMA
-- ===========================================

-- -------------------------------------------
-- LOCATIONS TABLE
-- -------------------------------------------
-- NeuroSpine Institute office locations
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) DEFAULT 'CA',
    zip VARCHAR(10) NOT NULL,
    phone VARCHAR(20),
    fax VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    operating_hours JSONB DEFAULT '{
        "monday":    {"open": "08:00", "close": "17:00"},
        "tuesday":   {"open": "08:00", "close": "17:00"},
        "wednesday": {"open": "08:00", "close": "17:00"},
        "thursday":  {"open": "08:00", "close": "17:00"},
        "friday":    {"open": "08:00", "close": "17:00"},
        "saturday":  null,
        "sunday":    null
    }'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------
-- DEPARTMENTS TABLE
-- -------------------------------------------
-- Clinical departments / specialties
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------
-- DOCTORS TABLE
-- -------------------------------------------
-- Physicians and providers
CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    title VARCHAR(50),                       -- D.O., M.D., N.P., etc.
    specialty VARCHAR(255) NOT NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    bio TEXT,
    is_accepting_new_patients BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_doctors_department ON doctors(department_id);
CREATE INDEX idx_doctors_active ON doctors(is_active);

-- -------------------------------------------
-- DOCTOR-LOCATION JUNCTION TABLE
-- -------------------------------------------
-- Which doctors practice at which locations
CREATE TABLE IF NOT EXISTS doctor_locations (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    UNIQUE(doctor_id, location_id)
);

-- -------------------------------------------
-- PATIENTS TABLE
-- -------------------------------------------
-- Patient records (replaces customers)
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    date_of_birth DATE,
    email VARCHAR(255),
    address TEXT,
    insurance_provider VARCHAR(255),
    insurance_id VARCHAR(100),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    preferred_language VARCHAR(10) DEFAULT 'en',
    preferred_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    preferred_doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    total_appointments INTEGER DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name ON patients(full_name);
CREATE INDEX idx_patients_email ON patients(email);

-- -------------------------------------------
-- APPOINTMENTS TABLE
-- -------------------------------------------
-- Medical appointments (replaces reservations)
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    appointment_type VARCHAR(50) DEFAULT 'consultation'
        CHECK (appointment_type IN (
            'consultation', 'follow_up', 'procedure',
            'imaging', 'urgent_care', 'pre_surgical',
            'post_surgical', 'pain_management', 'therapy'
        )),
    status VARCHAR(20) DEFAULT 'scheduled'
        CHECK (status IN (
            'scheduled', 'confirmed', 'checked_in',
            'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'
        )),
    reason_for_visit TEXT,
    special_instructions TEXT,
    is_new_patient BOOLEAN DEFAULT FALSE,
    referral_required BOOLEAN DEFAULT FALSE,
    referral_source VARCHAR(255),
    insurance_verified BOOLEAN DEFAULT FALSE,
    source VARCHAR(20) DEFAULT 'phone_ai'
        CHECK (source IN ('phone_ai', 'phone_human', 'website', 'walk_in', 'referral', 'other')),
    confirmation_code VARCHAR(10) UNIQUE NOT NULL,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_datetime ON appointments(appointment_date, appointment_time);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_department ON appointments(department_id);
CREATE INDEX idx_appointments_location ON appointments(location_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_confirmation ON appointments(confirmation_code);
CREATE INDEX idx_appointments_type ON appointments(appointment_type);

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
-- BLOCKED TIMES TABLE
-- -------------------------------------------
-- Dates/times when appointments are not available
CREATE TABLE IF NOT EXISTS blocked_times (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    blocked_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(255),
    is_recurring BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_blocked_date ON blocked_times(blocked_date);
CREATE INDEX idx_blocked_doctor ON blocked_times(doctor_id);

-- -------------------------------------------
-- BUSINESS SETTINGS TABLE
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS business_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------
-- DASHBOARD USERS TABLE
-- -------------------------------------------
-- Admin dashboard access (for Phase 3)
CREATE TABLE IF NOT EXISTS dashboard_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user'
        CHECK (role IN ('user', 'moderator')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dashboard_users_email ON dashboard_users(email);
CREATE INDEX idx_dashboard_users_role ON dashboard_users(role);


-- ===========================================
-- TRIGGER: Auto-update updated_at
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER doctors_updated_at BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER call_logs_updated_at BEFORE UPDATE ON call_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER faq_responses_updated_at BEFORE UPDATE ON faq_responses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER conversation_sessions_updated_at BEFORE UPDATE ON conversation_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER dashboard_users_updated_at BEFORE UPDATE ON dashboard_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ===========================================
-- SEED DATA: Locations
-- ===========================================
INSERT INTO locations (name, address, city, state, zip, phone) VALUES
(
    'NeuroSpine Institute - Palmdale',
    '1120 West Avenue M-4',
    'Palmdale', 'CA', '93551',
    '(661) 480-2377'
),
(
    'NeuroSpine Institute - Sherman Oaks',
    '13540 Ventura Blvd',
    'Sherman Oaks', 'CA', '91423',
    '(661) 480-2377'
),
(
    'NeuroSpine Institute - Valencia',
    '25425 Orchard Village Road Suite 280B',
    'Valencia', 'CA', '91355',
    '(661) 480-2377'
),
(
    'NeuroSpine Institute - Thousand Oaks',
    '110 Jensen Court, Suite 2A',
    'Thousand Oaks', 'CA', '91360',
    '(661) 480-2377'
);

-- ===========================================
-- SEED DATA: Departments
-- ===========================================
INSERT INTO departments (name, slug, description) VALUES
(
    'Neurosurgery',
    'neurosurgery',
    'Brain and spine surgery including complex and minimally invasive spine procedures, tumor removal, and trauma surgery.'
),
(
    'Neurology',
    'neurology',
    'Diagnosis and treatment of conditions affecting the nervous system including headaches, movement disorders, and neurodiagnostics.'
),
(
    'Pain Management',
    'pain-management',
    'Interventional pain medicine and physical medicine & rehabilitation for chronic and acute pain conditions.'
),
(
    'Physical Medicine & Rehabilitation',
    'physiatry',
    'Physiatry services focused on restoring function and quality of life through non-surgical treatments.'
),
(
    'Chiropractic Care',
    'chiropractic',
    'Hands-on spinal manipulation and treatment for joint, bone, muscle, and nerve problems.'
),
(
    'Urgent Care',
    'urgent-care',
    'Immediate attention for spine and neurological emergencies including acute back pain, sudden weakness or numbness, and spinal injuries. Walk-ins accepted.'
);

-- ===========================================
-- SEED DATA: Doctors
-- ===========================================
INSERT INTO doctors (full_name, title, specialty, department_id, bio) VALUES
(
    'Dr. Kamran Parsa',
    'D.O.',
    'Neurosurgeon - Complex & Minimally Invasive Spine Surgery',
    (SELECT id FROM departments WHERE slug = 'neurosurgery'),
    'Board-certified neurosurgeon. Fellowship-trained at the Mayo Clinic. Founder and CEO of the NeuroSpine Institute. Specializes in complex and minimally invasive spine surgery including revision surgery, adult degenerative deformity, spinal tumors, and complex spinal trauma.'
),
(
    'Dr. Quang D. Ma',
    'D.O.',
    'Neurosurgeon - Complex & Minimally Invasive Spine Surgery',
    (SELECT id FROM departments WHERE slug = 'neurosurgery'),
    'Board-certified neurosurgeon with fellowship in complex and minimally invasive spine surgery.'
),
(
    'Dr. Tyler Carson',
    'D.O.',
    'Neurosurgeon - Complex & Minimally Invasive Spine Surgery',
    (SELECT id FROM departments WHERE slug = 'neurosurgery'),
    'Board-certified neurosurgeon with fellowship in complex and minimally invasive spine surgery.'
),
(
    'Dr. Bhargav Mudda',
    'M.D., FIPP',
    'Pain Management & Physical Medicine and Rehabilitation',
    (SELECT id FROM departments WHERE slug = 'pain-management'),
    'Double board-certified physician specializing in pain medicine and physical medicine & rehabilitation.'
),
(
    'Dr. Jaspreet Singh',
    'M.D.',
    'Pain Management & Physical Medicine and Rehabilitation',
    (SELECT id FROM departments WHERE slug = 'pain-management'),
    'Double board-certified physician specializing in pain medicine and physical medicine & rehabilitation.'
),
(
    'Dr. Kaveh Saremi',
    'M.D.',
    'Neurologist - Clinical Neurodiagnostic & Movement Disorders',
    (SELECT id FROM departments WHERE slug = 'neurology'),
    'Board-certified neurologist specializing in clinical neurodiagnostics and movement disorders.'
),
(
    'Dr. Tahoora Sadoughi',
    'M.D.',
    'Neurologist - Headaches Specialist',
    (SELECT id FROM departments WHERE slug = 'neurology'),
    'Neurologist specializing in headache diagnosis and treatment.'
),
(
    'Dr. Liju John',
    'M.D.',
    'Pain Management & Physical Medicine and Rehabilitation',
    (SELECT id FROM departments WHERE slug = 'pain-management'),
    'Double board-certified in pain management and physical medicine & rehabilitation.'
),
(
    'Dr. Bob Shafa',
    'M.D.',
    'Board Certified Physician',
    (SELECT id FROM departments WHERE slug = 'neurosurgery'),
    'Board-certified physician at NeuroSpine Institute.'
),
(
    'Dr. Eugene Pahk',
    NULL,
    'Board Certified Physician',
    (SELECT id FROM departments WHERE slug = 'neurosurgery'),
    'Board-certified physician at NeuroSpine Institute.'
);

-- ===========================================
-- SEED DATA: Doctor-Location Assignments
-- ===========================================
-- Assign all doctors to all locations (can be refined later)
INSERT INTO doctor_locations (doctor_id, location_id)
SELECT d.id, l.id FROM doctors d CROSS JOIN locations l;

-- ===========================================
-- SEED DATA: FAQ Responses (from NSICA website)
-- ===========================================
INSERT INTO faq_responses (question_pattern, question_variations, answer, answer_short, category, priority) VALUES
(
    'How do I make an appointment',
    ARRAY['how to book', 'schedule appointment', 'make appointment', 'book a visit', 'request appointment'],
    'You can call us at (661) 480-2377 during our working hours, Monday through Friday 8 AM to 5 PM, or you can request an appointment online through our website at nsica.org. I can also help you schedule an appointment right now over the phone.',
    'Call (661) 480-2377 or request online at nsica.org. I can also book one for you right now.',
    'appointments',
    10
),
(
    'Do I need a referral',
    ARRAY['referral required', 'need referral', 'do I need a referral letter', 'primary care referral'],
    'Most medical specialists will accept only referred patients. This is mainly to ensure the specialist you are seeing is appropriate for your condition. Please check with your insurance company to see if a referral is necessary. For your initial consultation, bring a referral letter from your physician if required.',
    'It depends on your insurance. Check with your insurance company about referral requirements.',
    'appointments',
    9
),
(
    'What should I bring to my appointment',
    ARRAY['what to bring', 'first visit', 'initial consultation', 'prepare for appointment', 'new patient'],
    'Please arrive 10 to 15 minutes early for registration. Bring a photo ID, your insurance card, a referral letter if required, any relevant medical records such as X-rays, MRIs, or CT scans, a list of your current medications, and a written list of questions you would like to ask the doctor.',
    'Bring your ID, insurance card, any imaging or medical records, medication list, and arrive 10-15 minutes early.',
    'appointments',
    9
),
(
    'What are your hours',
    ARRAY['when are you open', 'office hours', 'what time do you open', 'what time do you close', 'business hours', 'hours of operation'],
    'The NeuroSpine Institute is open Monday through Friday from 8 AM to 5 PM. We are closed on weekends. For urgent spine or neurological issues, our Urgent Care department accepts walk-ins during business hours.',
    'Monday through Friday, 8 AM to 5 PM. Closed weekends.',
    'hours',
    10
),
(
    'Where are you located',
    ARRAY['location', 'address', 'directions', 'how to get there', 'office locations', 'where is the clinic'],
    'We have four locations in Southern California. Our main office is in Palmdale at 1120 West Avenue M-4, Palmdale CA 93551. We also have offices in Sherman Oaks at 13540 Ventura Blvd, in Valencia at 25425 Orchard Village Road Suite 280B, and in Thousand Oaks at 110 Jensen Court Suite 2A. Which location would you prefer?',
    'We have offices in Palmdale, Sherman Oaks, Valencia, and Thousand Oaks.',
    'location',
    10
),
(
    'What is the cancellation policy',
    ARRAY['cancel appointment', 'cancellation policy', 'cancel my visit', 'how to cancel', 'cancellation fee'],
    'Please call the office during business hours and allow at least 1 days notice so that we can offer your appointment time to patients on our waiting list. We recognize that your time is valuable, and we make every effort to run on time.',
    'Please give at least 1 day notice for cancellations by calling the office.',
    'policy',
    8
),
(
    'Do you accept my insurance',
    ARRAY['insurance accepted', 'what insurance', 'take my insurance', 'insurance coverage', 'health insurance'],
    'We accept most major insurance plans. I would recommend calling our office at (661) 480-2377 to verify your specific insurance coverage before your appointment. You can also have your insurance information ready and I can help note it for verification.',
    'We accept most major insurance plans. Call us to verify your specific coverage.',
    'insurance',
    9
),
(
    'What conditions do you treat',
    ARRAY['what do you treat', 'services offered', 'conditions treated', 'specialties', 'what can you help with'],
    'The NeuroSpine Institute provides comprehensive care for neurological and spine conditions. This includes herniated discs, spinal stenosis, sciatica, degenerative disc disease, scoliosis, spinal fractures, chronic back and neck pain, brain tumors, movement disorders, headaches and migraines, and neurological conditions like numbness or weakness. We offer neurosurgery, neurology, pain management, physical medicine, and chiropractic care.',
    'We treat spine and neurological conditions including herniated discs, stenosis, sciatica, chronic pain, brain conditions, and more.',
    'services',
    10
),
(
    'Do I need spine surgery',
    ARRAY['is surgery necessary', 'need surgery', 'surgical options', 'when is surgery needed', 'spine surgery required'],
    'Spine surgery is considered as a last resort, as many patients improve with more conservative treatments first. The majority of conditions that may benefit from surgery involve pain radiating down the arms or legs, associated numbness or weakness, that have not improved with non-operative care. Your primary care physician should begin treatment, and if things do not improve, it is time to consult with a spine surgeon. Dr. Parsa and our team will evaluate your specific case.',
    'Surgery is a last resort. Most patients improve with conservative treatment first. A consultation will determine the best approach.',
    'medical',
    8
),
(
    'What is minimally invasive spine surgery',
    ARRAY['minimally invasive', 'less invasive surgery', 'small incision surgery', 'laparoscopic spine'],
    'Minimally invasive surgery uses smaller incisions with special devices like endoscopes or laparoscopes. The advantages include smaller surgical incisions, less damage to muscles and soft tissue, less blood loss, shorter hospital stay, faster recovery, and reduced post-operative pain. Our neurosurgeons are fellowship-trained in these techniques at the Mayo Clinic.',
    'Smaller incisions, less tissue damage, faster recovery, and less pain. Our surgeons are Mayo Clinic fellowship-trained in these techniques.',
    'medical',
    7
),
(
    'What is your phone number',
    ARRAY['contact number', 'phone number', 'how to call', 'call you'],
    'You can reach the NeuroSpine Institute at (661) 480-2377. Our office hours are Monday through Friday, 8 AM to 5 PM.',
    'Call us at (661) 480-2377, Monday through Friday 8 AM to 5 PM.',
    'contact',
    10
),
(
    'Do you offer urgent care',
    ARRAY['emergency', 'walk in', 'urgent appointment', 'immediate care', 'same day appointment'],
    'Yes, our Urgent Care department provides immediate attention for spine and neurological emergencies, including acute back or neck pain, sudden weakness or numbness, headaches, and spinal injuries. No appointment is needed for urgent care, we accept walk-ins. For life-threatening conditions such as severe head trauma or stroke, please go to the emergency room immediately.',
    'Yes, we have walk-in urgent care for spine and neuro emergencies. For life-threatening conditions, go to the ER.',
    'services',
    9
),
(
    'Who is Doctor Parsa',
    ARRAY['tell me about Dr Parsa', 'who is the founder', 'about Kamran Parsa', 'head doctor'],
    'Dr. Kamran Parsa is a board-certified neurosurgeon and the Founder and CEO of the NeuroSpine Institute. He completed his fellowship in complex and minimally invasive spine surgery at the world-renowned Mayo Clinic. He specializes in treating the most challenging spinal and neurosurgical conditions with precision and innovation. He also serves as Vice Chair of the Department of Surgery at Palmdale Regional Medical Center.',
    'Dr. Parsa is our founder, a board-certified neurosurgeon with Mayo Clinic fellowship training in complex spine surgery.',
    'doctors',
    8
),
(
    'Is my medical information private',
    ARRAY['privacy', 'confidential', 'medical records', 'HIPAA', 'data privacy'],
    'Yes, your medical file is handled with the utmost respect for your privacy. Our staff is bound by strict confidentiality requirements as a condition of employment regarding your medical records. We will not release the contents of your medical file without your consent.',
    'Yes, your records are strictly confidential. We do not release information without your consent.',
    'policy',
    7
);

-- ===========================================
-- SEED DATA: Business Settings
-- ===========================================
INSERT INTO business_settings (key, value, description) VALUES
('business_name', 'NeuroSpine Institute', 'Official clinic name'),
('business_phone', '(661) 480-2377', 'Main phone number'),
('business_website', 'nsica.org', 'Clinic website'),
('max_appointments_per_slot', '3', 'Maximum appointments per 30-minute slot per doctor'),
('advance_booking_days', '60', 'How far in advance appointments can be booked'),
('min_advance_hours', '2', 'Minimum hours before appointment time to book'),
('default_appointment_duration', '30', 'Default appointment duration in minutes'),
('opening_hour', '08:00', 'Daily opening time'),
('closing_hour', '17:00', 'Daily closing time'),
('greeting_message', 'Thank you for calling the NeuroSpine Institute.', 'Default greeting');


-- ===========================================
-- HELPFUL VIEWS
-- ===========================================

-- Today's appointments
CREATE OR REPLACE VIEW todays_appointments AS
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone AS patient_phone,
    p.insurance_provider,
    d.full_name AS doctor_name,
    d.title AS doctor_title,
    dep.name AS department_name,
    l.name AS location_name
FROM appointments a
JOIN patients p ON a.patient_id = p.id
LEFT JOIN doctors d ON a.doctor_id = d.id
LEFT JOIN departments dep ON a.department_id = dep.id
LEFT JOIN locations l ON a.location_id = l.id
WHERE a.appointment_date = CURRENT_DATE
  AND a.status NOT IN ('cancelled')
ORDER BY a.appointment_time;

-- Daily call stats
CREATE OR REPLACE VIEW daily_call_stats AS
SELECT
    DATE(started_at) AS call_date,
    COUNT(*) AS total_calls,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_calls,
    AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) AS avg_duration,
    COUNT(*) FILTER (WHERE was_transferred = true) AS transferred_calls,
    COUNT(*) FILTER (WHERE appointment_id IS NOT NULL) AS calls_with_appointment
FROM call_logs
GROUP BY DATE(started_at)
ORDER BY call_date DESC;

-- Doctor schedule view
CREATE OR REPLACE VIEW doctor_schedule AS
SELECT
    d.full_name AS doctor_name,
    d.title AS doctor_title,
    dep.name AS department,
    a.appointment_date,
    a.appointment_time,
    a.duration_minutes,
    a.appointment_type,
    a.status,
    p.full_name AS patient_name,
    l.name AS location_name
FROM appointments a
JOIN doctors d ON a.doctor_id = d.id
JOIN patients p ON a.patient_id = p.id
LEFT JOIN departments dep ON a.department_id = dep.id
LEFT JOIN locations l ON a.location_id = l.id
WHERE a.status NOT IN ('cancelled')
ORDER BY a.appointment_date, a.appointment_time;


-- ===========================================
-- TABLE COMMENTS
-- ===========================================
COMMENT ON TABLE locations IS 'NeuroSpine Institute office locations across Southern California';
COMMENT ON TABLE departments IS 'Clinical departments and specialties';
COMMENT ON TABLE doctors IS 'Physicians, surgeons, and providers';
COMMENT ON TABLE doctor_locations IS 'Which doctors practice at which locations';
COMMENT ON TABLE patients IS 'Patient records and contact information';
COMMENT ON TABLE appointments IS 'All appointment records';
COMMENT ON TABLE call_logs IS 'Phone call history and transcripts from AI voice assistant';
COMMENT ON TABLE faq_responses IS 'Pre-defined FAQ answers for the AI assistant';
COMMENT ON TABLE conversation_sessions IS 'Backup storage for active call conversations';
COMMENT ON TABLE business_settings IS 'Configurable clinic parameters';
COMMENT ON TABLE blocked_times IS 'Dates/times when appointments are blocked per doctor';
COMMENT ON TABLE dashboard_users IS 'Admin dashboard user accounts with role-based access';
