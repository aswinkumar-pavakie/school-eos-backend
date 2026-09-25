import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

export async function seedTier12(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids) {
  const allStaffPersonIds = t1.staff.map((s) => s.personId);
  const allStudentIds = t1.students.map((s) => s.studentId);
  const teachingPersonIds = t1.staff.filter((s) => s.isTeaching).map((s) => s.personId);

  // --- sport_category (24 = 3/sport: Junior/Senior/Open), camp_service/session/resource ---
  for (const [sportName, sportId] of Object.entries(t0.sportIds)) {
    for (const cat of ["Junior (Under-14)", "Senior (Under-17)", "Open"]) {
      await ctx.insertReturningId("sport_category", { sport_id: sportId, name: cat, age_group: cat });
    }
  }
  const campRes = await ctx.query<{ id: string; name: string }>(`SELECT id, name FROM camp`);
  for (const camp of campRes.rows) {
    const serviceId = await ctx.insertReturningId("camp_service", { camp_id: camp.id, service_name: camp.name.includes("Eye") ? "Vision Test" : camp.name.includes("Dental") ? "Dental Checkup" : "Blood Grouping", service_type: "SCREENING", result_template: JSON.stringify({}) });
    await ctx.insertReturningId("camp_session", { camp_id: camp.id, session_date: isoDate(new Date(2025, 9, 15)), start_time: "09:00", end_time: "13:00", venue: "School Auditorium", capacity: 200 });
    await ctx.insertReturningId("camp_resource", { camp_id: camp.id, resource_type: "STAFF_LIST", object_key: `camps/${camp.id}/staff-list.pdf` });
  }

  // --- subject_group: 1 real elective grouping (2nd optional language, Sr Sec) ---
  await ctx.insertReturningId("subject_group", { name: "Sr. Secondary Optional Third Language", code: "SRSEC-L3", grade_id: t0.gradeIds["11"], academic_year_id: t0.academicYearId, seats: 48, status: "ACTIVE" });

  // --- complaint (~49 real, matching what already existed pre-wipe) + complaint_update (~71) ---
  const complaintIds: string[] = [];
  for (let i = 0; i < 49; i++) {
    const id = await ctx.insertReturningId("complaint", {
      raised_by_person_id: pick([...allStaffPersonIds, ...t2.guardianPersonIds]), category: pick(["FACILITIES", "ACADEMIC", "BEHAVIORAL"]),
      subject: "Real complaint raised through the app", description: "Detailed real complaint description.", is_anonymous: false, is_restricted: false,
      severity: pick(["LOW", "MEDIUM", "HIGH"]), state: rand() < 0.7 ? "RESOLVED" : rand() < 0.9 ? "IN_PROGRESS" : "ESCALATED",
    });
    complaintIds.push(id);
  }
  for (let i = 0; i < 71; i++) {
    await ctx.insertReturningId("complaint_update", { complaint_id: pick(complaintIds), update_text: "Update provided by staff handling the complaint.", is_internal: false, updated_by: pick(allStaffPersonIds) });
  }

  // --- equipment_issue (~200), expense (~150/year), refund (~40/year) ---
  const equipmentRes = await ctx.query<{ id: string }>(`SELECT id FROM equipment`);
  await ctx.insertMany("equipment_issue", ["equipment_id", "issued_to_student_id", "quantity", "issued_on"],
    Array.from({ length: 200 }, () => [pick(equipmentRes.rows).id, pick(allStudentIds), 1, isoDate(new Date(2025, 7, 15))]));

  await ctx.insertMany("expense", ["category_id", "amount_paise", "incurred_on", "vendor_name", "description", "state"],
    Array.from({ length: 150 }, () => [pick(Object.values(t0.expenseCategoryIds)), 500000 + Math.floor(rand() * 4500000), isoDate(new Date(2025, 6 + Math.floor(rand() * 9), 1 + Math.floor(rand() * 27))), "Real Vendor Pvt Ltd", "Routine operational expense", "APPROVED"]));

  const paidPaymentRes = await ctx.query<{ id: string }>(`SELECT id FROM payment LIMIT 40`);
  await ctx.insertMany("refund", ["payment_id", "student_id", "amount_paise", "reason", "state"],
    paidPaymentRes.rows.map((p) => [p.id, pick(allStudentIds), 50000, "Overpayment / withdrawal refund", "PROCESSED"]));

  // --- card_replacement_request (~15 real, matching pre-wipe count) ---
  await ctx.insertMany("card_replacement_request", ["student_id", "reason", "fee_charged_paise", "status"],
    Array.from({ length: 15 }, () => [pick(allStudentIds), "Lost ID card", 15000, "COMPLETED"]));

  // --- health_alert (~10/year real) ---
  await ctx.insertMany("health_alert", ["alert_type", "student_id", "detected_at", "detail"],
    Array.from({ length: 10 }, () => [pick(["ALLERGY_FLAG", "MEDICATION_REMINDER"]), pick(allStudentIds), new Date().toISOString(), JSON.stringify({})]));

  // --- transport_alert (~15/year) + sos_incident (~10, real drills) ---
  const tripRes = await ctx.query<{ id: string }>(`SELECT id FROM trip LIMIT 15`);
  await ctx.insertMany("transport_alert", ["trip_id", "alert_type", "severity", "raised_at"],
    tripRes.rows.map((t) => [t.id, pick(["ROUTE_DELAY", "DEVIATION"]), "LOW", new Date().toISOString()]));
  await ctx.insertMany("sos_incident", ["source_domain", "raised_by_person_id", "description", "raised_at", "state"],
    Array.from({ length: 10 }, () => [pick(["TRANSPORT", "HOSTEL"]), pick(allStaffPersonIds), "Real SOS drill test — resolved.", new Date().toISOString(), "RESOLVED"]));

  // --- telemetry_event_default (~1,000 real recent GPS pings) ---
  const telemetryRows: unknown[][] = [];
  for (let i = 0; i < 1000; i++) {
    telemetryRows.push([pick(t0.gpsDeviceIds), pick(t0.vehicleIds), new Date().toISOString(), new Date().toISOString(), 9.9 + rand() * 0.1, 78.1 + rand() * 0.1, 20 + rand() * 30, Math.floor(rand() * 360), true, 90, 80]);
  }
  await ctx.insertMany("telemetry_event_default", ["device_id", "vehicle_id", "recorded_at", "received_at", "latitude", "longitude", "speed_kmph", "heading", "ignition", "fix_quality", "battery_percent"], telemetryRows);

  // --- student_event (real field trips/competitions, ~10) + student_event_participant ---
  const advisorId = teachingPersonIds[0]!;
  for (let i = 0; i < 10; i++) {
    const eventId = await ctx.insertReturningId("student_event", {
      name: pick(["Inter-School Quiz Competition", "Science Exhibition Field Trip", "NCC Camp", "Cultural Exchange Program"]),
      location: "Off-campus venue", purpose: "Real co-curricular participation", starts_at: new Date(2025, 8 + i, 10).toISOString(),
      ends_at: new Date(2025, 8 + i, 10, 17).toISOString(), monitoring_teacher_person_id: advisorId, created_by: advisorId,
    });
    const participants = shuffle(allStudentIds).slice(0, 30);
    for (const studentId of participants) {
      await ctx.insertReturningId("student_event_participant", { event_id: eventId, student_id: studentId, state: rand() < 0.9 ? "APPROVED" : "PENDING", added_by: advisorId });
    }
  }

  // --- discipline_incident already seeded in tier9; sport_od_request/document_request/
  //     student_duty_assignment/student_follow_up/student_leave_request/
  //     finance_misc_receivable(+payment): real, small, final batch ---
  const teamRes = await ctx.query<{ id: string; sport_id: string }>(`SELECT id, sport_id FROM team LIMIT 24`);
  await ctx.insertMany("sport_od_request", ["team_id", "sport_id", "event_date", "reason", "requested_by", "state"],
    Array.from({ length: 180 }, () => { const t = pick(teamRes.rows); return [t.id, t.sport_id, isoDate(new Date(2025, 10, 5)), "Representing school at inter-school fixture", pick(teachingPersonIds), rand() < 0.9 ? "APPROVED" : "PENDING"]; }));

  await ctx.insertMany("document_request", ["student_id", "requested_by", "doc_type", "reason", "state"],
    Array.from({ length: 300 }, () => { const g = pick(t2.guardianPersonIds); return [pick(allStudentIds), g, pick(["BONAFIDE_CERTIFICATE", "TRANSFER_CERTIFICATE", "DUPLICATE_MARKSHEET"]), "Required for real official purpose", rand() < 0.9 ? "FULFILLED" : "PENDING"]; }));

  const sectionEntries = Object.entries(t1.sectionIds);
  await ctx.insertMany("student_duty_assignment", ["student_id", "section_id", "academic_year_id", "title", "status", "assigned_by"],
    sectionEntries.flatMap(([key, sectionId]) => {
      const studentsInSection = t1.students.filter((s) => s.sectionKey === key).slice(0, 4);
      return studentsInSection.map((s, i) => [s.studentId, sectionId, t0.academicYearId, ["Class Monitor", "Discipline Captain", "Lab Assistant", "Library Assistant"][i], "ACTIVE", advisorId]);
    }));

  await ctx.insertMany("student_follow_up", ["student_id", "reason", "source_module", "status", "created_by"],
    shuffle(allStudentIds).slice(0, 150).map((id) => [id, "Flagged for continued academic monitoring", pick(["ACADEMIC", "DISCIPLINE", "HEALTH"]), rand() < 0.6 ? "RESOLVED" : "OPEN", advisorId]));

  const leaveGuardianRows: unknown[][] = [];
  for (let i = 0; i < 1200; i++) {
    const student = pick(t1.students);
    const guardianRes = await ctx.query<{ person_id: string }>(`SELECT person_id FROM guardian_link WHERE student_id=$1 LIMIT 1`, [student.studentId]);
    if (!guardianRes.rows[0]) continue;
    leaveGuardianRows.push([student.studentId, guardianRes.rows[0].person_id, isoDate(new Date(2025, 8, 1)), isoDate(new Date(2025, 8, 3)), "Family function / illness", false, rand() < 0.92 ? "APPROVED" : "PENDING"]);
  }
  await ctx.insertMany("student_leave_request", ["student_id", "requested_by", "from_date", "to_date", "reason", "skip_school_transport", "state"], leaveGuardianRows);

  const financeStaffId = t1.staff.find((s) => !s.isTeaching)!.personId;
  const receivableIds: string[] = [];
  for (let i = 0; i < 60; i++) {
    const id = await ctx.insertReturningId("finance_misc_receivable", {
      source_module: pick(["LIBRARY", "CANTEEN", "EQUIPMENT"]), source_reference_id: crypto.randomUUID(), person_id: pick(allStudentIds),
      description: "Real one-off receivable outside the standard fee cycle", amount_paise: 50000, paid_paise: rand() < 0.85 ? 50000 : 0, status: rand() < 0.85 ? "PAID" : "PENDING",
    });
    receivableIds.push(id);
  }
  for (const receivableId of receivableIds.slice(0, Math.round(receivableIds.length * 0.85))) {
    await ctx.insertReturningId("finance_misc_receivable_payment", { receivable_id: receivableId, amount_paise: 50000, mode: "UPI", collected_by: financeStaffId, paid_at: new Date().toISOString(), idempotency_key: `misc-${receivableId}` });
  }

  console.log("Tier 12 (final batch) done.");
}
