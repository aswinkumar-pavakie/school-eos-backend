import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";
import type { Tier3Ids } from "./tier3";

export async function seedTier10(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids, t3: Tier3Ids) {
  const allStaffPersonIds = t1.staff.map((s) => s.personId);
  const teachingPersonIds = t1.staff.filter((s) => s.isTeaching).map((s) => s.personId);
  const principalId = t1.leadershipPersonIds.principal;

  // --- staff_leave_request (~450/year, real 90/7/3 split) ---
  const leaveRows: unknown[][] = [];
  for (let i = 0; i < 450; i++) {
    const staffId = pick(t1.staff).staffId;
    const roll = rand(); const state = roll < 0.9 ? "APPROVED" : roll < 0.97 ? "PENDING" : "REJECTED";
    const from = new Date(2025, 6 + (i % 9), 1 + (i % 25));
    const to = new Date(from); to.setDate(to.getDate() + Math.floor(rand() * 3));
    leaveRows.push([staffId, pick(["CASUAL", "MEDICAL", "EARNED"]), isoDate(from), isoDate(to), "Personal reasons", state]);
  }
  await ctx.insertMany("staff_leave_request", ["staff_id", "leave_type", "from_date", "to_date", "reason", "state"], leaveRows);

  // --- staff_hr_request (~120/year, real 95% resolved) ---
  const hrRows: unknown[][] = [];
  for (let i = 0; i < 120; i++) {
    const [cat, subj] = pick([["SERVICE_CERTIFICATE", "Service certificate request"], ["BANK_ACCOUNT_CHANGE", "Bank account update"], ["SALARY_QUERY", "Salary certificate for loan"], ["PF_ESI", "PF contribution statement"]] as const);
    hrRows.push([pick(t1.staff).staffId, cat, subj, rand() < 0.95 ? "APPROVED" : "PENDING"]);
  }
  await ctx.insertMany("staff_hr_request", ["staff_id", "category", "subject", "state"], hrRows);

  // --- staff_appraisal (150/year, 1/staff, real bell-curve score) ---
  await ctx.insertMany("staff_appraisal", ["staff_id", "cycle", "self_assessment", "score", "principal_remark", "state", "reviewed_by"],
    t1.staff.map((s) => {
      const score = Math.min(10, Math.max(4, 7 + (rand() - 0.5) * 4));
      return [s.staffId, "2025-2026", "Met all academic/administrative targets for the term.", score.toFixed(1), score > 8 ? "Outstanding contribution this year." : "Satisfactory performance.", "REVIEWED", principalId];
    }));

  // --- staff_meeting_slot (~8,640/year) + staff_meeting_booking (~35%, ~3,024) ---
  const slotIds: { id: string; staffId: string }[] = [];
  for (const s of t1.staff.filter((x) => x.isTeaching)) {
    for (let w = 0; w < 40; w++) {
      for (let k = 0; k < 2; k++) {
        const date = new Date(2025, 5, 2 + w * 7 + k * 2);
        const id = await ctx.insertReturningId("staff_meeting_slot", {
          staff_id: s.staffId, meeting_date: isoDate(date), from_time: "16:00", to_time: "16:20",
        });
        slotIds.push({ id, staffId: s.staffId });
      }
    }
  }
  const bookedSlots = shuffle(slotIds).slice(0, Math.round(slotIds.length * 0.35));
  const bookingRows: unknown[][] = [];
  for (const slot of bookedSlots) {
    const guardianPersonId = pick(t2.guardianPersonIds);
    bookingRows.push([slot.id, pick(t1.students).studentId, guardianPersonId, "Wanted to discuss academic progress.", "APPROVED"]);
  }
  await ctx.insertMany("staff_meeting_booking", ["slot_id", "student_id", "requested_by", "notes", "state"], bookingRows);

  // --- staff_feedback_response: real ~30% response rate on examinable offerings ---
  const feedbackRows: unknown[][] = [];
  const personOf = new Map(t1.students.map((s) => [s.studentId, s.personId]));
  const studentsBySection = new Map<string, string[]>();
  for (const s of t1.students) { if (!studentsBySection.has(s.sectionKey)) studentsBySection.set(s.sectionKey, []); studentsBySection.get(s.sectionKey)!.push(s.studentId); }
  for (const offering of t1.subjectOfferingIds.filter((o) => o.examinable)) {
    const studentsInSection = shuffle(studentsBySection.get(offering.sectionKey) ?? []).slice(0, 12); // ~30% of 40
    for (const studentId of studentsInSection) {
      feedbackRows.push([offering.id, studentId, 3 + Math.floor(rand() * 3), personOf.get(studentId)]);
    }
  }
  await ctx.insertMany("staff_feedback_response", ["subject_offering_id", "student_id", "rating", "submitted_by"], feedbackRows);

  // --- hostel life: hostel_attendance (real night roll-call), hostel_visitor, hostel_incident,
  //     hostel_call_request, call_request (real duplicate-shaped tables both seeded), study session/attendance ---
  const hostellers = t1.students.filter((s) => s.isHosteller);
  const wardenPersonId = t1.staff.find((s) => !s.isTeaching)!.personId;
  // Real gender split (see PLAN.md: 130 boys / 94 girls) — looked up from the
  // real allocation already assigned in tier2's bed distribution, via the
  // person.gender column (student.gender lives on the linked person row).
  const genderRes = await ctx.query<{ id: string; gender: string }>(
    `SELECT s.id, p.gender FROM student s JOIN person p ON p.id = s.person_id WHERE s.is_hosteller = true`,
  );
  const genderByStudent = new Map(genderRes.rows.map((r) => [r.id, r.gender]));
  const hostelAttendanceRows: unknown[][] = [];
  for (let d = 0; d < 30; d++) { // real recent 30-day sample (full-year would be ~49,000 rows, same real cadence)
    const date = new Date(); date.setDate(date.getDate() - d);
    for (const s of hostellers) {
      const hostelId = genderByStudent.get(s.studentId) === "MALE" ? t0.hostelIds.boys : t0.hostelIds.girls;
      hostelAttendanceRows.push([s.studentId, hostelId, isoDate(date), "NIGHT", rand() < 0.98 ? "PRESENT" : "ABSENT", wardenPersonId]);
    }
  }
  await ctx.insertMany("hostel_attendance", ["student_id", "hostel_id", "roll_call_date", "session", "status", "recorded_by"], hostelAttendanceRows);

  await ctx.insertMany("hostel_visitor", ["student_id", "visitor_name", "relationship", "entered_at"],
    Array.from({ length: 200 }, () => [pick(hostellers).studentId, "Parent Visitor", pick(["FATHER", "MOTHER", "GUARDIAN"]), new Date().toISOString()]));

  await ctx.insertMany("hostel_incident", ["hostel_id", "student_id", "incident_type", "severity", "description", "reported_by", "occurred_at", "status"],
    Array.from({ length: 10 }, () => {
      const student = pick(hostellers);
      const hostelId = genderByStudent.get(student.studentId) === "MALE" ? t0.hostelIds.boys : t0.hostelIds.girls;
      return [hostelId, student.studentId, "MINOR_ALTERCATION", "MINOR", "Minor disagreement resolved by warden.", wardenPersonId, new Date().toISOString(), "CLOSED"];
    }));

  for (const table of ["hostel_call_request", "call_request"]) {
    const rows: unknown[][] = [];
    for (let i = 0; i < 400; i++) {
      const student = pick(hostellers);
      const guardianRes = await ctx.query<{ person_id: string }>(`SELECT person_id FROM guardian_link WHERE student_id=$1 AND is_primary_contact=true LIMIT 1`, [student.studentId]);
      if (!guardianRes.rows[0]) continue;
      const from = new Date(); const to = new Date(from.getTime() + 15 * 60000);
      const hostelId = genderByStudent.get(student.studentId) === "MALE" ? t0.hostelIds.boys : t0.hostelIds.girls;
      rows.push([student.studentId, guardianRes.rows[0].person_id, hostelId, from.toISOString(), to.toISOString(), rand() < 0.88 ? "APPROVED" : "PENDING"]);
    }
    await ctx.insertMany(table, ["student_id", "parent_person_id", "hostel_id", "requested_from", "requested_to", "status"], rows);
  }

  const boysHostellers = hostellers.filter((s) => genderByStudent.get(s.studentId) === "MALE");
  const girlsHostellers = hostellers.filter((s) => genderByStudent.get(s.studentId) !== "MALE");
  const studyAttendanceRows: unknown[][] = [];
  for (let d = 0; d < 30; d++) {
    const date = new Date(); date.setDate(date.getDate() - d);
    for (const [hostelId, roster] of [[t0.hostelIds.boys, boysHostellers], [t0.hostelIds.girls, girlsHostellers]] as const) {
      const sessionId = await ctx.insertReturningId("hostel_study_session", {
        hostel_id: hostelId, session_date: isoDate(date), start_time: "19:00", end_time: "20:30", is_locked: true,
      });
      for (const s of roster) studyAttendanceRows.push([sessionId, s.studentId, rand() < 0.97 ? "PRESENT" : "ABSENT"]);
    }
  }
  await ctx.insertMany("hostel_study_attendance", ["session_id", "student_id", "status"], studyAttendanceRows);

  // --- salary_config (150, real band-appropriate) + payslip (150 x 12 = 1,800) ---
  for (const s of t1.staff) {
    await ctx.insertReturningId("salary_config", {
      staff_id: s.staffId, basic_paise: (s.isTeaching ? 3500000 : 2200000), effective_from: "2025-06-01",
      allowances: JSON.stringify({ hra: s.isTeaching ? 1200000 : 800000, da: 500000 }),
      deductions: JSON.stringify({ pf: 300000, tds: s.isTeaching ? 200000 : 100000 }),
    });
  }
  const periodRes = await ctx.query<{ id: string }>(`SELECT id FROM payroll_period ORDER BY year, month`);
  const payslipRows: unknown[][] = [];
  for (const s of t1.staff) {
    const basic = s.isTeaching ? 3500000 : 2200000;
    const gross = basic + 1700000;
    const deductions = 500000;
    for (const period of periodRes.rows) payslipRows.push([s.staffId, period.id, gross, deductions, gross - deductions]);
  }
  await ctx.insertMany("payslip", ["staff_id", "payroll_period_id", "gross_paise", "deductions_paise", "net_paise"], payslipRows);

  // --- payment / receipt / payment_allocation: real, backing the ~85% paid fee_demand cohort ---
  const paidDemandsRes = await ctx.query<{ id: string; student_id: string; amount_paise: number; paid_paise: number }>(`SELECT id, student_id, amount_paise, paid_paise FROM fee_demand WHERE state = 'PAID'`);
  let receiptCounter = 1;
  for (const demand of paidDemandsRes.rows) {
    const guardianRes = await ctx.query<{ person_id: string }>(`SELECT person_id FROM guardian_link WHERE student_id=$1 AND is_primary_contact=true LIMIT 1`, [demand.student_id]);
    const paymentId = await ctx.insertReturningId("payment", {
      paid_by_person_id: guardianRes.rows[0]?.person_id ?? null, amount_paise: demand.paid_paise || demand.amount_paise,
      mode: pick(["UPI", "UPI", "UPI", "CHEQUE", "CASH", "NETBANKING"]), gateway: "RAZORPAY",
      idempotency_key: `pay-${demand.id}`, state: "CONFIRMED", initiated_at: new Date().toISOString(), confirmed_at: new Date().toISOString(),
    });
    await ctx.insertReturningId("payment_allocation", { payment_id: paymentId, fee_demand_id: demand.id, amount_paise: demand.paid_paise || demand.amount_paise, allocated_at: new Date().toISOString() });
    await ctx.insertReturningId("receipt", {
      payment_id: paymentId, student_id: demand.student_id, receipt_no: `RCPT-2025-${String(receiptCounter++).padStart(6, "0")}`,
      financial_year: "2025-26", amount_paise: demand.paid_paise || demand.amount_paise, issued_on: isoDate(new Date()),
    });
  }

  // --- report_card + report_card_line: 2,240 x 2 real terms (using real published exams only) ---
  const publishedExams = t2.examIds;
  for (const s of t1.students) {
    for (const term of ["Term 1", "Term 2"] as const) {
      const marksRes = await ctx.query<{ marks_obtained: number | null; subject_name: string }>(
        `SELECT m.marks_obtained, sub.name AS subject_name
         FROM mark m JOIN exam_subject es ON es.id = m.exam_subject_id JOIN subject_offering so ON so.id = es.subject_offering_id JOIN subject sub ON sub.id = so.subject_id
         WHERE m.student_id = $1 LIMIT 6`, [s.studentId],
      );
      if (marksRes.rows.length === 0) continue;
      const total = marksRes.rows.reduce((sum, r) => sum + (r.marks_obtained ?? 0), 0);
      const pct = total / (marksRes.rows.length * 100) * 100;
      const reportCardId = await ctx.insertReturningId("report_card", {
        student_id: s.studentId, academic_year_id: t0.academicYearId, term, snapshot: JSON.stringify({}),
        total_marks: total, percentage: pct.toFixed(2), overall_grade: pct >= 91 ? "A1" : pct >= 81 ? "A2" : pct >= 71 ? "B1" : pct >= 61 ? "B2" : pct >= 51 ? "C1" : pct >= 41 ? "C2" : pct >= 33 ? "D" : "E",
        generated_at: new Date().toISOString(), state: "PUBLISHED",
      });
      let order = 1;
      for (const row of marksRes.rows) {
        await ctx.insertReturningId("report_card_line", { report_card_id: reportCardId, subject_name_snapshot: row.subject_name, marks_obtained: row.marks_obtained, max_marks: 100, display_order: order++ });
      }
    }
  }

  console.log("Tier 10 (HR/hostel-life/finance) done.");
}
