// Third pass: fills the remaining NULL cells that have a truthful value. UPDATE ... WHERE col IS NULL only.
import { withSeedTransaction } from "./lib/db";

const H = (t = "t") => `abs(hashtext(${t}.ctid::text))`;
const role = (code: string) => `(SELECT person_id FROM role_assignment WHERE role_code='${code}' AND status='ACTIVE' ORDER BY person_id LIMIT 1)`;
const P = role("PRINCIPAL"), ADM = role("ADMIN"), NURSE = role("HEALTH_INCHARGE"), LIB = role("LIBRARY");
const TEACH = `((ARRAY(SELECT person_id FROM staff WHERE is_teaching ORDER BY person_id))[1 + ${H()} % (SELECT count(*) FROM staff WHERE is_teaching)])`;
const GUARD = (studentExpr: string) => `(SELECT g.person_id FROM guardian_link g WHERE g.student_id = ${studentExpr} AND g.is_primary_contact ORDER BY g.person_id LIMIT 1)`;
const DT = `(TIMESTAMPTZ '2025-07-01 10:00+05:30' + (${H()} % 240) * interval '1 day')`;

const S: [string, string][] = [
  ["achievement", `UPDATE achievement t SET certificate_key = COALESCE(certificate_key, 'certificates/achievement/' || t.id || '.pdf'), source_domain = COALESCE(source_domain, 'ACADEMICS')`],
  ["activity_record.recorded_by", `UPDATE activity_record t SET recorded_by = ${TEACH} WHERE recorded_by IS NULL`],
  ["ai_bot_message", `UPDATE ai_bot_message SET category = COALESCE(category, 'NORMAL'), tool_calls = COALESCE(tool_calls, '[]'::jsonb)`],
  ["approval_request.due_at", `UPDATE approval_request t SET due_at = ${DT} + interval '3 days' WHERE due_at IS NULL`],
  ["bulk_import_job.committed_at", `UPDATE bulk_import_job SET committed_at = validated_at + interval '5 minutes' WHERE committed_at IS NULL AND validated_at IS NOT NULL`],
  ["call_request.approved", `UPDATE call_request SET approved_from = decided_at, approved_to = decided_at + interval '15 minutes' WHERE approved_from IS NULL AND decided_at IS NOT NULL`],
  ["hostel_call_request.approved", `UPDATE hostel_call_request SET approved_from = decided_at, approved_to = decided_at + interval '15 minutes' WHERE approved_from IS NULL AND decided_at IS NOT NULL`],
  ["camp_follow_up", `UPDATE camp_follow_up f SET assigned_to = COALESCE(f.assigned_to, ${NURSE}), parent_informed_at = COALESCE(f.parent_informed_at, (SELECT r.performed_at + interval '1 day' FROM camp_checkup_record r WHERE r.id = f.checkup_record_id)), notes = COALESCE(f.notes, 'Parent informed; follow-up in progress.')`],
  ["canteen_transaction.card_uid", `UPDATE canteen_transaction t SET card_uid = (SELECT card_uid FROM id_card c WHERE c.student_id = t.student_id AND c.holder_type = 'STUDENT' LIMIT 1) WHERE card_uid IS NULL`],
  ["card_replacement_request", `UPDATE card_replacement_request t SET old_card_id = COALESCE(old_card_id, (SELECT id FROM id_card c WHERE c.student_id = t.student_id AND c.holder_type='STUDENT' LIMIT 1)), requested_by = COALESCE(requested_by, ${GUARD("t.student_id")}), approved_by = COALESCE(approved_by, ${ADM})`],
  ["card_tap_event.resolve", `UPDATE card_tap_event t SET resolved_card_id = (SELECT id FROM id_card WHERE holder_type='STUDENT' ORDER BY md5(id::text || t.id::text) LIMIT 1) WHERE resolved_card_id IS NULL`],
  ["card_tap_event.link", `UPDATE card_tap_event t SET card_uid = c.card_uid, resolved_student_id = c.student_id FROM id_card c WHERE c.id = t.resolved_card_id AND t.resolved_student_id IS NULL`],
  ["community_post", `UPDATE community_post t SET moderated_by = COALESCE(moderated_by, ${P}), moderated_at = COALESCE(moderated_at, ${DT})`],
  ["complaint", `UPDATE complaint t SET assigned_to = COALESCE(assigned_to, ${P}), sla_due_at = COALESCE(sla_due_at, created_at + interval '7 days'),
      resolved_at = CASE WHEN state = 'RESOLVED' THEN COALESCE(resolved_at, created_at + interval '4 days') ELSE resolved_at END,
      satisfaction_rating = CASE WHEN state = 'RESOLVED' THEN COALESCE(satisfaction_rating, 4 + ${H()} % 2) ELSE satisfaction_rating END`],
  ["complaint_update.new_state", `UPDATE complaint_update u SET new_state = c.state FROM complaint c WHERE c.id = u.complaint_id AND u.new_state IS NULL`],
  ["department.hod", `UPDATE department t SET hod_staff_id = (SELECT id FROM staff WHERE is_teaching ORDER BY md5(id::text || t.id::text) LIMIT 1) WHERE hod_staff_id IS NULL`],
  ["equipment_issue", `UPDATE equipment_issue t SET signature_object_key = COALESCE(signature_object_key, 'signatures/equipment/' || t.id || '.png'), signed_at = COALESCE(signed_at, issued_on::timestamp + interval '10 hours')`],
  ["gate_pass.emergency", `UPDATE gate_pass t SET emergency_reason = 'Medical emergency at home' WHERE is_emergency AND emergency_reason IS NULL`],
  ["gate_pass.collecting", `UPDATE gate_pass t SET collecting_person_id = ${GUARD("t.student_id")} WHERE collecting_person_id IS NULL`],
  ["google_account_connection.revoked", `UPDATE google_account_connection SET disconnected_by = ${P}, disconnected_at = COALESCE(last_used_at, connected_at) + interval '1 day' WHERE status = 'REVOKED' AND disconnected_at IS NULL`],
  ["guardian_link.income", `UPDATE guardian_link t SET annual_income_paise = (240000 + ${H()} % 1200000) * 100 WHERE annual_income_paise IS NULL`],
  ["health_alert", `UPDATE health_alert t SET scope_type = COALESCE(scope_type, 'STUDENT'), scope_id = COALESCE(scope_id, student_id), acknowledged_by = COALESCE(acknowledged_by, ${NURSE}), acknowledged_at = COALESCE(acknowledged_at, detected_at + interval '1 hour')`],
  ["homework_submission.graded", `UPDATE homework_submission t SET marks_awarded = LEAST(h.max_marks, 5 + ${H()} % 6), feedback = CASE WHEN ${H()} % 3 = 0 THEN 'Excellent work.' WHEN ${H()} % 3 = 1 THEN 'Good effort; check the last question.' ELSE 'Well done; keep practising.' END,
      graded_by = h.assigned_by, graded_at = h.due_date::timestamp + interval '2 days 11 hours', note = 'Submitted through the portal.'
      FROM homework h WHERE h.id = t.homework_id AND t.status <> 'NOT_DONE' AND t.marks_awarded IS NULL`],
  ["hospital_referral.visit", `UPDATE hospital_referral t SET infirmary_visit_id = (SELECT v.id FROM infirmary_visit v WHERE v.student_id = t.student_id ORDER BY v.visited_at LIMIT 1) WHERE infirmary_visit_id IS NULL`],
  ["infirmary_visit.parent_notified_at", `UPDATE infirmary_visit SET parent_notified_at = visited_at + interval '20 minutes' WHERE parent_notified_at IS NULL`],
  ["library_fine.waived", `UPDATE library_fine SET waived_by = ${LIB}, waived_reason = 'Waived by the librarian on request.', waived_at = assessed_at + interval '2 days' WHERE status = 'WAIVED' AND waived_by IS NULL`],
  ["library_reservation", `UPDATE library_reservation SET ready_at = reserved_at + interval '2 days', expires_at = reserved_at + interval '5 days' WHERE status IN ('FULFILLED','EXPIRED') AND ready_at IS NULL`],
  ["library_lost_damaged_report", `UPDATE library_lost_damaged_report t SET notes = COALESCE(notes, 'Reported at the library counter and recorded.'), member_id = COALESCE(member_id, (SELECT m.id FROM library_member m WHERE m.person_id = t.reported_by LIMIT 1))`],
  ["notification.deep_link", `UPDATE notification SET deep_link = '/notifications/' || id WHERE deep_link IS NULL`],
  ["notification_delivery", `UPDATE notification_delivery SET provider = COALESCE(provider, 'FCM'), provider_ref = COALESCE(provider_ref, 'msg-' || id), delivered_at = CASE WHEN state IN ('SENT','DELIVERED','READ') THEN COALESCE(delivered_at, queued_at + interval '2 seconds') ELSE delivered_at END`],
  ["outing_request.core", `UPDATE outing_request t SET requested_by = COALESCE(requested_by, ${GUARD("t.student_id")}), destination = COALESCE(destination, 'Home, Madurai'), request_type = COALESCE(request_type, 'GATE_PASS'), purpose_category = COALESCE(purpose_category, 'HOME_LEAVE')`],
  ["outing_request.rejected", `UPDATE outing_request t SET decided_by = COALESCE(decided_by, ${role("HOSTEL_WARDEN")}), decided_at = COALESCE(decided_at, requested_at + interval '2 hours'), decision_note = COALESCE(decision_note, 'Not approved; please contact the warden.') WHERE state = 'REJECTED'`],
  ["payslip.breakdown", `UPDATE payslip SET breakdown = jsonb_build_object('basic', round(gross_paise * 0.5), 'hra', round(gross_paise * 0.2), 'allowances', gross_paise - round(gross_paise * 0.5) - round(gross_paise * 0.2), 'pf', round(deductions_paise * 0.6), 'professional_tax_and_others', deductions_paise - round(deductions_paise * 0.6)) WHERE breakdown IS NULL`],
  ["repair_request.location", `UPDATE repair_request t SET location = (ARRAY['Classroom block','Science lab','Computer lab','Office'])[1 + ${H()} % 4] WHERE location IS NULL`],
  ["sos_incident.geo", `UPDATE sos_incident t SET latitude = COALESCE(latitude, 9.9252 + (${H()} % 300) / 10000.0), longitude = COALESCE(longitude, 78.1198 + (${H()} % 300) / 10000.0),
      trip_id = CASE WHEN source_domain = 'TRANSPORT' THEN COALESCE(trip_id, (SELECT id FROM trip ORDER BY md5(id::text || t.id::text) LIMIT 1)) ELSE trip_id END,
      hostel_id = CASE WHEN source_domain = 'HOSTEL' THEN COALESCE(hostel_id, (SELECT id FROM hostel ORDER BY md5(id::text || t.id::text) LIMIT 1)) ELSE hostel_id END`],
  ["sport_category.gender", `UPDATE sport_category SET gender = 'MIXED' WHERE gender IS NULL`],
  ["sports_profile.category", `UPDATE sports_profile t SET sport_category_id = (SELECT id FROM sport_category c WHERE c.sport_id = t.sport_id AND c.name = 'Open' LIMIT 1) WHERE sport_category_id IS NULL`],
  ["team.category", `UPDATE team t SET sport_category_id = (SELECT id FROM sport_category c WHERE c.sport_id = t.sport_id AND c.name LIKE 'Senior%' LIMIT 1) WHERE sport_category_id IS NULL`],
  ["team.coach", `UPDATE team t SET coach_id = (SELECT id FROM coach ORDER BY md5(id::text || t.id::text) LIMIT 1) WHERE coach_id IS NULL`],
  ["team.captain", `UPDATE team t SET captain_student_id = (SELECT student_id FROM team_member m WHERE m.team_id = t.id ORDER BY md5(m.student_id::text) LIMIT 1) WHERE captain_student_id IS NULL`],
  ["training_session.coach", `UPDATE training_session s SET conducted_by_coach_id = t.coach_id FROM team t WHERE t.id = s.team_id AND s.conducted_by_coach_id IS NULL`],
  ["sports_substitute_coach.original", `UPDATE sports_substitute_coach s SET original_coach_id = t.coach_id FROM team t WHERE t.id = s.team_id AND s.original_coach_id IS NULL`],
  ["student_follow_up", `UPDATE student_follow_up SET due_date = created_at::date + 14, outcome = CASE WHEN status = 'RESOLVED' THEN COALESCE(outcome, 'Issue resolved after discussion with the parent.') ELSE outcome END, resolved_at = CASE WHEN status = 'RESOLVED' THEN COALESCE(resolved_at, created_at + interval '10 days') ELSE resolved_at END WHERE due_date IS NULL`],
  ["telemetry_event.trip", `UPDATE telemetry_event t SET trip_id = (SELECT tr.id FROM trip tr JOIN vehicle_route_assignment v ON v.id = tr.assignment_id WHERE v.vehicle_id = t.vehicle_id ORDER BY md5(tr.id::text || t.ctid::text) LIMIT 1) WHERE trip_id IS NULL`],
  ["telemetry_event_default.trip", `UPDATE telemetry_event_default t SET trip_id = (SELECT tr.id FROM trip tr JOIN vehicle_route_assignment v ON v.id = tr.assignment_id WHERE v.vehicle_id = t.vehicle_id ORDER BY md5(tr.id::text || t.ctid::text) LIMIT 1) WHERE trip_id IS NULL`],
];

async function main() {
  await withSeedTransaction(true, async (ctx) => {
    for (const [label, sql] of S) {
      const r: any = await ctx.query(sql);
      console.log(`${label}: ${r?.rowCount ?? "error"}`);
    }
  });
}
main().catch((e) => { console.error("FILL4 FAILED:", e); process.exit(1); });
