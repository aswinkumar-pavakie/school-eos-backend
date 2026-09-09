// Class Results -- CLASS ADVISOR only (never a subject teacher who merely
// teaches into this section), whole-class results across every subject at
// once for one real exam, matching the design's own "grade distribution" +
// "toppers" structure. Grade bands reuse the same simple percentage
// thresholds as Subject Records/Marks Entry (see marks.repository.ts's own
// header note on why those, not the schema's grade_scale tables).

import { ForbiddenException, Injectable } from '@nestjs/common';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { MarksRepository } from './repositories/marks.repository';

function gradeFor(percent: number): string {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C';
  return 'D';
}

const GRADE_BANDS: { grade: string; label: string; min: number }[] = [
  { grade: 'A+', label: 'A+ · 90% and above', min: 90 },
  { grade: 'A', label: 'A · 80–89%', min: 80 },
  { grade: 'B', label: 'B · 70–79%', min: 70 },
  { grade: 'C', label: 'C · 60–69%', min: 60 },
  { grade: 'D', label: 'D · below 60%', min: 0 },
];

@Injectable()
export class FacultyClassResultsService {
  constructor(
    private readonly marksRepo: MarksRepository,
    private readonly scopeRepo: FacultyScopeRepository,
  ) {}

  private async assertAdvisor(personId: string, sectionId: string) {
    const isAdvisor = await this.scopeRepo.isAdvisorForSection(personId, sectionId);
    if (!isAdvisor) throw new ForbiddenException('You are not the class advisor for this section.');
  }

  async listExams(personId: string, sectionId: string) {
    await this.assertAdvisor(personId, sectionId);
    return this.marksRepo.findExamsForSection(sectionId);
  }

  async getResults(personId: string, sectionId: string, examId: string) {
    await this.assertAdvisor(personId, sectionId);
    const rows = await this.marksRepo.findResultsForExamAndSection(sectionId, examId);

    const byStudent = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        rollNo: number | null;
        subjects: { subjectName: string; marksObtained: number | null; maxMarks: number; passMarks: number | null; isAbsent: boolean }[];
      }
    >();
    for (const row of rows) {
      let entry = byStudent.get(row.studentId);
      if (!entry) {
        entry = {
          studentId: row.studentId,
          studentName: [row.firstName, row.lastName].filter(Boolean).join(' '),
          rollNo: row.rollNo,
          subjects: [],
        };
        byStudent.set(row.studentId, entry);
      }
      entry.subjects.push({
        subjectName: row.subjectName,
        marksObtained: row.marksObtained,
        maxMarks: row.maxMarks,
        passMarks: row.passMarks,
        isAbsent: row.isAbsent,
      });
    }

    const students = [...byStudent.values()].map((entry) => {
      // Rounded to 2dp -- summing several numeric(5,2) marks in floating point
      // otherwise produces display artifacts like 497.90000000000003.
      const totalObtained = Math.round(entry.subjects.reduce((sum, s) => sum + (s.marksObtained ?? 0), 0) * 100) / 100;
      const totalMax = entry.subjects.reduce((sum, s) => sum + s.maxMarks, 0);
      const percent = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : null;
      const passed = entry.subjects.every((s) => !s.isAbsent && (s.passMarks === null || (s.marksObtained ?? 0) >= s.passMarks));
      return {
        studentId: entry.studentId,
        studentName: entry.studentName,
        rollNo: entry.rollNo,
        subjects: entry.subjects.map((s) => ({ subjectName: s.subjectName, marksObtained: s.marksObtained, maxMarks: s.maxMarks, isAbsent: s.isAbsent })),
        totalObtained,
        totalMax,
        percent,
        grade: percent === null ? null : gradeFor(percent),
        passed,
      };
    });

    const withPercent = students.filter((s) => s.percent !== null);
    const classAvg = withPercent.length > 0 ? Math.round(withPercent.reduce((sum, s) => sum + s.percent!, 0) / withPercent.length) : null;
    const passCount = students.filter((s) => s.passed).length;
    const topper = withPercent.length > 0 ? Math.max(...withPercent.map((s) => s.percent!)) : null;

    const gradeDistribution = GRADE_BANDS.map((band) => {
      const inBand = withPercent.filter((s) => s.grade === band.grade);
      return {
        grade: band.grade,
        label: band.label,
        count: inBand.length,
        percentOfClass: withPercent.length > 0 ? Math.round((inBand.length / withPercent.length) * 100) : 0,
        students: inBand
          .sort((a, b) => b.percent! - a.percent!)
          .map((s) => ({ studentName: s.studentName, percent: s.percent })),
      };
    });

    const toppers = [...withPercent]
      .sort((a, b) => b.percent! - a.percent!)
      .slice(0, 3)
      .map((s) => ({
        studentId: s.studentId,
        studentName: s.studentName,
        rollNo: s.rollNo,
        totalObtained: s.totalObtained,
        totalMax: s.totalMax,
        percent: s.percent,
        subjects: s.subjects,
      }));

    return {
      classAvg,
      pass: { count: passCount, total: students.length },
      topper,
      gradeDistribution,
      toppers,
      students,
    };
  }
}
