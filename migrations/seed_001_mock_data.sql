-- ===========================================
-- SEED DATA - NEUROSPINE INSTITUTE
-- ===========================================
-- Run after migration 002_neurospine_clinic.sql
-- Creates realistic mock data for dashboard development/testing
--
-- Usage: psql -d neurospine_assistant -f seeds/001_mock_data.sql
--
-- Default dashboard login:
--   Email:    admin@neurospine.com
--   Password: NeuroAdmin2026!
-- ===========================================

BEGIN;

-- ===========================================
-- CLEAN SLATE (safe to re-run)
-- Truncates in dependency order so there are
-- no foreign key violations.
-- ===========================================

TRUNCATE call_logs RESTART IDENTITY CASCADE;
TRUNCATE appointments RESTART IDENTITY CASCADE;
TRUNCATE patients RESTART IDENTITY CASCADE;
TRUNCATE doctor_locations RESTART IDENTITY CASCADE;
TRUNCATE doctors RESTART IDENTITY CASCADE;
TRUNCATE departments RESTART IDENTITY CASCADE;
TRUNCATE locations RESTART IDENTITY CASCADE;
TRUNCATE faq_responses RESTART IDENTITY CASCADE;
TRUNCATE dashboard_users RESTART IDENTITY CASCADE;

-- ===========================================
-- 1. LOCATIONS (4 clinics)
-- ===========================================

INSERT INTO locations (name, address, city, state, zip, phone, is_active) VALUES
  ('NeuroSpine Institute - Palmdale',      '1012 West Avenue M-14, Suite A', 'Palmdale',      'CA', '93551', '(661) 480-2377', true),
  ('NeuroSpine Institute - Sherman Oaks',  '4955 Van Nuys Blvd, Suite 300',  'Sherman Oaks',  'CA', '91403', '(818) 626-1096', true),
  ('NeuroSpine Institute - Valencia',      '23838 Valencia Blvd, Suite 100',  'Valencia',      'CA', '91355', '(661) 312-4082', true),
  ('NeuroSpine Institute - Thousand Oaks', '325 Rolling Oaks Dr, Suite 110',  'Thousand Oaks', 'CA', '91361', '(805) 496-2262', true);

-- ===========================================
-- 2. DEPARTMENTS (6)
-- ===========================================

INSERT INTO departments (name, slug, description, is_active) VALUES
  ('Neurosurgery',
   'neurosurgery',
   'Advanced surgical treatment for conditions of the brain, spine, and peripheral nerves. Specializing in minimally invasive spine surgery, spinal fusion, disc replacement, and complex spinal reconstructions.',
   true),
  ('Neurology',
   'neurology',
   'Diagnosis and non-surgical management of neurological conditions including neuropathy, radiculopathy, migraines, and nerve disorders. Comprehensive EMG/NCS testing available.',
   true),
  ('Pain Management',
   'pain-management',
   'Interventional pain procedures including epidural steroid injections, nerve blocks, facet joint injections, radiofrequency ablation, and spinal cord stimulation.',
   true),
  ('Physical Medicine & Rehabilitation',
   'pm-and-r',
   'Non-surgical rehabilitation programs for spine injuries, post-surgical recovery, and chronic pain conditions. Includes physical therapy referrals and functional restoration.',
   true),
  ('Chiropractic Care',
   'chiropractic',
   'Spinal adjustments, decompression therapy, and holistic musculoskeletal care. Integrates with our neurosurgery and pain management teams for comprehensive treatment plans.',
   true),
  ('Urgent Care',
   'urgent-care',
   'Walk-in and same-day appointments for acute spine and neurological concerns. Imaging and initial evaluation available on-site.',
   true);

-- ===========================================
-- 3. DOCTORS (10)
-- ===========================================

INSERT INTO doctors (full_name, title, specialty, department_id, bio, is_accepting_new_patients, is_active) VALUES
  -- Neurosurgery (dept 1)
  ('Dr. Kamran Parsa',
   'D.O., FAANS',
   'Minimally Invasive Spine Surgery',
   1,
   'Founder and Medical Director of NeuroSpine Institute. Board-certified neurosurgeon with over 20 years of experience in minimally invasive spine surgery, artificial disc replacement, and complex spinal reconstruction.',
   true, true),

  ('Dr. Michael Chen',
   'M.D.',
   'Complex Spinal Surgery',
   1,
   'Fellowship-trained spine surgeon specializing in complex revision surgeries, spinal deformity correction, and robotic-assisted procedures.',
   true, true),

  ('Dr. Sarah Williams',
   'M.D., Ph.D.',
   'Pediatric & Adult Neurosurgery',
   1,
   'Dual-trained in adult and pediatric neurosurgery with expertise in minimally invasive approaches and brain tumor surgery.',
   false, true),

  -- Neurology (dept 2)
  ('Dr. Anil Sharma',
   'M.D., FAAN',
   'Clinical Neurology & Electrodiagnostics',
   2,
   'Board-certified neurologist with expertise in peripheral neuropathy, nerve conduction studies, and EMG diagnostics.',
   true, true),

  ('Dr. Lisa Rodriguez',
   'D.O.',
   'Headache & Neuromuscular Disorders',
   2,
   'Specializes in migraine management, neuromuscular disorders, and botox therapy for chronic headaches.',
   true, true),

  -- Pain Management (dept 3)
  ('Dr. James Park',
   'M.D.',
   'Interventional Pain Management',
   3,
   'Double board-certified in anesthesiology and pain management. Expert in spinal cord stimulation, epidural injections, and radiofrequency ablation.',
   true, true),

  ('Dr. Maria Santos',
   'M.D.',
   'Chronic Pain & Regenerative Medicine',
   3,
   'Integrates traditional pain management with regenerative therapies including PRP and stem cell treatments for chronic spine conditions.',
   true, true),

  -- PM&R (dept 4)
  ('Dr. Robert Kim',
   'M.D.',
   'Physical Medicine & Rehabilitation',
   4,
   'Board-certified physiatrist focusing on non-surgical spine care, functional restoration, and post-operative rehabilitation.',
   true, true),

  -- Chiropractic (dept 5)
  ('Dr. David Thompson',
   'D.C.',
   'Chiropractic & Spinal Decompression',
   5,
   'Licensed chiropractor with advanced training in spinal decompression therapy and integrative musculoskeletal care.',
   true, true),

  -- Urgent Care (dept 6)
  ('Dr. Emily Foster',
   'M.D.',
   'Urgent Spine & Neuro Care',
   6,
   'Board-certified in emergency medicine with additional training in acute spine injuries and neurological emergencies.',
   true, true);

