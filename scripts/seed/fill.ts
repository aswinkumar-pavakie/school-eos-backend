// Fills NULL optional columns with realistic, consistent values. Only ever UPDATEs rows where the column IS NULL.
// Columns whose NULL is meaningful (pending decisions, open items, mutually exclusive links) are deliberately not touched.
import { withSeedTransaction } from "./lib/db";

const H = (t = "t") => `abs(hashtext(${t}.ctid::text))`;
const role = (code: string) => `(SELECT person_id FROM role_assignment WHERE role_code='${code}' AND status='ACTIVE' ORDER BY person_id LIMIT 1)`;
const P = role("PRINCIPAL"), ADM = role("ADMIN"), FIN = role("FINANCE"), NURSE = role("HEALTH_INCHARGE"), WARDEN = role("HOSTEL_WARDEN"),
  TM = role("TRANSPORT_MANAGER"), LIB = role("LIBRARY"), MEDIA = role("MEDIA_ROOM"), COORD = role("ACADEMIC_COORDINATOR"), SPADM = role("SPORTS_ADMIN");
const D = (t = "t", days = 240) => `(TIMESTAMPTZ '2025-07-01 10:00+05:30' + (${H(t)} % ${days}) * interval '1 day')`;
const DD = (t = "t", days = 240) => `(DATE '2025-07-01' + (${H(t)} % ${days}))`;
const path = (folder: string, ext: string, t = "t") => `('${folder}/' || ${t}.ctid::text || '-' || substr(md5(${t}.ctid::text), 1, 10) || '.${ext}')`;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const pick = (arr: string[], t = "t") => `(ARRAY[${arr.map(q).join(",")}])[1 + ${H(t)} % ${arr.length}]`;

type Spec = [table: string, col: string, expr: string, extraWhere?: string];
const S: Spec[] = [];
const add = (table: string, cols: Record<string, string>, extraWhere?: string) => { for (const [c, e] of Object.entries(cols)) S.push([table, c, e, extraWhere]); };

// pools computed once as InitPlans
const TEACH = `((ARRAY(SELECT person_id FROM staff WHERE is_teaching ORDER BY person_id))[1 + ${H()} % (SELECT count(*) FROM staff WHERE is_teaching)])`;
const STAFFP = `((ARRAY(SELECT person_id FROM staff ORDER BY person_id))[1 + ${H()} % (SELECT count(*) FROM staff)])`;
const TEACHSTAFF = `((ARRAY(SELECT id FROM staff WHERE is_teaching ORDER BY id))[1 + ${H()} % (SELECT count(*) FROM staff WHERE is_teaching)])`;
const GUARD = `((ARRAY(SELECT DISTINCT person_id FROM guardian_link ORDER BY person_id))[1 + ${H()} % (SELECT count(DISTINCT person_id) FROM guardian_link)])`;

