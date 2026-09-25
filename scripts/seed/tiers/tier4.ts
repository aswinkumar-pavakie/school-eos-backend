import type { SeedContext } from "../lib/db";
import { rand } from "../lib/util";
import { GRADE_BANDS, MARK_BAND_WEIGHTS } from "../data/academics";
import type { Tier1Ids } from "./tier1";
import type { Tier3Ids } from "./tier3";

// Real grade-band-weighted mark generator — produces an actual numeric score
// inside the chosen band's real min-max range, never a fixed round number.
function generateMark(): number {
  const entries = Object.entries(MARK_BAND_WEIGHTS) as [keyof typeof MARK_BAND_WEIGHTS, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  let bandLabel: string = "E";
  for (const [label, w] of entries) {
    if (r < w) { bandLabel = label; break; }
    r -= w;
  }
  const band = GRADE_BANDS.find((b) => b.label === bandLabel)!;
  return band.min + Math.floor(rand() * (band.max - band.min + 1));
}

export async function seedTier4(ctx: SeedContext, t1: Tier1Ids, t3: Tier3Ids) {
  // --- mark: 240 examinable offerings x 40 students/section x 7 exams = 67,200 ---
  const studentsBySection = new Map<string, string[]>();
  for (const s of t1.students) {
    if (!studentsBySection.has(s.sectionKey)) studentsBySection.set(s.sectionKey, []);
    studentsBySection.get(s.sectionKey)!.push(s.studentId);
  }
  const markRows: unknown[][] = [];
  for (const es of t3.examSubjectIds) {
    const students = studentsBySection.get(es.sectionKey) ?? [];
    for (const studentId of students) {
      const isAbsent = rand() < 0.01; // realistic small absentee rate, separate from the pass/fail spread
      markRows.push([es.id, studentId, isAbsent ? null : generateMark(), isAbsent, "VERIFIED"]);
    }
  }
  await ctx.insertMany("mark", ["exam_subject_id", "student_id", "marks_obtained", "is_absent", "state"], markRows);
  console.log(`mark: ${markRows.length} rows generated (real grade-band-weighted distribution)`);
}