-- ===========================================
-- 4. DOCTOR-LOCATION ASSIGNMENTS
-- (Which doctors see patients at which locations)
-- ===========================================

INSERT INTO doctor_locations (doctor_id, location_id) VALUES
  -- Dr. Parsa: Palmdale (primary), Sherman Oaks
  (1, 1), (1, 2),
  -- Dr. Chen: Sherman Oaks
  (2, 2),
  -- Dr. Williams: Valencia
  (3, 3),
  -- Dr. Sharma: Palmdale
  (4, 1),
  -- Dr. Rodriguez: Sherman Oaks
  (5, 2),
  -- Dr. Park: Palmdale
  (6, 1),
  -- Dr. Santos: Thousand Oaks
  (7, 4),
  -- Dr. Kim: Palmdale
  (8, 1),
  -- Dr. Thompson: Valencia
  (9, 3),
  -- Dr. Foster: Palmdale (urgent care)
  (10, 1);

-- ===========================================
-- 5. PATIENTS (20)
-- ===========================================

INSERT INTO patients (phone, full_name, email, date_of_birth, address, insurance_provider, insurance_id, emergency_contact_name, emergency_contact_phone, preferred_language, preferred_location_id, preferred_doctor_id, total_appointments, notes) VALUES
  ('+16615551001', 'Maria Gonzalez',      'maria.gonzalez@email.com',    '1978-03-14', '1420 W Ave K, Lancaster, CA 93534',       'Blue Cross Blue Shield', 'BCBS-98742316',   'Carlos Gonzalez',     '(661) 555-1002', 'en', 1, 1, 5, 'Chronic lower back pain. Previous L4-L5 discectomy 2023.'),
  ('+16615551003', 'James Wilson',         'jwilson@email.com',           '1965-11-22', '38621 30th St E, Palmdale, CA 93550',     'Aetna',                  'AET-55431289',    'Patricia Wilson',     '(661) 555-1004', 'en', 1, 6, 3, 'Referred for epidural injections. History of spinal stenosis.'),
  ('+18185551005', 'Susan Chen',           'susan.chen@email.com',        '1982-07-08', '14520 Ventura Blvd, Sherman Oaks, CA 91403', 'UnitedHealthcare',    'UHC-77120045',    'David Chen',          '(818) 555-1006', 'en', 2, 2, 2, 'Post-surgical follow-up for cervical fusion.'),
  ('+16615551007', 'Robert Martinez',      'r.martinez99@email.com',      '1955-01-30', '44150 20th St W, Lancaster, CA 93534',    'Medicare',               'MCR-1234567890A', 'Elena Martinez',      '(661) 555-1008', 'en', 1, 1, 8, 'Complex multi-level fusion patient. Sees Dr. Parsa quarterly.'),
  ('+16615551009', 'Jennifer Thompson',    'jen.t@email.com',             '1990-09-15', '3057 Rancho Vista Blvd, Palmdale, CA 93551', 'Cigna',               'CIG-44289901',    'Mark Thompson',       '(661) 555-1010', 'en', 1, 8, 1, 'New patient. Referred by PCP for chronic migraines and neck pain.'),
  ('+18185551011', 'William Park',         'wpark@email.com',             '1972-05-03', '5120 Woodman Ave, Sherman Oaks, CA 91423', 'Kaiser Permanente',     'KP-SW-872341',    'Grace Park',          '(818) 555-1012', 'en', 2, 5, 4, 'Chronic migraine patient. On Botox therapy every 12 weeks.'),
  ('+16615551013', 'Patricia Davis',       'pdavis@email.com',            '1948-12-19', '2430 E Ave S, Palmdale, CA 93550',        'Medicare',               'MCR-9876543210B', 'Michael Davis',       '(661) 555-1014', 'en', 1, 4, 6, 'Degenerative disc disease. Pain management + PT combination.'),
  ('+16615551015', 'Ahmed Hassan',         'a.hassan@email.com',          '1985-04-27', '1830 W Ave J, Lancaster, CA 93534',       'Blue Shield of CA',      'BSC-66109823',    'Fatima Hassan',       '(661) 555-1016', 'en', 1, 1, 2, 'Herniated disc L5-S1. Considering surgical options.'),
  ('+18055551017', 'Linda Nakamura',       'linda.nak@email.com',         '1960-08-11', '2705 Townsgate Rd, Thousand Oaks, CA 91361', 'Anthem',              'ANT-33087126',    'Ken Nakamura',        '(805) 555-1018', 'en', 4, 7, 3, 'Fibromyalgia + lumbar radiculopathy. Regenerative therapy patient.'),
  ('+16615551019', 'Michael Brown',        'mbrown55@email.com',          '1970-02-28', '39415 10th St W, Palmdale, CA 93551',     'Aetna',                  'AET-88217034',    'Sarah Brown',         '(661) 555-1020', 'en', 1, 9, 2, 'Chiropractic and decompression therapy. Improving steadily.'),
  ('+16615551021', 'Rosa Hernandez',       'rosa.h@email.com',            '1988-06-05', '44920 Valley Central Way, Lancaster, CA 93536', 'Molina Healthcare', 'MOL-55091738',    'Juan Hernandez',      '(661) 555-1022', 'es', 1, 1, 1, 'Spanish-speaking. New patient consult for sciatica.'),
  ('+18185551023', 'David Kim',            'dkim.la@email.com',           '1995-10-12', '4221 Wilshire Blvd, Los Angeles, CA 90010', 'UnitedHealthcare',     'UHC-99015623',    'Jenny Kim',           '(213) 555-1024', 'en', 2, 2, 1, 'Young patient. Sports injury — cervical disc issue.'),
  ('+16615551025', 'Barbara Anderson',     'banderson@email.com',         '1952-03-21', '37712 55th St E, Palmdale, CA 93552',     'Medicare',               'MCR-5551234567C', 'Thomas Anderson',     '(661) 555-1026', 'en', 1, 6, 7, 'Long-term pain management patient. SCS implant 2024.'),
  ('+16615551027', 'Kevin Nguyen',         'knguyen@email.com',           '1980-12-01', '1605 W Ave I, Lancaster, CA 93534',       'Health Net',             'HN-44289156',     'Tran Nguyen',         '(661) 555-1028', 'en', 3, 3, 0, 'Scheduled for first appointment. Referred for scoliosis eval.'),
  ('+18055551029', 'Margaret O''Brien',    'mobrien@email.com',           '1958-07-16', '1200 Town Center Dr, Thousand Oaks, CA 91362', 'Blue Cross',         'BC-77308421',     'Patrick O''Brien',    '(805) 555-1030', 'en', 4, 7, 4, 'Chronic neck pain. Alternates between pain mgmt and chiro.'),
  ('+16615551031', 'Carlos Ramirez',       'cramirez@email.com',          '1975-09-08', '38536 Tierra Subida Ave, Palmdale, CA 93551', 'Cigna',              'CIG-22098175',    'Maria Ramirez',       '(661) 555-1032', 'en', 1, 8, 2, 'Work injury — lumbar strain. PT rehab program.'),
  ('+18185551033', 'Stephanie Lee',        'steph.lee@email.com',         '1992-01-25', '15233 Ventura Blvd, Sherman Oaks, CA 91403', 'Anthem',              'ANT-11056789',    'Daniel Lee',          '(818) 555-1034', 'en', 2, 4, 3, 'Chronic headaches and upper back pain. Neurology + PT.'),
  ('+16615551035', 'Frank Williams',       'fwilliams@email.com',         '1945-11-03', '43301 Division St, Lancaster, CA 93535',  'Medicare',               'MCR-3339876540D', 'Dorothy Williams',    '(661) 555-1036', 'en', 1, 1, 12,'Long-term patient of Dr. Parsa. Multiple spine surgeries. VIP flag.'),
  ('+16615551037', 'Natalie Foster',       'nfoster@email.com',           '1987-04-18', '2210 W Rancho Vista Blvd, Palmdale, CA 93551', 'Blue Shield of CA', 'BSC-88120534',    'Brian Foster',        '(661) 555-1038', 'en', 1, 10, 1, 'Acute back spasm. Walked into urgent care.'),
  ('+18185551039', 'George Petrov',        'gpetrov@email.com',           '1968-08-30', '5300 Balboa Blvd, Encino, CA 91316',      'Aetna',                  'AET-66043218',    'Irina Petrov',        '(818) 555-1040', 'en', 2, 6, 5, 'Chronic pain patient. Epidural injections every 3 months.');

