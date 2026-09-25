// Populates the remaining empty tables from data that already exists (INSERT..SELECT only, no deletes)
// and fixes the few column updates the first fill pass could not apply.
import { withSeedTransaction } from "./lib/db";

const role = (code: string) => `(SELECT person_id FROM role_assignment WHERE role_code='${code}' AND status='ACTIVE' ORDER BY person_id LIMIT 1)`;
const P = role("PRINCIPAL"), NURSE = role("HEALTH_INCHARGE"), TM = role("TRANSPORT_MANAGER"), WARDEN = role("HOSTEL_WARDEN"), COORD = role("ACADEMIC_COORDINATOR");
const PRIMARY_GUARDIAN = (studentExpr: string) => `(SELECT g.person_id FROM guardian_link g WHERE g.student_id = ${studentExpr} AND g.is_primary_contact ORDER BY g.person_id LIMIT 1)`;

const STEPS: [string, string][] = [
  // ---- fixes for the first pass ----
  ["grade_band.remark", `UPDATE grade_band SET remark = CASE label WHEN 'A1' THEN 'Outstanding' WHEN 'A2' THEN 'Excellent' WHEN 'B1' THEN 'Very Good' WHEN 'B2' THEN 'Good' WHEN 'C1' THEN 'Above Average' WHEN 'C2' THEN 'Average' WHEN 'D' THEN 'Needs Improvement' ELSE 'Needs Support' END WHERE remark IS NULL`],
  ["vendor_settlement.paid_on", `UPDATE vendor_settlement SET paid_on = period_to + 3 WHERE paid_on IS NULL`],
  ["staff_attendance_event.confidence_score", `UPDATE staff_attendance_event t SET confidence_score = 0.900 + (abs(hashtext(t.ctid::text)) % 90) / 1000.0 WHERE confidence_score IS NULL`],
  ["transport_alert.detail", `UPDATE transport_alert SET detail = '{"note":"Automated alert raised and reviewed by the transport manager."}'::jsonb WHERE detail IS NULL`],
  ["google_account_connection", `UPDATE google_account_connection t SET google_user_id = COALESCE(google_user_id, 'gid-' || substr(md5(t.ctid::text), 1, 16)), encryption_key_id = COALESCE(encryption_key_id, 'kms-key-2025-01'), last_used_at = COALESCE(last_used_at, TIMESTAMPTZ '2026-09-20 09:00+05:30')`],
  ["sos_incident.ack", `UPDATE sos_incident SET acknowledged_by = ${WARDEN}, acknowledged_at = raised_at + interval '2 minutes', resolved_at = raised_at + interval '15 minutes' WHERE acknowledged_by IS NULL`],
  ["fixture_result.result_detail", `UPDATE fixture_result SET result_detail = '{"summary":"Match completed; result recorded by the scorer."}'::jsonb WHERE result_detail IS NULL`],

  // ---- bus boarding (BOARD first: ALIGHT requires an earlier BOARD) ----
  ["bus_boarding_event BOARD", `INSERT INTO bus_boarding_event (trip_id, student_id, route_stop_id, direction, source, is_wrong_bus, attendant_person_id, recorded_at)
    SELECT tr.id, sta.student_id, sta.route_stop_id, 'BOARD', 'CARD_TAP', false, att.person_id, tr.started_at + ((abs(hashtext(sta.student_id::text)) % 40) * interval '1 minute')
      FROM trip tr JOIN vehicle_route_assignment vra ON vra.id = tr.assignment_id
      JOIN route_stop rs ON rs.route_id = vra.route_id
      JOIN student_transport_allocation sta ON sta.route_stop_id = rs.id AND sta.status = 'ACTIVE' AND sta.direction IN (tr.direction, 'BOTH')
      LEFT JOIN attendant att ON att.id = vra.attendant_id
     WHERE abs(hashtext(sta.student_id::text || tr.id::text)) % 100 < 93`],
  ["bus_boarding_event ALIGHT", `INSERT INTO bus_boarding_event (trip_id, student_id, route_stop_id, direction, source, is_wrong_bus, attendant_person_id, recorded_at)
    SELECT b.trip_id, b.student_id, b.route_stop_id, 'ALIGHT', 'CARD_TAP', false, b.attendant_person_id, tr.completed_at - ((abs(hashtext(b.student_id::text)) % 5) * interval '1 minute')
      FROM bus_boarding_event b JOIN trip tr ON tr.id = b.trip_id WHERE b.direction = 'BOARD'`],
  ["student_trip_status", `INSERT INTO student_trip_status (trip_id, student_id, status, boarded_at, dropped_at, boarded_stop_id, dropped_stop_id, parent_notified_at, last_updated_at)
    SELECT b.trip_id, b.student_id, CASE WHEN tr.direction = 'PICKUP' THEN 'BOARDED' ELSE 'DROPPED' END, b.recorded_at, a.recorded_at, b.route_stop_id, a.route_stop_id, a.recorded_at, a.recorded_at
      FROM bus_boarding_event b JOIN bus_boarding_event a ON a.trip_id = b.trip_id AND a.student_id = b.student_id AND a.direction = 'ALIGHT'
      JOIN trip tr ON tr.id = b.trip_id WHERE b.direction = 'BOARD'`],
  ["bus_boarding_correction", `INSERT INTO bus_boarding_correction (boarding_event_id, corrected_by, reason, corrected_at)
    SELECT id, ${TM}, 'Attendant manually corrected a misread card tap.', recorded_at + interval '30 minutes' FROM bus_boarding_event WHERE direction = 'BOARD' ORDER BY abs(hashtext(id::text)) LIMIT 8`],

  // ---- camps ----
  ["camp_service", `INSERT INTO camp_service (camp_id, service_name, service_type, provider_name, result_template)
    SELECT c.id, CASE c.camp_type WHEN 'VISION' THEN 'Vision Test' WHEN 'DENTAL' THEN 'Dental Checkup' ELSE 'Blood Grouping' END,
           CASE c.camp_type WHEN 'VISION' THEN 'VISION' WHEN 'DENTAL' THEN 'DENTAL' ELSE 'BLOOD_GROUP' END,
           (SELECT name FROM camp_partner WHERE id = c.partner_id), '{"fields":["result","remarks"]}'::jsonb FROM camp c`],
  ["camp_session", `INSERT INTO camp_session (camp_id, session_date, start_time, end_time, venue, capacity) SELECT id, start_date, '09:00', '13:00', 'School Auditorium', 600 FROM camp`],
  ["camp_resource", `INSERT INTO camp_resource (camp_id, resource_type, object_key, file_name, uploaded_by, uploaded_at)
    SELECT id, 'REPORT', 'camps/' || id || '/camp-report.pdf', 'camp_report.pdf', ${P}, start_date::timestamp + interval '1 day' FROM camp`],
  ["camp_consent", `INSERT INTO camp_consent (camp_id, student_id, guardian_person_id, consent_given_at, method, document_key)
    SELECT c.id, s.id, ${PRIMARY_GUARDIAN("s.id")}, c.start_date::timestamp - interval '5 days', 'APP', 'camp-consent/' || c.id || '/' || s.id || '.pdf'
      FROM camp c JOIN student s ON abs(hashtext(s.id::text || c.id::text)) % 5 = 0 WHERE c.requires_parent_consent AND ${PRIMARY_GUARDIAN("s.id")} IS NOT NULL`],
  ["camp_participant", `INSERT INTO camp_participant (camp_id, student_id, consent_id, session_id, registered_at, attended, marked_by, marked_at)
    SELECT c.id, s.id, (SELECT cc.id FROM camp_consent cc WHERE cc.camp_id = c.id AND cc.student_id = s.id), (SELECT id FROM camp_session WHERE camp_id = c.id LIMIT 1),
           c.start_date::timestamp - interval '3 days', true, ${NURSE}, c.start_date::timestamp + interval '10 hours'
      FROM camp c JOIN student s ON abs(hashtext(s.id::text || c.id::text)) % 5 = 0
     WHERE (NOT c.requires_parent_consent) OR EXISTS (SELECT 1 FROM camp_consent cc WHERE cc.camp_id = c.id AND cc.student_id = s.id)`],
  ["camp_checkup_record", `INSERT INTO camp_checkup_record (participant_id, camp_service_id, student_id, performed_at, performed_by, findings, result_summary, is_abnormal, recommendation, referred_to, recorded_by, parent_notified_at)
    SELECT p.id, sv.id, p.student_id, p.marked_at, sv.provider_name,
           jsonb_build_object('result', CASE WHEN abs(hashtext(p.id::text)) % 100 < 8 THEN 'Abnormal' ELSE 'Normal' END),
           CASE WHEN abs(hashtext(p.id::text)) % 100 < 8 THEN 'Needs specialist review' ELSE 'Within normal limits' END,
           abs(hashtext(p.id::text)) % 100 < 8,
           CASE WHEN abs(hashtext(p.id::text)) % 100 < 8 THEN 'Consult a specialist and follow up within two weeks.' ELSE 'No action required; continue routine checkups.' END,
           CASE WHEN abs(hashtext(p.id::text)) % 100 < 8 THEN 'Aravind Eye Hospital / Meenakshi Mission Hospital' ELSE 'Not required' END,
           ${NURSE}, p.marked_at + interval '2 hours'
      FROM camp_participant p JOIN camp_service sv ON sv.camp_id = p.camp_id`],
  ["camp_follow_up", `INSERT INTO camp_follow_up (checkup_record_id, student_id, action, due_date, assigned_to, status, parent_informed_at, completed_on, notes)
    SELECT r.id, r.student_id, 'Referred for specialist consultation', (r.performed_at::date + 14), ${NURSE}, 'DONE', r.performed_at + interval '1 day', (r.performed_at::date + 10), 'Parent informed; specialist consultation completed.'
      FROM camp_checkup_record r WHERE r.is_abnormal`],

  // ---- community ----
  ["community_proposal", `INSERT INTO community_proposal (community_id, requested_by, title, description, status)
    SELECT (SELECT id FROM community LIMIT 1), (SELECT person_id FROM guardian_link ORDER BY md5(person_id::text || g::text) LIMIT 1),
           'Community Initiative Proposal ' || g, 'Proposal for a community-driven school improvement activity.', CASE WHEN g <= 10 THEN 'APPROVED' ELSE 'PENDING' END
      FROM generate_series(1, 15) g`],
  ["community_initiative", `INSERT INTO community_initiative (community_id, proposal_id, title, description, status, planned_date, started_at, completed_at, created_by, progress_notes, outcome, venue)
    SELECT p.community_id, p.id, 'Initiative ' || row_number() OVER (ORDER BY p.title), 'Approved community initiative for the school.', 'COMPLETED',
           DATE '2025-09-15' + (row_number() OVER (ORDER BY p.title))::int * 20, TIMESTAMPTZ '2025-09-15 10:00+05:30' + (row_number() OVER (ORDER BY p.title))::int * interval '20 days',
           TIMESTAMPTZ '2025-09-16 16:00+05:30' + (row_number() OVER (ORDER BY p.title))::int * interval '20 days', p.requested_by,
           'Planned, executed and reviewed with volunteers.', 'Completed successfully with good participation.', 'School Auditorium'
      FROM community_proposal p WHERE p.status = 'APPROVED'`],
  ["community_position", `INSERT INTO community_position (community_id, title, assignee_type, assignee_staff_id, created_by)
    SELECT (SELECT id FROM community LIMIT 1), t.title, 'STAFF', (SELECT id FROM staff WHERE is_teaching ORDER BY md5(id::text || t.title) LIMIT 1), ${P}
      FROM (VALUES ('Chairperson'),('Secretary'),('Treasurer'),('Regional Coordinator - North'),('Regional Coordinator - South'),('Regional Coordinator - East'),('Regional Coordinator - West')) t(title)`],
  ["community_membership_request ADD", `INSERT INTO community_membership_request (community_id, action, student_id, role_in_community, status, requested_by)
    SELECT (SELECT id FROM community LIMIT 1), 'ADD', s.id, 'MEMBER', CASE WHEN abs(hashtext(s.id::text)) % 100 < 85 THEN 'APPROVED' ELSE 'PENDING' END, ${PRIMARY_GUARDIAN("s.id")}
      FROM student s WHERE ${PRIMARY_GUARDIAN("s.id")} IS NOT NULL ORDER BY md5(s.id::text) LIMIT 35`],
  ["community_membership_request REMOVE", `INSERT INTO community_membership_request (community_id, action, membership_id, role_in_community, status, requested_by)
    SELECT m.community_id, 'REMOVE', m.id, 'MEMBER', 'PENDING', ${PRIMARY_GUARDIAN("m.student_id")} FROM community_membership m WHERE ${PRIMARY_GUARDIAN("m.student_id")} IS NOT NULL ORDER BY md5(m.id::text) LIMIT 5`],

  // ---- others ----
  ["campus_feedback", `INSERT INTO campus_feedback (submitted_by, category, message)
    SELECT (SELECT person_id FROM staff ORDER BY md5(person_id::text || g::text) LIMIT 1), (ARRAY['FACILITIES','FOOD','TRANSPORT','SAFETY','OTHER'])[1 + g % 5],
           (ARRAY['Classroom fans need regular servicing.','Canteen menu variety has improved, thank you.','Bus timings are convenient for staff.','Please add more lighting near the parking area.','Suggestion: a quiet space for staff planning.'])[1 + g % 5]
      FROM generate_series(1, 40) g`],
  ["canteen_transaction_item", `INSERT INTO canteen_transaction_item (transaction_id, product_id, product_name, quantity, unit_price_paise, line_total_paise)
    SELECT ct.id, cp.id, cp.name, 1, ct.amount_paise, ct.amount_paise FROM canteen_transaction ct
      JOIN LATERAL (SELECT id, name FROM canteen_product ORDER BY md5(id::text || ct.id::text) LIMIT 1) cp ON true`],
  ["document", `INSERT INTO document (owner_domain, owner_object_type, owner_object_id, category, doc_type, object_key, file_name, mime_type, size_bytes, checksum_sha256, is_restricted, uploaded_by, uploaded_at, retain_until, status)
    SELECT 'ORGANIZATION', 'POLICY', 'school', pc.category, 'HANDBOOK', 'docs/school/handbook-' || pc.rn || '.pdf', 'Student_Handbook.pdf', 'application/pdf', 500000 + pc.rn * 1000,
           md5('handbook-' || pc.rn) || md5('school-' || pc.rn), false, ${P}, TIMESTAMPTZ '2025-06-01 10:00+05:30', DATE '2032-06-01', 'ACTIVE'
      FROM (SELECT category, row_number() OVER (ORDER BY category) rn FROM document_retention_policy) pc WHERE pc.rn <= 5`],
  ["subject_group_subject", `INSERT INTO subject_group_subject (subject_group_id, subject_id, is_optional)
    SELECT sg.id, s.id, true FROM subject_group sg JOIN subject s ON s.name IN ('Tamil', 'English', 'Computer Science') WHERE sg.code = 'SRSEC-L3'`],
  ["syllabus_progress", `INSERT INTO syllabus_progress (subject_offering_id, syllabus_unit_id, status, completed_on, updated_by)
    SELECT so.id, su.id, CASE WHEN su.rn <= 2 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END, CASE WHEN su.rn <= 2 THEN DATE '2025-08-01' + su.rn * 30 END,
           (SELECT person_id FROM staff WHERE id = so.teacher_staff_id)
      FROM subject_offering so JOIN section sec ON sec.id = so.section_id
      JOIN LATERAL (SELECT x.id, x.rn FROM (SELECT id, row_number() OVER (ORDER BY unit_no) rn FROM syllabus_unit WHERE subject_id = so.subject_id AND grade_id = sec.grade_id) x WHERE x.rn <= 3) su ON true
     WHERE EXISTS (SELECT 1 FROM exam_subject es WHERE es.subject_offering_id = so.id)`],
];

async function main() {
  await withSeedTransaction(true, async (ctx) => {
    for (const [label, sql] of STEPS) {
      const r: any = await ctx.query(sql);
      console.log(`${label}: ${r?.rowCount ?? "error (see list below)"} rows`);
    }
  });
}
main().catch((e) => { console.error("FILL2 FAILED:", e); process.exit(1); });
