import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import { SAMPLE_SYLLABUS_G8_MATHS } from "../data/academics";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

export async function seedTier9AcademicOps(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids) {
  const allStudentIds = t1.students.map((s) => s.studentId);
  const teachingPersonIds = t1.staff.filter((s) => s.isTeaching).map((s) => s.personId);

  // --- achievement (~180, real 8%) ---
  const achievers = shuffle(allStudentIds).slice(0, 180);
  await ctx.insertMany("achievement", ["student_id", "title", "level", "awarded_on"],
    achievers.map((id) => [id, pick(["Science Olympiad - District Rank 2", "Inter-School Kabaddi Champion", "State-Level Art Competition Winner", "NCC Best Cadet Award"]), pick(["SCHOOL", "DISTRICT", "STATE"]), isoDate(new Date(2025, 9, 1))]));

  // --- activity_record (~2,240, every student at least one) ---
  await ctx.insertMany("activity_record", ["student_id", "activity_type", "title", "activity_date", "source_domain"],
    allStudentIds.map((id) => [id, "CLUB", pick(["Debate Club", "Science Club", "Art Club", "NCC", "NSS", "Eco Club"]), isoDate(new Date(2025, 7, 1)), "SCHOOL"]));

  // --- allergy (~180, real 8%) ---
  const allergicStudents = shuffle(allStudentIds).slice(0, 180);
  await ctx.insertMany("allergy", ["student_id", "allergen", "category", "severity"],
    allergicStudents.map((id) => { const [al, cat] = pick([["Peanuts", "FOOD"], ["Dust", "ENVIRONMENTAL"], ["Penicillin", "DRUG"], ["Lactose", "FOOD"], ["Pollen", "ENVIRONMENTAL"]] as const); return [id, al, cat, pick(["MILD", "MODERATE", "SEVERE"])]; }));

  // --- chronic_condition (~90, real 4%) ---
  const chronicStudents = shuffle(allStudentIds).slice(0, 90);
  await ctx.insertMany("chronic_condition", ["student_id", "condition", "requires_medication"],
    chronicStudents.map((id) => [id, pick(["Asthma", "Type-1 Diabetes", "Epilepsy"]), true]));

  // --- board_exam_registration (Grade 10 + 12 only, real SSLC/HSC) ---
  const boardStudents = t1.students.filter((s) => s.sectionKey.startsWith("10-") || s.sectionKey.startsWith("12-"));
  await ctx.insertMany("board_exam_registration", ["student_id", "academic_year_id", "exam_body", "exam_level", "register_number", "candidate_type", "internal_submitted", "practical_submitted", "state"],
    boardStudents.map((s, i) => [s.studentId, t0.academicYearId, "Tamil Nadu Directorate of Government Examinations",
      s.sectionKey.startsWith("10-") ? "SSLC" : "HSC_2", `33${String(100000 + i).padStart(6, "0")}`, "REGULAR", true, true, "CONFIRMED"]));

  // --- concession: real, tied to community_category + RTE (see PLAN.md #16/#30) ---
  const concessionRows: unknown[][] = [];
  for (const s of t1.students) {
    if (["SC", "SC(A)", "ST"].includes(s.communityCategory) && rand() < 0.9) {
      concessionRows.push([s.studentId, t0.academicYearId, "GOVT_SCHEME", null, 70, `Tamil Nadu ${s.communityCategory} welfare fee concession`, "APPROVED"]);
    } else if (rand() < 0.05) {
      concessionRows.push([s.studentId, t0.academicYearId, "SIBLING", null, 20, "Sibling discount / merit concession", "APPROVED"]);
    }
  }
  await ctx.insertMany("concession", ["student_id", "academic_year_id", "concession_type", "amount_paise", "percent", "reason", "state"], concessionRows);

  // --- discipline_incident (~60/year) ---
  const disciplineStudents = shuffle(allStudentIds).slice(0, 60);
  await ctx.insertMany("discipline_incident", ["student_id", "incident_date", "severity", "category", "description", "reported_by", "state"],
    disciplineStudents.map((id) => [id, isoDate(new Date(2025, 8, Math.floor(rand() * 28) + 1)), pick(["MINOR", "MODERATE", "SERIOUS"]), pick(["UNIFORM", "LATE_ARRIVAL", "ALTERCATION"]), "Reported by class teacher during assembly.", pick(teachingPersonIds), "CLOSED"]));

  // --- emergency_treatment_consent: every student, real parent-signed ---
  const guardianByStudent = new Map<string, string>();
  {
    const rows = (await ctx.query<{ student_id: string; person_id: string }>(`SELECT student_id, person_id FROM guardian_link WHERE is_primary_contact = true`)).rows;
    for (const r of rows) guardianByStudent.set(r.student_id, r.person_id);
  }
  await ctx.insertMany("emergency_treatment_consent", ["student_id", "guardian_person_id", "scope", "consent_given_at"],
    allStudentIds.filter((id) => guardianByStudent.has(id)).map((id) => [id, guardianByStudent.get(id), "GENERAL_MEDICAL_TREATMENT", new Date("2025-06-05").toISOString()]));

  // --- exam_grade: which grades sit each real exam — 7 exams x 12 grades
  // (1-12; LKG/UKG use informal assessments, not this exam calendar) = 84 ---
  const grades1to12 = Object.entries(t0.gradeIds).filter(([g]) => g !== "LKG" && g !== "UKG").map(([, id]) => id);
  await ctx.insertMany("exam_grade", ["exam_id", "grade_id"], t2.examIds.flatMap((e) => grades1to12.map((gid) => [e.id, gid])));



  // --- immunisation_record (~6,720, 3/student) ---
  const immunRows: unknown[][] = [];
  for (const id of allStudentIds) {
    for (const vaccine of ["DPT Booster", "MMR", "Typhoid"]) immunRows.push([id, vaccine, 1, isoDate(new Date(2020, 5, 1)), "EXTERNAL"]);
  }
  await ctx.insertMany("immunisation_record", ["student_id", "vaccine", "dose_no", "administered_on", "source"], immunRows);

  // --- infirmary_visit (~800/year), hospital_referral (~10/year real minority) ---
  const nurseIds = t1.staff.filter((s) => !s.isTeaching).slice(0, 2).map((s) => s.personId);
  const infirmaryVisits: string[] = [];
  const visitRows: unknown[][] = [];
  for (let i = 0; i < 800; i++) {
    const studentId = pick(allStudentIds);
    const student = t1.students.find((s) => s.studentId === studentId)!;
    visitRows.push([studentId, new Date(2025, 7 + (i % 8), 1 + (i % 27)).toISOString(), pick(["Fever", "Headache", "Minor cut", "Stomach ache", "Period pain"]), "Rested and monitored", "REST", nurseIds[0], student.isHosteller]);
  }
  await ctx.insertMany("infirmary_visit", ["student_id", "visited_at", "complaint", "observation", "action", "attended_by", "is_hosteller"], visitRows);
  const referralStudents = shuffle(allStudentIds).slice(0, 10);
  await ctx.insertMany("hospital_referral", ["student_id", "hospital_name", "referred_at", "referred_by", "outcome"],
    referralStudents.map((id) => [id, "Government Rajaji Hospital, Madurai", new Date().toISOString(), nurseIds[0], "Treated and discharged"]));

  // --- merit_point (~500/year) ---
  const meritRows: unknown[][] = [];
  for (let i = 0; i < 500; i++) {
    meritRows.push([pick(allStudentIds), pick(t0.houseIds), 1 + Math.floor(rand() * 5), pick(["Class participation", "Sports achievement", "Cleanliness", "Helping others"]), pick(teachingPersonIds), new Date().toISOString()]);
  }
  await ctx.insertMany("merit_point", ["student_id", "house_id", "points", "reason", "awarded_by", "awarded_at"], meritRows);

  // --- observation (~300/year) ---
  await ctx.insertMany("observation", ["student_id", "observation_text", "visibility", "recorded_by"],
    shuffle(allStudentIds).slice(0, 300).map((id) => [id, "Shows good improvement in class participation this term.", "ADVISOR_ONLY", pick(teachingPersonIds)]));

  // --- outing_request (~300/year hostellers, real 85% approved) ---
  const hostellerIds = t1.students.filter((s) => s.isHosteller).map((s) => s.studentId);
  let gatePassNo = 0;
  for (let i = 0; i < 300; i++) {
    const roll = rand(); const state = roll < 0.85 ? "APPROVED" : roll < 0.95 ? "REQUESTED" : "REJECTED";
    const studentId = pick(hostellerIds);
    const day = isoDate(new Date(2025, 7 + (i % 8), 1 + (i % 27)));
    const outId = await ctx.insertReturningId("outing_request", {
      student_id: studentId, requested_at: `${day}T05:00:00Z`, out_from: `${day}T09:00:00Z`, expected_return: `${day}T18:00:00Z`,
      is_overnight: false, reason: "Family function", state,
    });
    if (state === "APPROVED") {
      await ctx.insertReturningId("gate_pass", {
        student_id: studentId, pass_no: `GP-${String(++gatePassNo).padStart(5, "0")}`, is_emergency: false,
        outing_request_id: outId, valid_from: `${day}T09:00:00Z`, valid_to: `${day}T18:00:00Z`, state: "RETURNED",
      });
    }
  }
  // emergency passes (no outing request needed)
  for (let i = 0; i < 40; i++) {
    const day = isoDate(new Date(2025, 7 + (i % 8), 2 + (i % 26)));
    await ctx.insertReturningId("gate_pass", {
      student_id: pick(allStudentIds), pass_no: `GP-${String(++gatePassNo).padStart(5, "0")}`, is_emergency: true,
      valid_from: `${day}T09:00:00Z`, valid_to: `${day}T15:00:00Z`, state: "RETURNED",
    });
  }

  // --- homework (~2,000/year), homework_submission (~80,000, real 88/8/4 split) ---
  const examinableOfferings = t1.subjectOfferingIds.filter((o) => o.examinable);
  const staffPersonByStaffId = new Map(t1.staff.map((s) => [s.staffId, s.personId]));
  const homeworkIds: { id: string; sectionKey: string }[] = [];
  for (const offering of examinableOfferings) {
    for (let w = 0; w < Math.floor(2000 / examinableOfferings.length) + 1; w++) {
      const assignedOn = new Date(2025, 6 + w, 1);
      const dueDate = new Date(assignedOn); dueDate.setDate(dueDate.getDate() + 5);
      const id = await ctx.insertReturningId("homework", {
        subject_offering_id: offering.id, title: `${offering.subjectName} - Week ${w + 1} Homework`,
        assigned_on: isoDate(assignedOn), due_date: isoDate(dueDate), max_marks: 10,
        assigned_by: staffPersonByStaffId.get(offering.teacherStaffId) ?? null, status: "PUBLISHED",
      });
      homeworkIds.push({ id, sectionKey: offering.sectionKey });
    }
  }
  const studentsBySection = new Map<string, string[]>();
  for (const s of t1.students) { if (!studentsBySection.has(s.sectionKey)) studentsBySection.set(s.sectionKey, []); studentsBySection.get(s.sectionKey)!.push(s.studentId); }
  const submissionRows: unknown[][] = [];
  for (const hw of homeworkIds) {
    for (const studentId of studentsBySection.get(hw.sectionKey) ?? []) {
      const roll = rand();
      const status = roll < 0.88 ? "SUBMITTED" : roll < 0.96 ? "LATE" : "NOT_DONE";
      submissionRows.push([hw.id, studentId, status === "NOT_DONE" ? null : new Date().toISOString(), status === "LATE", status]);
    }
  }
  await ctx.insertMany("homework_submission", ["homework_id", "student_id", "submitted_at", "is_late", "status"], submissionRows);

  // --- lesson_plan (~9,600/year via lms already covers LMS version; this is the real per-subject_offering weekly plan) ---
  const lessonPlanRows: unknown[][] = [];
  for (const offering of examinableOfferings) {
    for (let w = 0; w < 40; w++) {
      lessonPlanRows.push([offering.id, isoDate(new Date(2025, 5, 2 + w * 7)), `Week ${w + 1}: covering the current real syllabus unit.`, staffPersonByStaffId.get(offering.teacherStaffId) ?? null, "APPROVED"]);
    }
  }
  await ctx.insertMany("lesson_plan", ["subject_offering_id", "week_start", "content", "submitted_by", "status"], lessonPlanRows);

  // --- syllabus_progress: real per-offering unit completion ---
  const unitRes = await ctx.query<{ id: string }>(`SELECT id FROM syllabus_unit`);
  const progressRows: unknown[][] = [];
  for (const offering of examinableOfferings) {
    for (const unit of unitRes.rows.slice(0, 3)) {
      progressRows.push([offering.id, unit.id, rand() < 0.7 ? "COMPLETED" : "IN_PROGRESS"]);
    }
  }
  await ctx.insertMany("syllabus_progress", ["subject_offering_id", "syllabus_unit_id", "status"], progressRows);

  // --- timetable_slot: 56 sections x ~44 real periods/week = 2,464 ---
  const periodRes = await ctx.query<{ id: string }>(`SELECT id FROM timetable_period WHERE is_break = false ORDER BY period_no`);
  const slotRows: unknown[][] = [];
  // A teacher can hold only one class per (day, period) across all sections (DB trigger), so fill slot-by-slot
  // across every section with a per-slot busy set.
  const cursors = new Map<string, number>();
  let unfilled = 0;
  for (let day = 1; day <= 6; day++) {
    for (const period of periodRes.rows) {
      const busy = new Set<string>();
      for (const sectionKey of Object.keys(t1.sectionIds)) {
        const offs = t1.subjectOfferingIds.filter((o) => o.sectionKey === sectionKey);
        let c = cursors.get(sectionKey) ?? 0;
        let chosen: (typeof offs)[number] | undefined;
        for (let k = 0; k < offs.length; k++) {
          const cand = offs[(c + k) % offs.length]!;
          if (!busy.has(cand.teacherStaffId)) { chosen = cand; c = c + k + 1; break; }
        }
        cursors.set(sectionKey, c);
        if (!chosen) { unfilled++; continue; }
        busy.add(chosen.teacherStaffId);
        slotRows.push([chosen.id, period.id, day, "ACTIVE", false]);
      }
    }
  }
  console.log("timetable slots:", slotRows.length, "unfilled:", unfilled);
  await ctx.insertMany("timetable_slot", ["subject_offering_id", "period_id", "day_of_week", "status", "is_draft"], slotRows);

  // class_teacher_login_assignment is now correctly seeded in tier1.ts,
  // right alongside the real seat-person + role_assignment it belongs with
  // (see tier1.ts's comment on the real class_teacher_login/academic_
  // coordinator_login separate-identity pattern) — not duplicated here.

  // --- exam_verification: 56 sections x 7 exams = 392, real 85/10/5 split ---
  const verificationRows: unknown[][] = [];
  for (const sectionKey of Object.keys(t1.sectionIds)) {
    for (const exam of t2.examIds) {
      const roll = rand(); const status = roll < 0.85 ? "VERIFIED" : roll < 0.95 ? "PENDING" : "SENT_BACK";
      verificationRows.push([t1.sectionIds[sectionKey], exam.id, status]);
    }
  }
  await ctx.insertMany("exam_verification", ["section_id", "exam_id", "status"], verificationRows);

  // --- subject_group_subject: real elective mapping (Sr Sec 2nd optional language, ~48 students) ---
  const subjectGroupRes = await ctx.query<{ id: string }>(`SELECT id FROM subject_group LIMIT 1`);
  if (subjectGroupRes.rows[0]) {
    await ctx.insertReturningId("subject_group_subject", { subject_group_id: subjectGroupRes.rows[0].id, subject_id: t0.subjectIds["Tamil"], is_optional: false });
  }

  console.log("Tier 9 (academic operations) done.");
}