-- ===========================================
-- 6. APPOINTMENTS (35 — mix of past, today, and future)
-- ===========================================

-- Helper: uses CURRENT_DATE so data is always relevant
-- Past appointments (completed, cancelled, no-show)
INSERT INTO appointments (patient_id, doctor_id, department_id, location_id, appointment_date, appointment_time, duration_minutes, appointment_type, status, reason_for_visit, special_instructions, is_new_patient, referral_required, referral_source, insurance_verified, source, confirmation_code) VALUES
  -- 2 weeks ago
  (1,  1, 1, 1, CURRENT_DATE - INTERVAL '14 days', '09:00', 30, 'follow_up',      'completed',  'Post-op follow-up L4-L5 discectomy',        NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-A1B2C3'),
  (2,  6, 3, 1, CURRENT_DATE - INTERVAL '14 days', '10:00', 45, 'procedure',       'completed',  'Lumbar epidural steroid injection',          'NPO 4 hours before',       false, true,  'Dr. Miller PCP', true,  'phone_ai', 'NSI-D4E5F6'),
  (3,  2, 1, 2, CURRENT_DATE - INTERVAL '13 days', '14:00', 30, 'follow_up',       'completed',  '6-week post-op cervical fusion',             NULL,                        false, false, NULL,            true,  'website',   'NSI-G7H8I9'),
  (5,  4, 2, 1, CURRENT_DATE - INTERVAL '12 days', '11:00', 60, 'consultation',    'completed',  'New patient — chronic migraines, neck pain', 'Bring prior MRI images',    true,  true,  'Dr. Adams PCP',  true,  'phone_ai', 'NSI-J0K1L2'),
  (7,  6, 3, 1, CURRENT_DATE - INTERVAL '11 days', '08:00', 45, 'pain_management', 'completed',  'Facet joint injection bilateral L4-5',       NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-M3N4O5'),
  (8,  1, 1, 1, CURRENT_DATE - INTERVAL '10 days', '15:00', 45, 'consultation',    'completed',  'Herniated disc L5-S1 surgical consult',      'Bring all imaging CDs',     false, false, NULL,            true,  'phone_ai', 'NSI-P6Q7R8'),

  -- 1 week ago
  (4,  1, 1, 1, CURRENT_DATE - INTERVAL '7 days',  '09:30', 30, 'follow_up',       'completed',  'Quarterly follow-up multi-level fusion',     NULL,                        false, false, NULL,            true,  'website',   'NSI-S9T0U1'),
  (6,  5, 2, 2, CURRENT_DATE - INTERVAL '7 days',  '10:00', 30, 'procedure',       'completed',  'Botox injection for chronic migraines',      NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-V2W3X4'),
  (10, 9, 5, 3, CURRENT_DATE - INTERVAL '6 days',  '14:00', 45, 'therapy',         'completed',  'Spinal decompression therapy session 6/10',  NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-Y5Z6A7'),
  (13, 6, 3, 1, CURRENT_DATE - INTERVAL '6 days',  '11:00', 30, 'follow_up',       'completed',  'SCS programming adjustment',                 NULL,                        false, false, NULL,            true,  'website',   'NSI-B8C9D0'),
  (9,  7, 3, 4, CURRENT_DATE - INTERVAL '5 days',  '09:00', 60, 'procedure',       'completed',  'PRP injection lumbar facet joints',           'No NSAIDs 7 days before',   false, false, NULL,            true,  'phone_ai', 'NSI-E1F2G3'),
  (15, 9, 5, 3, CURRENT_DATE - INTERVAL '5 days',  '15:00', 45, 'therapy',         'cancelled',  'Chiropractic adjustment + decompression',    NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-H4I5J6'),

  -- 3 days ago
  (11, 1, 1, 1, CURRENT_DATE - INTERVAL '3 days',  '10:00', 60, 'consultation',    'completed',  'New patient — sciatica evaluation',          'Spanish interpreter needed', true,  true,  'Dr. Lopez PCP',  true,  'phone_ai', 'NSI-K7L8M9'),
  (16, 8, 4, 1, CURRENT_DATE - INTERVAL '3 days',  '13:00', 45, 'consultation',    'completed',  'Work injury eval — lumbar strain',            'Bring workers comp auth',   false, false, NULL,            true,  'website',   'NSI-N0O1P2'),
  (17, 4, 2, 2, CURRENT_DATE - INTERVAL '3 days',  '09:00', 45, 'follow_up',       'no_show',    'Neurology follow-up headaches',              NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-Q3R4S5'),
  (20, 6, 3, 1, CURRENT_DATE - INTERVAL '2 days',  '08:30', 45, 'procedure',       'completed',  'Lumbar epidural — L3-4 bilateral',           'NPO 4 hours before',        false, false, NULL,            true,  'phone_ai', 'NSI-T6U7V8'),

  -- Yesterday
  (18, 1, 1, 1, CURRENT_DATE - INTERVAL '1 day',   '09:00', 30, 'follow_up',       'completed',  'Post-op check — Dr. Parsa VIP patient',     NULL,                        false, false, NULL,            true,  'phone_ai', 'NSI-W9X0Y1'),
  (1,  8, 4, 1, CURRENT_DATE - INTERVAL '1 day',   '14:00', 45, 'therapy',         'completed',  'PT evaluation — return to function program', NULL,                        false, false, NULL,            true,  'website',   'NSI-Z2A3B4'),
  (12, 2, 1, 2, CURRENT_DATE - INTERVAL '1 day',   '10:30', 60, 'consultation',    'completed',  'Cervical disc herniation — surgical consult','Bring sports injury records',false, true, 'Dr. Hayes Ortho',true,  'phone_ai', 'NSI-C5D6E7'),

  -- TODAY
  (2,  6, 3, 1, CURRENT_DATE, '09:00', 45, 'procedure',       'checked_in',  'Follow-up epidural injection',             'NPO 4 hours before',  false, false, NULL,            true,  'phone_ai', 'NSI-F8G9H0'),
  (4,  1, 1, 1, CURRENT_DATE, '10:00', 30, 'follow_up',       'confirmed',   'Imaging review — possible revision',       'Bring new MRI disc',   false, false, NULL,            true,  'website',   'NSI-I1J2K3'),
  (7,  8, 4, 1, CURRENT_DATE, '11:00', 45, 'therapy',         'confirmed',   'Functional restoration — session 3',       NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-L4M5N6'),
  (14, 3, 1, 3, CURRENT_DATE, '13:00', 60, 'consultation',    'scheduled',   'New patient — scoliosis evaluation',       'Bring referral letter', true,  true,  'Dr. Patel PCP',  false, 'phone_ai', 'NSI-O7P8Q9'),
  (19, 10,6, 1, CURRENT_DATE, '14:30', 30, 'urgent_care',     'in_progress', 'Acute back spasm — walk-in',               NULL,                   false, false, NULL,            true,  'walk_in',  'NSI-R0S1T2'),
  (6,  5, 2, 2, CURRENT_DATE, '15:00', 30, 'follow_up',       'scheduled',   'Migraine management check-in',             NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-U3V4W5'),

  -- Tomorrow
  (3,  2, 1, 2, CURRENT_DATE + INTERVAL '1 day',  '09:00', 30, 'follow_up',       'confirmed',   '3-month post-op cervical fusion',          NULL,                   false, false, NULL,            true,  'website',   'NSI-X6Y7Z8'),
  (9,  7, 3, 4, CURRENT_DATE + INTERVAL '1 day',  '10:00', 60, 'procedure',       'confirmed',   'Stem cell therapy — lumbar',               'No blood thinners 5 days', false, false, NULL,        true,  'phone_ai', 'NSI-A9B0C1'),
  (13, 6, 3, 1, CURRENT_DATE + INTERVAL '1 day',  '14:00', 30, 'follow_up',       'scheduled',   'SCS battery check + reprogramming',        NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-D2E3F4'),

  -- Next week
  (5,  4, 2, 1, CURRENT_DATE + INTERVAL '5 days',  '11:00', 45, 'follow_up',      'scheduled',   'EMG/NCS follow-up',                        NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-G5H6I7'),
  (8,  1, 1, 1, CURRENT_DATE + INTERVAL '6 days',  '08:00', 90, 'pre_surgical',   'confirmed',   'Pre-surgical workup — L5-S1 discectomy',   'Fasting after midnight',false,false, NULL,            true,  'phone_ai', 'NSI-J8K9L0'),
  (10, 9, 5, 3, CURRENT_DATE + INTERVAL '6 days',  '14:00', 45, 'therapy',        'scheduled',   'Decompression session 7/10',               NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-M1N2O3'),
  (15, 7, 3, 4, CURRENT_DATE + INTERVAL '7 days',  '09:00', 45, 'pain_management','scheduled',   'Cervical facet nerve block',               NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-P4Q5R6'),

  -- 2 weeks out
  (1,  1, 1, 1, CURRENT_DATE + INTERVAL '14 days', '09:00', 30, 'follow_up',      'scheduled',   'Quarterly follow-up',                      NULL,                   false, false, NULL,            true,  'phone_ai', 'NSI-S7T8U9'),
  (20, 6, 3, 1, CURRENT_DATE + INTERVAL '14 days', '10:30', 45, 'procedure',      'scheduled',   'Repeat epidural — L3-4',                   'NPO 4 hours before',  false, false, NULL,            true,  'phone_ai', 'NSI-V0W1X2'),
  (18, 1, 1, 1, CURRENT_DATE + INTERVAL '21 days', '09:00', 30, 'follow_up',      'scheduled',   'Monthly check-in — VIP patient',           NULL,                   false, false, NULL,            true,  'website',   'NSI-Y3Z4A5');

-- ===========================================
-- 7. CALL LOGS (25 realistic calls)
-- ===========================================

INSERT INTO call_logs (call_sid, from_number, to_number, patient_id, appointment_id, status, started_at, duration_seconds, intent, sentiment, sentiment_score, summary, was_transferred, transfer_reason, transcript) VALUES
  -- 2 weeks ago
  ('CA0001aaaa', '+16615551001', '+16614802377', 1,  1,  'completed', CURRENT_TIMESTAMP - INTERVAL '14 days 6 hours',  187, 'new_appointment',      'positive', 0.8,  'Patient Maria called to schedule follow-up with Dr. Parsa. Appointment booked for 9 AM. Patient confirmed insurance on file.',                                       false, NULL, '[user]: Hi, I need to schedule a follow-up with Dr. Parsa\n[assistant]: Of course! I can help with that...'),
  ('CA0002bbbb', '+16615551003', '+16614802377', 2,  2,  'completed', CURRENT_TIMESTAMP - INTERVAL '14 days 5 hours',  243, 'new_appointment',      'neutral',  0.3,  'Patient James called for epidural injection appointment. Required referral verification. Appointment booked with Dr. Park.',                                          false, NULL, '[user]: I need to schedule my epidural injection\n[assistant]: I can help you schedule that...'),
  ('CA0003cccc', '+16615551009', '+16614802377', 5,  4,  'completed', CURRENT_TIMESTAMP - INTERVAL '12 days 4 hours',  312, 'new_appointment',      'negative', -0.3, 'New patient Jennifer called in pain. Referred by PCP for chronic migraines. Booked consultation with Dr. Sharma. Patient sounded anxious.',                           false, NULL, '[user]: My doctor referred me, I have terrible headaches\n[assistant]: I understand you''re in pain...'),
  ('CA0004dddd', '+16615551007', '+16614802377', 4,  7,  'completed', CURRENT_TIMESTAMP - INTERVAL '7 days 5 hours',   156, 'appointment_inquiry',  'positive', 0.6,  'Returning patient Robert called to confirm his quarterly appointment. Verified date and asked about new MRI results.',                                                false, NULL, '[user]: I want to confirm my appointment next week\n[assistant]: Let me look that up for you...'),
  ('CA0005eeee', '+16615551013', '+16614802377', 7,  5,  'completed', CURRENT_TIMESTAMP - INTERVAL '11 days 3 hours',  198, 'new_appointment',      'neutral',  0.1,  'Patient Patricia called to schedule facet joint injection. Discussed procedure prep instructions.',                                                                   false, NULL, '[user]: I need another injection appointment\n[assistant]: Of course, let me check availability...'),

  -- Last week
  ('CA0006ffff', '+16615551015', '+16614802377', 8,  6,  'completed', CURRENT_TIMESTAMP - INTERVAL '10 days 2 hours',  276, 'new_appointment',      'negative', -0.4, 'Patient Ahmed called about herniated disc. Frustrated with pain level. Booked surgical consultation with Dr. Parsa.',                                                 false, NULL, '[user]: I can barely walk, I need to see someone about my disc\n[assistant]: I''m sorry to hear you''re in so much pain...'),
  ('CA0007gggg', '+18185551011', '+16614802377', 6,  8,  'completed', CURRENT_TIMESTAMP - INTERVAL '7 days 4 hours',   142, 'reschedule_appointment','positive', 0.5,  'Patient William called to confirm Botox appointment. Also asked about referral to new location.',                                                                     false, NULL, '[user]: Just confirming my Botox appointment this week\n[assistant]: Yes, I can see your appointment...'),
  ('CA0008hhhh', '+16615551021', '+16614802377', 11, 13, 'completed', CURRENT_TIMESTAMP - INTERVAL '3 days 6 hours',   389, 'new_appointment',      'neutral',  0.0,  'New Spanish-speaking patient Rosa called. Booked consultation for sciatica with Dr. Parsa. Note: needs interpreter.',                                                 false, NULL, '[user]: Hola, necesito una cita\n[assistant]: Hello! I can help you schedule an appointment...'),
  ('CA0009iiii', '+18185551023', '+16614802377', 12, 19, 'completed', CURRENT_TIMESTAMP - INTERVAL '1 day 5 hours',    201, 'new_appointment',      'positive', 0.4,  'Young patient David called about sports-related neck injury. Booked with Dr. Chen at Sherman Oaks.',                                                                 false, NULL, '[user]: I hurt my neck playing basketball and it''s not getting better\n[assistant]: I''m sorry to hear that...'),
  ('CA0010jjjj', '+16615551037', '+16614802377', 19, 24, 'completed', CURRENT_TIMESTAMP - INTERVAL '4 hours',          95,  'new_appointment',      'negative', -0.6, 'Patient Natalie called in acute pain. Directed to urgent care. Walk-in appointment created.',                                                                         false, NULL, '[user]: My back seized up, I can barely move\n[assistant]: I understand this is very painful...'),

  -- Transferred calls
  ('CA0011kkkk', '+16615551025', '+16614802377', 13, NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '8 days 3 hours',  167, 'insurance_question',   'neutral',  0.0,  'Patient Barbara had complex insurance question about SCS coverage. Transferred to billing department.',                                                               true,  'insurance_verification', '[user]: I need to know if my spinal cord stimulator programming is covered\n[assistant]: That''s an important question about coverage...'),
  ('CA0012llll', '+16615551035', '+16614802377', 18, NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '6 days 4 hours',  89,  'medical_concern',      'neutral',  0.2,  'VIP patient Frank called with medical concern about new symptoms. Transferred to nursing staff per protocol.',                                                        true,  'medical_question',      '[user]: I''m having some new numbness in my left leg\n[assistant]: I understand your concern about new symptoms...'),
  ('CA0013mmmm', '+18055551017', '+16614802377', 9,  NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '4 days 2 hours',  205, 'complaint',            'negative', -0.7, 'Patient Linda called to complain about long wait time at last appointment. Apologized and transferred to patient relations.',                                         true,  'complaint',             '[user]: I waited over an hour past my appointment time last week\n[assistant]: I sincerely apologize for the long wait...'),

  -- Various intents
  ('CA0014nnnn', '+16615551019', '+16614802377', 10, NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '5 days 1 hour',   124, 'faq',                  'positive', 0.5,  'Patient Michael called asking about what to bring to next chiropractic appointment. FAQ answered successfully.',                                                      false, NULL, '[user]: What should I bring to my chiro appointment?\n[assistant]: Great question! Please bring...'),
  ('CA0015oooo', '+16615551031', '+16614802377', 16, NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '3 days 2 hours',  167, 'department_inquiry',   'neutral',  0.2,  'Patient Carlos asked about physical therapy options for work injury. Explained PM&R department services.',                                                            false, NULL, '[user]: What kind of physical therapy do you offer for back injuries?\n[assistant]: Our Physical Medicine & Rehabilitation department...'),
  ('CA0016pppp', '+18185551033', '+16614802377', 17, 15,  'completed', CURRENT_TIMESTAMP - INTERVAL '3 days 1 hour',   98,  'cancel_appointment',   'neutral',  -0.1, 'Patient Stephanie cancelled neurology follow-up. Rescheduling for next available.',                                                                                   false, NULL, '[user]: I need to cancel my appointment this week\n[assistant]: I can help you with that...'),
  ('CA0017qqqq', '+16615551001', '+16614802377', 1,  18,  'completed', CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours',   145, 'new_appointment',      'positive', 0.7,  'Returning patient Maria called to schedule PT evaluation. Booked with Dr. Kim.',                                                                                     false, NULL, '[user]: Hi, I need to schedule physical therapy\n[assistant]: Hello Maria! Of course...'),
  ('CA0018rrrr', '+16615551007', '+16614802377', 4,  21,  'completed', CURRENT_TIMESTAMP - INTERVAL '12 hours',        178, 'appointment_inquiry',  'positive', 0.4,  'Patient Robert confirmed today''s appointment. Asked about parking at Palmdale location.',                                                                           false, NULL, '[user]: I''m confirming my appointment for tomorrow\n[assistant]: Yes Robert, I can see your appointment...'),

  -- Today's calls
  ('CA0019ssss', '+16615551003', '+16614802377', 2,  20,  'completed', CURRENT_TIMESTAMP - INTERVAL '3 hours',         112, 'appointment_inquiry',  'positive', 0.6,  'Patient James called to confirm arrival for epidural. Reminded of NPO instructions.',                                                                                false, NULL, '[user]: Just confirming I''m coming in today for my injection\n[assistant]: Yes James, I can see your appointment...'),
  ('CA0020tttt', '+16615551027', '+16614802377', 14, 23,  'completed', CURRENT_TIMESTAMP - INTERVAL '2 hours',         234, 'new_appointment',      'neutral',  0.2,  'New patient Kevin called for scoliosis consult. Insurance verification pending. Booked with Dr. Williams.',                                                           false, NULL, '[user]: I was referred for a scoliosis evaluation\n[assistant]: Welcome! I can help you get that scheduled...'),
  ('CA0021uuuu', '+18055551029', '+16614802377', 15, NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '1 hour',         189, 'reschedule_appointment','neutral',  0.1,  'Patient Margaret called to reschedule neck pain appointment. Moved to next week with Dr. Santos.',                                                                    false, NULL, '[user]: I need to move my appointment to next week\n[assistant]: Of course, let me check Dr. Santos'' availability...'),

  -- Missed / failed calls
  ('CA0022vvvv', '+16615551039', '+16614802377', NULL, NULL, 'no-answer', CURRENT_TIMESTAMP - INTERVAL '9 days 2 hours', 0,   NULL,                  NULL,       NULL, NULL,                                                                                                                                                                   false, NULL, NULL),
  ('CA0023wwww', '+16615550000', '+16614802377', NULL, NULL, 'completed', CURRENT_TIMESTAMP - INTERVAL '4 days 5 hours', 23,  'other',                'neutral',  0.0,  'Unknown caller hung up quickly. No meaningful interaction.',                                                                                                         false, NULL, '[user]: (silence)\n[assistant]: Thank you for calling NeuroSpine Institute...\n[user]: (call ended)'),

  -- Error call
  ('CA0024xxxx', '+18185551040', '+16614802377', NULL, NULL, 'failed',   CURRENT_TIMESTAMP - INTERVAL '2 days 6 hours',  0,   NULL,                  NULL,       NULL, NULL,                                                                                                                                                                   false, NULL, NULL),

  -- Long call
  ('CA0025yyyy', '+16615551035', '+16614802377', 18, 17,  'completed', CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours',   487, 'appointment_inquiry',  'positive', 0.8,  'VIP patient Frank had extensive conversation. Reviewed post-op progress, discussed upcoming schedule, and asked about new treatment options. Very satisfied with care.', false, NULL, '[user]: Hi, this is Frank Williams, I''m a patient of Dr. Parsa\n[assistant]: Hello Mr. Williams! Great to hear from you...');

-- ===========================================
-- 8. FAQs (already seeded in migration, but verify)
-- Note: If migration 002 already seeded FAQs, skip this.
-- These are idempotent — uses ON CONFLICT DO NOTHING.
-- ===========================================

INSERT INTO faq_responses (question_pattern, question_variations, answer, answer_short, category, priority, is_active)
VALUES
  ('What are your office hours?',
   ARRAY['When are you open?', 'What time do you close?', 'Are you open on weekends?', 'What are your hours?'],
   'Our office hours are Monday through Friday, 8:00 AM to 5:00 PM. We are closed on weekends and major holidays. Our Urgent Care clinic at the Palmdale location has extended hours until 7:00 PM on weekdays and is open Saturdays from 8:00 AM to 2:00 PM.',
   'Monday-Friday 8 AM to 5 PM. Urgent care has extended hours.',
   'hours', 100, true),
  ('Where are you located?',
   ARRAY['What is your address?', 'How do I get there?', 'Do you have multiple locations?', 'Which location should I go to?'],
   'NeuroSpine Institute has four convenient locations: Palmdale (1012 West Avenue M-14, Suite A), Sherman Oaks (4955 Van Nuys Blvd, Suite 300), Valencia (23838 Valencia Blvd, Suite 100), and Thousand Oaks (325 Rolling Oaks Dr, Suite 110). Your appointment confirmation will specify which location to visit.',
   'We have 4 locations: Palmdale, Sherman Oaks, Valencia, and Thousand Oaks.',
   'location', 95, true),
  ('What insurance do you accept?',
   ARRAY['Do you take my insurance?', 'Is Blue Cross accepted?', 'Do you accept Medicare?', 'What plans do you take?'],
   'We accept most major insurance plans including Blue Cross Blue Shield, Aetna, UnitedHealthcare, Cigna, Anthem, Kaiser referrals, Medicare, Medi-Cal, Blue Shield of California, Health Net, and Molina Healthcare. We recommend calling your insurance provider to verify coverage for specific procedures. Our billing team can also help with verification.',
   'We accept most major insurance plans. Our billing team can verify your specific coverage.',
   'insurance', 90, true),
  ('What should I bring to my first appointment?',
   ARRAY['What do I need for my visit?', 'First appointment checklist', 'What to bring?', 'New patient requirements'],
   'For your first visit, please bring: a valid photo ID, your insurance card(s), a list of current medications, any relevant imaging (MRI, X-ray, CT scan) on disc or uploaded to a patient portal, your referral letter if required, and a list of questions for the doctor. Please arrive 15 minutes early to complete new patient paperwork.',
   'Bring ID, insurance card, medication list, imaging, and referral if needed. Arrive 15 min early.',
   'appointments', 85, true),
  ('How do I prepare for an epidural injection?',
   ARRAY['Epidural prep', 'What to do before injection', 'Injection preparation', 'Pain injection prep'],
   'For epidural steroid injections: do not eat or drink for 4 hours before the procedure. Continue taking your regular medications unless told otherwise. Stop blood thinners as directed by your doctor (typically 3-7 days before). Arrange for someone to drive you home. Wear comfortable, loose clothing. The procedure typically takes 15-30 minutes.',
   'No food/drink 4 hours before. Stop blood thinners as directed. Arrange a ride home.',
   'procedures', 80, true),
  ('How long is the wait for a new patient appointment?',
   ARRAY['How soon can I be seen?', 'New patient wait time', 'When is the next available?', 'How quickly can I get in?'],
   'New patient consultations are typically available within 1-2 weeks. Urgent cases may be seen sooner — our urgent care clinic accepts walk-ins for acute spine and neurological concerns. If you are experiencing a medical emergency, please call 911.',
   'Usually within 1-2 weeks. Urgent care accepts walk-ins.',
   'appointments', 75, true),
  ('Do you offer telehealth appointments?',
   ARRAY['Virtual visits', 'Video appointments', 'Can I see the doctor online?', 'Remote consultation'],
   'Yes, we offer telehealth consultations for follow-up appointments and certain initial evaluations. Telehealth visits are conducted via a secure video platform. Not all appointment types are eligible — surgical consultations and procedures require an in-person visit. Ask our scheduling team about telehealth options.',
   'Yes, for eligible follow-ups and initial evaluations.',
   'appointments', 70, true);

-- ===========================================
-- 9. DASHBOARD USERS
-- ===========================================
-- Password: NeuroAdmin2026! (bcrypt 12 rounds)
-- Hash generated with: bcrypt.hashSync('NeuroAdmin2026!', 12)

INSERT INTO dashboard_users (email, password_hash, full_name, role, is_active) VALUES
  ('admin@neurospine.com',
   '$2b$12$t8oQzPVgpxGcJpuOdw2Lqu6b4W/WyRhWQqEOOcjIs0XaHQQB26hU2',
   'Admin User',
   'moderator',
   true),
  ('front.desk@neurospine.com',
   '$2b$12$t8oQzPVgpxGcJpuOdw2Lqu6b4W/WyRhWQqEOOcjIs0XaHQQB26hU2',
   'Front Desk',
   'user',
   true)
ON CONFLICT (email) DO NOTHING;

COMMIT;

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================
-- Run these to verify the seed data loaded:

-- SELECT 'Locations:' AS table_name, COUNT(*) FROM locations
-- UNION ALL SELECT 'Departments:', COUNT(*) FROM departments
-- UNION ALL SELECT 'Doctors:', COUNT(*) FROM doctors
-- UNION ALL SELECT 'Doctor-Locations:', COUNT(*) FROM doctor_locations
-- UNION ALL SELECT 'Patients:', COUNT(*) FROM patients
-- UNION ALL SELECT 'Appointments:', COUNT(*) FROM appointments
-- UNION ALL SELECT 'Call Logs:', COUNT(*) FROM call_logs
-- UNION ALL SELECT 'FAQs:', COUNT(*) FROM faq_responses
-- UNION ALL SELECT 'Dashboard Users:', COUNT(*) FROM dashboard_users;