// ---------- people ----------
add("academic_coordinator_login", { created_by: ADM });
add("class_teacher_login", { created_by: ADM });
add("class_teacher_login_assignment", { assigned_by: P });
add("guardian_link", { created_by: ADM });
add("school", { logo_object_key: q("school/pavakie-logo.png") });
add("department", { hod_staff_id: `(SELECT s.id FROM staff s WHERE s.is_teaching AND s.department_id = t.id ORDER BY s.id LIMIT 1)` });
add("house", { captain_student_id: `(SELECT e.student_id FROM student_enrolment e JOIN section sec ON sec.id=e.section_id JOIN grade g ON g.id=sec.grade_id WHERE g.name='12' ORDER BY md5(e.student_id::text||t.id::text) LIMIT 1)` });
add("hostel", { warden_staff_id: `(SELECT s.id FROM staff s JOIN role_assignment r ON r.person_id=s.person_id WHERE r.role_code='HOSTEL_WARDEN' ORDER BY s.id LIMIT 1)` });
add("person", {
  photo_object_key: `('photos/person/' || t.id || '.jpg')`,
  created_by: ADM, updated_by: ADM,
  preferred_locale: pick(["en", "ta"]),
  gender: pick(["MALE", "FEMALE"]),
  mobile: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))`,
  address_line2: pick(["Anna Nagar", "KK Nagar", "Tallakulam", "Thirunagar", "Vilangudi", "Simmakkal", "S.S. Colony", "Bibikulam"]),
  city: q("Madurai"), district: q("Madurai"), state: q("Tamil Nadu"),
  pincode: pick(["625001", "625002", "625003", "625009", "625010", "625014", "625016", "625020"]),
  address_line1: `((${H()} % 240 + 1)::text || ', ' || (ARRAY['Gandhi Street','Nehru Road','Bharathiyar Street','Kamarajar Salai','Periyar Street','Anna Salai','Temple Road','Market Street'])[1 + ${H()} % 8])`,
});
S.push(["person", "date_of_birth", `(DATE '1979-01-01' + (${H()} % 5800))`, `t.id IN (SELECT person_id FROM guardian_link)`]);
S.push(["person", "date_of_birth", `(DATE '1968-01-01' + (${H()} % 11000))`, `t.date_of_birth IS NULL`]);
S.push(["user_credential", "last_login_at", `(TIMESTAMPTZ '2026-09-01 08:00+05:30' + (${H()} % 20) * interval '1 day')`]);

// student
add("student", {
  created_by: ADM, updated_by: ADM,
  mother_tongue: `(CASE WHEN medium_id = (SELECT id FROM medium WHERE code='TAM') THEN 'Tamil' ELSE pick END)`.replace("pick", pick(["Tamil", "Tamil", "Telugu", "Malayalam"])),
  language_subject_choice: q("Tamil"),
  religion: pick(["Hindu", "Hindu", "Hindu", "Christian", "Muslim"]),
  previous_school: `(CASE WHEN admission_date < DATE '2025-06-01' THEN 'Continuing student' ELSE 'Previous school in Madurai' END)`,
  state_student_id: `('EMIS' || lpad((${H()} % 100000000)::text, 10, '0'))`,
  bank_account_ref: `('BA-' || substr(md5(t.id::text), 1, 12))`,
  emergency_contact_name: `(SELECT p.first_name || ' ' || coalesce(p.last_name,'') FROM guardian_link g JOIN person p ON p.id=g.person_id WHERE g.student_id=t.id AND g.is_primary_contact LIMIT 1)`,
  emergency_contact_phone: `(SELECT p.mobile FROM guardian_link g JOIN person p ON p.id=g.person_id WHERE g.student_id=t.id AND g.is_primary_contact LIMIT 1)`,
});
add("student_enrolment", { remarks: q("Regular admission for the academic year") });
add("emergency_treatment_consent", { valid_until: q("2026-06-30"), document_key: path("consents/emergency-treatment", "pdf") });
add("health_profile", {
  family_doctor: pick(["Dr. R. Subramanian", "Dr. K. Meenakshi", "Dr. S. Ganesan", "Dr. P. Lakshmi"]),
  doctor_phone: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))`,
  insurance_ref: `('INS-' || substr(md5(t.ctid::text), 1, 10))`, notes: q("Annual health screening completed; no concerns noted."), updated_by: NURSE,
});
add("allergy", { reaction: `(CASE category WHEN 'FOOD' THEN 'Hives, swelling and stomach upset' WHEN 'DRUG' THEN 'Skin rash and breathing difficulty' ELSE 'Sneezing and watery eyes' END)`, treatment: q("Avoid allergen; antihistamine on doctor advice"), verified_by: NURSE, source: q("PARENT_DECLARED") });
add("chronic_condition", { diagnosed_on: DD("t", 300), notes: q("Managed with regular medication and school nurse monitoring."), emergency_protocol: q("Inform parent immediately and take student to sickbay.") });
add("medication_schedule", { instructions: q("Give after food as prescribed by the doctor."), end_date: q("2026-06-30"), prescribed_by: pick(["Dr. R. Subramanian", "Dr. K. Meenakshi"]), prescription_key: path("prescriptions", "pdf"), created_by: NURSE });
add("medication_administration", { reason: q("Scheduled dose as per prescription") });
add("infirmary_visit", { vitals: `('{"temp_c": ' || (36.5 + (${H()} % 25) / 10.0)::text || ', "pulse": ' || (70 + ${H()} % 25)::text || '}')::jsonb`, outcome: q("Recovered after rest; resumed classes") });
add("infirmary_visit", { parent_notified_at: `(t.visited_at + interval '20 minutes')` }, `1=0`);
add("sickbay_admission", { diagnosis_note: q("Fever and fatigue; observed and discharged after recovery"), parent_notified_at: `(t.admitted_at + interval '30 minutes')` });
add("sickbay_observation", { vitals: `('{"temp_c": ' || (37 + (${H()} % 15) / 10.0)::text || ', "pulse": ' || (74 + ${H()} % 20)::text || '}')::jsonb` });
add("immunisation_record", { recorded_by: NURSE, certificate_key: path("immunisation", "pdf") });
add("hospital_referral", { accompanied_by: NURSE, parent_informed_at: `${D()}`, parent_arrived_at: `${D()} + interval '45 minutes'`, returned_at: `${D()} + interval '4 hours'`, discharge_summary_key: path("hospital", "pdf"), cost_paise: q("250000").replace(/'/g, "") });
add("fitness_clearance", { restrictions: q("None"), isolation_until: null as any });
add("observation", {});
add("discipline_incident", { action_taken: q("Counselled and parents informed"), parent_notified_at: `(t.incident_date::timestamp + interval '15 hours')`, escalated_to: P });
add("student_follow_up", { owner_person_id: TEACH });
add("student_duty_assignment", { duties: q("Assist the class teacher in daily classroom routines") });
add("student_group_allotment", { allotted_by: COORD });
add("student_leave_request", { attachment_object_key: path("leave-notes", "pdf"), attachment_file_name: q("leave_letter.pdf"), decided_by: TEACH, decided_at: `${D()}` });
add("student_event_participant", {});

// ---------- academics ----------
add("exam", { term: `(CASE WHEN t.exam_type IN ('UNIT_TEST','QUARTERLY') THEN 'Term 1' ELSE 'Term 2' END)`, published_by: P });
add("exam_subject", { start_time: q("10:00"), duration_minutes: `(CASE WHEN t.exam_id IN (SELECT id FROM exam WHERE exam_type='UNIT_TEST') THEN 60 ELSE 120 END)`, room: pick(["Room 101", "Room 102", "Room 103", "Room 201", "Room 202"]) });
add("exam_verification", { comment: q("Marks verified against the answer scripts."), decided_by: COORD, decided_at: `${D()}` });
add("grade_band", { remark: `(CASE t.grade_label WHEN 'A1' THEN 'Outstanding' WHEN 'A2' THEN 'Excellent' WHEN 'B1' THEN 'Very Good' WHEN 'B2' THEN 'Good' WHEN 'C1' THEN 'Above Average' WHEN 'C2' THEN 'Average' WHEN 'D' THEN 'Needs Improvement' ELSE 'Needs Support' END)` });
add("homework", { description: q("Complete the assigned exercises and revise the chapter."), attachment_keys: null as any });
add("lesson_plan", { object_key: path("lesson-plans", "pdf"), submitted_at: `${D()}`, approved_by: COORD, approved_at: `${D()} + interval '2 days'` });
add("lms_folder", { description: q("Learning resources for the class") });
add("lms_lesson_plan", { week_start: `date_trunc('week', ${D()})::date`, attachment_object_key: path("lms/lesson-plans", "pdf"), attachment_file_name: q("lesson_plan.pdf") });
add("lms_material", { chapter_ref: q("Chapter 1"), uploaded_by: TEACH, subject_offering_id: `(SELECT so.id FROM subject_offering so WHERE so.subject_id=t.subject_id ORDER BY so.id LIMIT 1)`, external_url: q("https://www.tnscert.org/reference") });
add("lms_task", { description: q("Complete the task and submit before the due date."), attachment_object_key: path("lms/tasks", "pdf"), attachment_file_name: q("task.pdf") });
add("mark", { entered_by: TEACH, verified_by: COORD, verified_at: `(TIMESTAMPTZ '2025-12-10 12:00+05:30')` });
add("mark_correction", {});
add("subject", { applies_to_stage: null as any });
add("syllabus_unit", { weightage_pct: `(round((100.0 / 6)::numeric, 2))` });
add("timetable_slot", { room: `('Room ' || (100 + ${H()} % 60)::text)` });
add("board_exam_registration", { fee_paid_paise: `(CASE WHEN exam_level='SSLC' THEN 17500 ELSE 22500 END)`, fee_remitted_on: q("2025-12-15"), hall_ticket_key: path("hall-tickets", "pdf") });
add("observation", { subject_offering_id: `(SELECT so.id FROM subject_offering so JOIN student_enrolment e ON e.section_id=so.section_id WHERE e.student_id=t.student_id ORDER BY so.id LIMIT 1)` });
add("attendance_session", { marked_by: TEACH, marked_at: `(t.session_date::timestamp + interval '9 hours 15 minutes')`, device_sync_key: `('sync-' || t.ctid::text)` });
add("attendance_record", { reason: pick(["Fever", "Family function", "Stomach ache", "Out of station", "Cold and cough"]) }, `status = 'ABSENT'`);
add("attendance_record", { reason: q("Arrived late due to transport delay") }, `status = 'LATE'`);
add("competition", {});

// ---------- finance ----------
add("fee_demand", { fee_head_id: `(SELECT id FROM fee_head WHERE code ILIKE '%TUITION%' OR name ILIKE '%tuition%' ORDER BY id LIMIT 1)` });
add("fee_structure", { medium_id: `(SELECT id FROM medium WHERE code='ENG')` });
add("payment", { gateway_ref: `('pay_' || substr(md5(t.id::text), 1, 14))`, reconciled_at: `(t.confirmed_at + interval '1 day')`, collected_by: FIN }, `t.state = 'CONFIRMED'`);
add("receipt", { pdf_object_key: path("receipts", "pdf") });
add("refund", { refund_to_source_ref: `('RFD-' || substr(md5(t.id::text), 1, 12))`, processed_at: `${D()}` });
add("expense", { bill_object_key: path("expenses/bills", "pdf"), recorded_by: FIN });
add("concession", {});
add("payroll_period", { gross_total_paise: `(SELECT sum(gross_paise) FROM payslip p WHERE p.payroll_period_id = t.id)`, net_total_paise: `(SELECT sum(net_paise) FROM payslip p WHERE p.payroll_period_id = t.id)` });
add("payslip", { pdf_object_key: path("payslips", "pdf") });
add("salary_config", {});
add("wallet_topup", { payment_id: null as any, gateway_ref: `('topup_' || substr(md5(t.id::text), 1, 14))`, initiated_by_person_id: `(SELECT s.person_id FROM student s WHERE s.id = (SELECT w.student_id FROM wallet w WHERE w.id=t.wallet_id))`, confirmed_at: `(t.initiated_at + interval '1 minute')` });
add("wallet_limit", { set_by_person_id: P });
add("wallet_auto_topup", { set_by_person_id: `(SELECT g.person_id FROM guardian_link g JOIN wallet w ON w.student_id=g.student_id WHERE w.id=t.wallet_id AND g.is_primary_contact LIMIT 1)` });
add("wallet_item_block", { set_by_person_id: `(SELECT g.person_id FROM guardian_link g JOIN wallet w ON w.student_id=g.student_id WHERE w.id=t.wallet_id AND g.is_primary_contact LIMIT 1)`, allergen_tag: q("FRIED") });
add("wallet_ledger_entry", { created_by: FIN, reference_type: q("CANTEEN_SALE") });
add("canteen_transaction", { performed_by: FIN, idempotency_key: `('ctx-' || t.id::text)` });
add("canteen_product", { created_by: ADM });
add("vendor", { contract_ref: `('CTR-2025-' || lpad((${H()} % 900 + 100)::text, 3, '0'))`, bank_account_ref: `('BA-' || substr(md5(t.ctid::text), 1, 12))` });
add("vendor_menu_item", { allergen_tags: null as any });
add("vendor_settlement", { paid_on: `(t.period_end + 3)` });
add("gateway_order", {});
add("reconciliation", { settlement_object_key: path("reconciliation", "csv"), run_at: `${D()}`, closed_by: FIN, closed_at: `${D()} + interval '1 day'` });
add("reconciliation_entry", {});

// ---------- HR ----------
add("staff", {
  created_by: ADM, updated_by: ADM,
  teacher_category: `(CASE WHEN is_teaching THEN (ARRAY['PGT','TGT','PRT'])[1 + ${H()} % 3] ELSE 'NON_TEACHING' END)`,
  post_type: q("MANAGEMENT"), staff_room: pick(["Staff Room A", "Staff Room B", "Staff Room C"]),
  university: pick(["Madurai Kamaraj University", "Tamil Nadu Teachers Education University", "Anna University", "University of Madras"]),
  year_of_graduation: `(2000 + ${H()} % 20)`,
  areas_of_expertise: `(COALESCE(specialization, designation, 'School administration'))`,
  certifications: q("Subject certification and CPD programmes"), workshops_training: q("NEP 2020 orientation; classroom management workshop"),
  achievements_awards: q("Recognised for consistent student outcomes"),
  emergency_contact_name: q("Spouse / Family member"), emergency_contact_phone: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))`,
  state_teacher_id: `(CASE WHEN is_teaching THEN 'TN-TCH-' || lpad((${H()} % 1000000)::text, 7, '0') END)`,
  experience_years: `(GREATEST(1, (CURRENT_DATE - date_of_joining) / 365 + 2))`, highest_qualification: `(CASE WHEN is_teaching THEN 'B.Ed' ELSE 'Bachelor''s Degree' END)`,
  blood_group: pick(["A+", "B+", "O+", "AB+", "O-", "A-"]), employment_type: q("PERMANENT"),
  department_id: `(SELECT id FROM department ORDER BY md5(id::text || t.id::text) LIMIT 1)`, campus_id: `(SELECT id FROM campus LIMIT 1)`,
  tet_net_cleared: `(is_teaching)`, specialization: `(COALESCE(designation, 'School administration'))`,
});
add("staff_appraisal", { attachment_object_key: path("appraisals", "pdf"), attachment_file_name: q("appraisal.pdf"), reviewed_at: `${D()}` });
add("staff_attendance_event", { device_id: q("BIO-GATE-01"), confidence_score: `(90 + ${H()} % 10)`, device_idempotency_key: `('sae-' || t.ctid::text)` });
add("staff_hr_request", { description: q("Request raised through the staff portal."), attachment_object_key: path("hr-requests", "pdf"), attachment_file_name: q("supporting_document.pdf") });
add("staff_leave_request", { attachment_object_key: path("leave", "pdf"), attachment_file_name: q("leave_document.pdf"), decided_by: P, decided_at: `${D()}` });
add("staff_meeting_booking", { decided_by: TEACH, decided_at: `${D()}`, livekit_room_name: `('room-' || substr(md5(t.ctid::text), 1, 10))`, call_started_at: `${D()}`, call_ended_at: `${D()} + interval '20 minutes'`, recording_url: `('https://media.sis.in/recordings/' || substr(md5(t.ctid::text), 1, 12) || '.mp4')` });
add("role_assignment", { assigned_by: ADM });

// ---------- transport ----------
add("vehicle", { chassis_no: `('MB1' || upper(substr(md5(t.id::text), 1, 14)))`, engine_no: `('ENG' || upper(substr(md5(t.id::text), 15, 10)))`, engine_desc: q("BS-VI diesel, 5.7L"), wheelbase_mm: `4200`, tyre_size: q("10.00 R20"), tyre_count: `6`, rto_office: q("RTO Madurai (TN-58)"), parking_bay: `('Bay-' || (1 + ${H()} % 12))` });
add("vehicle_document", { object_key: path("vehicle-docs", "pdf") });
add("vehicle_fuel_log", { recorded_by: TM });
add("vehicle_maintenance", { vendor: q("Madurai Auto Service Centre"), notes: q("Periodic service completed; no defects found.") });
add("vehicle_route_assignment", {});
add("driver", { police_verification_ref: `('PV/MDU/2025/' || lpad((${H()} % 9000 + 1000)::text, 4, '0'))`, verification_expiry: q("2027-03-31"), blood_group: pick(["A+", "B+", "O+", "AB+"]) });
add("driver_document", { object_key: path("driver-docs", "pdf") });
add("attendant", { police_verification_ref: `('PV/MDU/2025/' || lpad((${H()} % 9000 + 1000)::text, 4, '0'))`, verification_expiry: q("2027-03-31") });
add("coach", { police_verification_ref: `('PV/MDU/2025/' || lpad((${H()} % 9000 + 1000)::text, 4, '0'))`, verification_expiry: q("2027-03-31") });
add("gps_device", { firmware: q("v2.4.1"), last_seen_at: `(TIMESTAMPTZ '2026-09-24 08:00+05:30')` });
add("route_stop", { latitude: `(9.90 + (${H()} % 1000) / 10000.0)`, longitude: `(78.10 + (${H()} % 1000) / 10000.0)` });
add("telemetry_event", {}); add("telemetry_event_default", {});
add("trip", { started_at: `(t.trip_date::timestamp + CASE WHEN direction='PICKUP' THEN interval '6 hours 45 minutes' ELSE interval '15 hours 45 minutes' END)`, completed_at: `(t.trip_date::timestamp + CASE WHEN direction='PICKUP' THEN interval '7 hours 50 minutes' ELSE interval '16 hours 50 minutes' END)`, scheduled_arrival_at: `(t.trip_date::timestamp + CASE WHEN direction='PICKUP' THEN interval '7 hours 45 minutes' ELSE interval '16 hours 45 minutes' END)`, started_by: TM });
add("transport_alert", { detail: q("Automated alert raised and reviewed by the transport manager."), acknowledged_by: TM, acknowledged_at: `(t.raised_at + interval '10 minutes')`, resolved_at: `(t.raised_at + interval '40 minutes')` });
add("student_transport_allocation", {});
add("terminal", { firmware_version: q("v1.8.2"), last_seen_at: `(TIMESTAMPTZ '2026-09-24 08:00+05:30')`, last_sync_at: `(TIMESTAMPTZ '2026-09-24 07:55+05:30')` });
add("card_tap_event", {});
add("id_card", { issued_by: ADM, print_batch: q("BATCH-2025-06") });
add("gate_movement", { recorded_by: WARDEN });
add("gate_pass", { parent_notified_at: `(t.valid_from - interval '1 hour')`, approved_by: WARDEN }, `is_emergency = false`);

// ---------- hostel / campus ----------
add("hostel_allocation", { allocated_by: WARDEN });
add("hostel_call_request", { decided_by_person_id: WARDEN, decided_at: `${D()}` });
add("call_request", { decided_by_person_id: TEACH, decided_at: `${D()}` });
add("hostel_incident", { action_taken: q("Warden counselled the students and informed parents."), parent_notified_at: `(t.occurred_at + interval '1 hour')` });
add("hostel_study_attendance", { recorded_by: WARDEN });
add("hostel_study_session", { created_by_staff_id: `(SELECT s.id FROM staff s JOIN role_assignment r ON r.person_id=s.person_id WHERE r.role_code='HOSTEL_WARDEN' ORDER BY s.id LIMIT 1)` });
add("hostel_visitor", { id_proof_ref: `('AADHAAR-XXXX-' || lpad((${H()} % 10000)::text, 4, '0'))`, phone: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))`, exited_at: `(t.entered_at + interval '1 hour')`, recorded_by: WARDEN });
add("outing_request", { requested_by: `(SELECT g.person_id FROM guardian_link g WHERE g.student_id=t.student_id AND g.is_primary_contact LIMIT 1)`, destination: q("Home, Madurai"), request_type: q("GATE_PASS"), purpose_category: q("HOME_LEAVE"), decided_by: WARDEN, decided_at: `(t.requested_at + interval '2 hours')`, decision_note: q("Approved as per parent request."), called_by_name: q("Parent / Guardian"), called_by_phone: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))`, actual_return_at: `(t.expected_return - interval '30 minutes')` }, `state = 'APPROVED'`);

// ---------- library ----------
add("library_book", { description: q("Reading and reference book for students."), cover_image_url: `('https://media.sis.in/library/covers/' || substr(md5(t.id::text), 1, 12) || '.jpg')`, created_by: LIB });
add("library_ebook", { description: q("Digital reading resource."), cover_image_url: `('https://media.sis.in/library/ebooks/' || substr(md5(t.id::text), 1, 12) || '.jpg')`, created_by: LIB });
add("library_book_copy", { shelf_location: `('Rack-' || (1 + ${H()} % 40) || '-S' || (1 + ${H()} % 6))`, acquisition_date: q("2025-06-01"), acquisition_cost_paise: `(15000 + ${H()} % 35000)` });
add("library_config", { updated_by: LIB });
add("library_issue", { returned_to: LIB }, `returned_at IS NOT NULL`);
add("library_fine", {}, `1=0`);

// ---------- sports ----------
add("equipment", { sport_id: `(SELECT id FROM sport ORDER BY md5(id::text || t.id::text) LIMIT 1)` });
add("equipment_issue", { issued_by: SPADM, issue_reason: q("Practice session"), due_on: `(t.issued_on + 14)`, returned_on: `(t.issued_on + 10)`, condition_on_return: q("Good") });
add("tournament", { format: pick(["KNOCKOUT", "LEAGUE"]) });
add("sports_achievement", { certificate_key: path("sports/certificates", "pdf") });
add("sports_trial", { notes: q("Assessed for speed, endurance and technique."), created_by: SPADM, updated_by: SPADM });
add("team", { house_id: `(SELECT id FROM house ORDER BY md5(id::text || t.id::text) LIMIT 1)` });

// ---------- misc ops ----------
add("announcement", { body_regional: q("அனைத்து பெற்றோர்களுக்கும் முக்கிய அறிவிப்பு. விவரங்களுக்கு பள்ளி அலுவலகத்தைத் தொடர்பு கொள்ளவும்."), expires_at: `(t.publish_at + interval '30 days')`, approved_by: P });
add("calendar_event", { description: `(t.title || ' - school calendar event')`, created_by: P });
add("approval_policy", { sla_hours: `48` });
add("approval_step", { comment: q("Approved as per school policy.") }, `decision IS NOT NULL`);
add("bulk_import_job", { row_errors: `'[]'::jsonb`, validated_at: `${D()}` });
add("campus_food_order", { pickup_time: q("13:00"), notes: q("For staff meeting") });
add("campus_stationery_order", { notes: q("For classroom and office use") });
add("campus_copy_center_order", { needed_by: `(CURRENT_DATE + 3)` });
add("campus_medical_appointment", { preferred_time: q("11:00") });
add("camp", { description: `(t.name || ' organised for students and staff')`, created_by: P });
add("camp_partner", { contact_person: pick(["Dr. S. Kumar", "Ms. R. Devi"]), phone: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))`, email: `('camp' || (${H()} % 900) || '@partner.in')`, verification_ref: `('VER-' || substr(md5(t.id::text), 1, 8))` });
add("community", { description: q("Community of parents and alumni supporting school activities."), created_by: P });
add("community_activity", { description: q("Community engagement activity."), created_by: P });
add("community_membership", { added_by: P });
add("community_participation", { contribution_note: q("Participated actively."), recorded_by: TEACH });
add("community_announcement", {});
add("complaint_update", {});
add("document_request", { decided_by: ADM, decided_at: `${D()}`, decision_note: q("Processed by the school office.") }, `state <> 'PENDING'`);
add("document_retention_policy", { retention_years: `7` }, `1=0`);
add("google_account_connection", { google_user_id: `('gid-' || substr(md5(t.id::text), 1, 16))`, encryption_key_id: q("kms-key-2025-01"), last_used_at: `(TIMESTAMPTZ '2026-09-20 09:00+05:30')` });
add("inventory_item", { location: pick(["Store Room A", "Store Room B", "Lab 1", "Office"]), description: q("School asset."), acquisition_date: q("2025-06-01"), acquisition_cost_paise: `(500000 + ${H()} % 2000000)`, vendor: q("Sri Kaveri Traders"), created_by: ADM });
add("meal_pre_order", { collected_at: `(t.for_date::timestamp + interval '13 hours')` });
add("media_post", { first_comment: q("Proud moments from our school!"), publish_at: `(t.published_at)` });
add("media_post_comment", { commenter_label: q("Parent"), staff_reply: q("Thank you for your support!"), staff_replied_by: MEDIA, staff_replied_at: `(t.created_at + interval '1 day')` });
add("media_team_member", { email: `('media' || (${H()} % 90) || '@sis.in')`, phone: `('9' || lpad((${H()} % 1000000000)::text, 9, '0'))` });
add("medical_escalation", { contacted_name: q("Parent / Guardian"), response: q("Acknowledged and on the way.") });
add("notification", { about_student_id: null as any });
add("online_class", { description: q("Online class conducted through Google Meet."), meeting_url: `('https://meet.google.com/' || substr(md5(t.id::text), 1, 3) || '-' || substr(md5(t.id::text), 4, 4) || '-' || substr(md5(t.id::text), 8, 3))`, google_meet_id: `(substr(md5(t.id::text), 1, 10))`, google_calendar_event_id: `('evt' || substr(md5(t.id::text), 1, 20))`, created_by: `(SELECT s.person_id FROM staff s WHERE s.id = t.faculty_staff_id)`, updated_by: `(SELECT s.person_id FROM staff s WHERE s.id = t.faculty_staff_id)`, livekit_room_name: `('oc-' || substr(md5(t.id::text), 1, 10))`, call_started_at: `(t.scheduled_date::timestamp + t.start_time)`, call_ended_at: `(t.scheduled_date::timestamp + t.end_time)`, recording_url: `('https://media.sis.in/recordings/' || substr(md5(t.id::text), 1, 12) || '.mp4')`, recording_added_by: `(SELECT s.person_id FROM staff s WHERE s.id = t.faculty_staff_id)`, recording_added_at: `(t.scheduled_date::timestamp + t.end_time + interval '1 hour')` });
add("permission_activity", { description: q("Permission required for the school activity.") });
add("permission_request", { responded_by_person_id: `(SELECT g.person_id FROM guardian_link g WHERE g.student_id=t.student_id AND g.is_primary_contact LIMIT 1)`, signed_at: `${D()}` }, `status = 'CONSENTED'`);
add("pos_transaction", { session_id: null as any });
add("purchase_order", { expected_on: `(t.placed_on + 7)` });
add("purchase_order_event", { note: q("Delivered and verified against the purchase order.") });
add("purchase_request", { description: q("Required for school operations."), vendor_name: q("Sri Kaveri Traders"), estimated_amount_paise: `(1000000 + ${H()} % 4000000)`, needed_by: `(CURRENT_DATE + 30)` });
add("repair_request", { location: pick(["Classroom block", "Science lab", "Computer lab", "Office"]), assigned_to_person_id: TM, assigned_on: `(t.requested_on + 1)`, completed_on: `(t.requested_on + 3)`, repair_action: q("Repaired and tested."), completion_notes: q("Work completed satisfactorily."), cost_paise: `(50000 + ${H()} % 200000)` }, `status = 'COMPLETED'`);
add("shoot_assignment", { venue: q("School Campus"), notes: q("Photo and video coverage of the event.") });
add("sos_incident", { acknowledged_by: WARDEN, acknowledged_at: `(t.raised_at + interval '2 minutes')`, resolved_at: `(t.raised_at + interval '15 minutes')` });
add("user_session", { device_label: pick(["Redmi Note 11", "Samsung Galaxy M31", "iPhone 12", "Chrome on Windows"]), last_seen_at: `${D()}` });
add("sports_injury_incident", { sport_id: `(SELECT id FROM sport ORDER BY md5(id::text || t.id::text) LIMIT 1)`, description: q("Minor sprain during practice; first aid given."), guardian_informed_at: `(t.incident_date::timestamp + interval '16 hours')`, created_by: SPADM, updated_by: SPADM });
add("sports_selection_window", { notes: q("Open to all eligible students."), created_by: SPADM, updated_by: SPADM });
add("sports_practice_plan", { created_by: SPADM, updated_by: SPADM });
add("sports_result_entry", { verified_by: SPADM, verified_at: `${D()}`, created_by: SPADM, updated_by: SPADM });
add("sports_substitute_coach", { created_by: SPADM, updated_by: SPADM });
add("sports_profile", { position_or_role: pick(["Forward", "Defender", "All-rounder", "Sprinter", "Midfielder"]) });
add("fixture_result", { result_detail: q("Match completed; result recorded by the scorer."), recorded_by: SPADM });
add("team_member", { role: q("PLAYER") });
add("training_attendance", { recorded_by: SPADM });
add("training_session", {});

async function main() {
  await withSeedTransaction(true, async (ctx) => {
    let ok = 0, rows = 0;
    for (const [table, col, expr, extra] of S) {
      if (expr === null || expr === undefined) continue;
      const sql = `UPDATE "${table}" AS t SET "${col}" = ${expr} WHERE t."${col}" IS NULL${extra ? ` AND (${extra})` : ""}`;
      const r: any = await ctx.query(sql);
      if (r.rowCount !== undefined) { ok++; rows += r.rowCount; }
    }
    console.log(`fill: ${ok} statements applied, ${rows} cell updates.`);
  });
}
main().catch((e) => { console.error("FILL FAILED:", e); process.exit(1); });
