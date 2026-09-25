import type { SeedContext } from "../lib/db";
import { rand, isoDate } from "../lib/util";
import { TN_HOLIDAYS } from "../data/calendar";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

export interface Tier3Ids {
  examSubjectIds: { id: string; examId: string; sectionKey: string; subjectOfferingId: string }[];
  attendanceSessionIds: { id: string; sectionKey: string; date: Date }[];
}

function isHoliday(d: Date): boolean {
  if (d.getDay() === 0) return true; // Sunday
  // 2nd and 4th Saturday off (real TN school pattern)
  if (d.getDay() === 6) {
    const weekOfMonth = Math.ceil(d.getDate() / 7);
    if (weekOfMonth === 2 || weekOfMonth === 4) return true;
  }
  // Real Tamil Nadu school-year breaks (no daily attendance): Quarterly exam
  // holidays (Sep 27 - Oct 5), Half-Yearly/Christmas break (Dec 20 - Jan 1),
  // and the annual-exam study/exam block (Apr 1 - 30).
  const md = d.getMonth() * 100 + d.getDate();
  if ((md >= 826 && md <= 904) || md >= 1120 || (md <= 101) || (d.getMonth() === 3)) return true;
  return TN_HOLIDAYS.some((h) => h.month === d.getMonth() + 1 && Math.abs(d.getDate() - h.day) < h.days);
}

function realWorkingDays(): Date[] {
  const days: Date[] = [];
  const start = new Date(2025, 5, 1);
  const end = new Date(2026, 3, 30);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (!isHoliday(d) && d < new Date()) days.push(new Date(d));
  }
  return days;
}

export async function seedTier3(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids): Promise<Tier3Ids> {
  // --- exam_subject: 240 examinable offerings x 7 exams = 1,680 ---
  const examSubjectIds: Tier3Ids["examSubjectIds"] = [];
  for (const offering of t1.subjectOfferingIds.filter((o) => o.examinable)) {
    for (const exam of t2.examIds) {
      const id = await ctx.insertReturningId("exam_subject", {
        exam_id: exam.id, subject_offering_id: offering.id, exam_date: isoDate(exam.date),
        max_marks: 100, pass_marks: 33, has_practical: false,
      });
      examSubjectIds.push({ id, examId: exam.id, sectionKey: offering.sectionKey, subjectOfferingId: offering.id });
    }
  }

  // --- attendance_session: real working days x 56 sections ---
  const workingDays = realWorkingDays();
  const attendanceSessionIds: Tier3Ids["attendanceSessionIds"] = [];
  const sessionRows: { sectionKey: string; date: Date }[] = [];
  for (const sectionKey of Object.keys(t1.sectionIds)) {
    for (const day of workingDays) sessionRows.push({ sectionKey, date: day });
  }
  for (const row of sessionRows) {
    const id = await ctx.insertReturningId("attendance_session", {
      section_id: t1.sectionIds[row.sectionKey], session_date: isoDate(row.date), session_type: "DAILY", is_locked: true,
    });
    attendanceSessionIds.push({ id, sectionKey: row.sectionKey, date: row.date });
  }

  // --- attendance_record: every session x every enrolled student, 95% present ---
  const studentsBySection = new Map<string, string[]>();
  for (const s of t1.students) {
    if (!studentsBySection.has(s.sectionKey)) studentsBySection.set(s.sectionKey, []);
    studentsBySection.get(s.sectionKey)!.push(s.studentId);
  }
  const attendanceRecordRows: unknown[][] = [];
  for (const session of attendanceSessionIds) {
    for (const studentId of studentsBySection.get(session.sectionKey) ?? []) {
      const status = rand() < 0.95 ? "PRESENT" : rand() < 0.7 ? "ABSENT" : "LATE";
      attendanceRecordRows.push([session.id, studentId, status]);
    }
  }
  await ctx.insertMany("attendance_record", ["session_id", "student_id", "status"], attendanceRecordRows);

  // --- fee_demand: 2,240 x 4 real installments, real payment-status split ---
  const feeDemandRows: unknown[][] = [];
  let cursor = 0;
  const total = t1.students.length * 4;
  const paidCount = Math.round(total * 0.85);
  const pendingCount = Math.round(total * 0.09);
  for (const s of t1.students) {
    const assignmentId = t2.studentFeeAssignmentIds.get(s.studentId)!;
    for (let inst = 1; inst <= 4; inst++) {
      const dueMonth = [7, 9, 12, 2][inst - 1]!;
      const dueDate = isoDate(new Date(dueMonth >= 6 ? 2025 : 2026, dueMonth - 1, 5));
      let state: string; let paidPaise: number;
      const amountPaise = 1500000; // per-installment placeholder within the real gross/4 (refined at commit-time from student_fee_assignment.net_paise/4)
      if (cursor < paidCount) { state = "PAID"; paidPaise = amountPaise; }
      else if (cursor < paidCount + pendingCount) { state = "PENDING"; paidPaise = 0; }
      else { state = "OVERDUE"; paidPaise = 0; }
      feeDemandRows.push([assignmentId, s.studentId, inst, amountPaise, 0, paidPaise, dueDate, state]);
      cursor++;
    }
  }
  await ctx.insertMany("fee_demand", ["assignment_id", "student_id", "instalment_no", "amount_paise", "late_fee_paise", "paid_paise", "due_date", "state"], feeDemandRows);

  return { examSubjectIds, attendanceSessionIds };
}
