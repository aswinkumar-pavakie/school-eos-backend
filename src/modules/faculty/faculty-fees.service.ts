import { ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceSessionRepository } from '../attendance/repositories/attendance-session.repository';
import {
  FacultyFeesRepository,
  SectionFeeDemandRow,
} from './repositories/faculty-fees.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

export interface SectionFeeRow {
  studentId: string;
  studentName: string;
  rollNo: number | null;
  parentName: string | null;
  status: 'OVERDUE' | 'DUE';
  amountPending: number;
  term: string;
  dueDate: string;
}
export interface SectionFeesSummary {
  studentsWithDues: number;
  totalStudents: number;
  overdueCount: number;
  dueCount: number;
  paidCount: number;
  rows: SectionFeeRow[];
}

interface StudentAccumulator {
  studentName: string;
  rollNo: number | null;
  parentName: string | null;
  pendingPaiseSum: number;
  hasOverdue: boolean;
  nearestDueDate: string | null;
  feeHeadName: string | null;
}

@Injectable()
export class FacultyFeesService {
  constructor(
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly feesRepo: FacultyFeesRepository,
    private readonly sessionRepo: AttendanceSessionRepository,
  ) {}

  async getSectionFees(
    personId: string,
    sectionId: string,
  ): Promise<SectionFeesSummary> {
    const isAdvisor = await this.scopeRepo.isAdvisorForSection(
      personId,
      sectionId,
    );
    if (!isAdvisor) {
      throw new ForbiddenException(
        'You are only able to see fee status for a class you are the class advisor of.',
      );
    }

    const [studentIds, demandRows] = await Promise.all([
      this.sessionRepo.findActiveEnrolledStudentIds(sectionId),
      this.feesRepo.findDemandsForSection(sectionId),
    ]);

    const byStudent = new Map<string, StudentAccumulator>();
    for (const row of demandRows) {
      this.accumulate(byStudent, row);
    }

    const rows: SectionFeeRow[] = [];
    let overdueCount = 0;
    let dueCount = 0;
    for (const [studentId, entry] of byStudent) {
      if (entry.pendingPaiseSum <= 0) continue;
      const status: 'OVERDUE' | 'DUE' = entry.hasOverdue
        ? 'OVERDUE'
        : 'DUE';
      if (status === 'OVERDUE') overdueCount++;
      else dueCount++;
      rows.push({
        studentId,
        studentName: entry.studentName,
        rollNo: entry.rollNo,
        parentName: entry.parentName,
        status,
        amountPending: Math.round(entry.pendingPaiseSum / 100),
        term: entry.feeHeadName ?? 'Fee due',
        dueDate: entry.nearestDueDate ?? new Date().toISOString().slice(0, 10),
      });
    }
    rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

    const totalStudents = studentIds.length;
    const studentsWithDues = rows.length;
    return {
      studentsWithDues,
      totalStudents,
      overdueCount,
      dueCount,
      paidCount: Math.max(totalStudents - studentsWithDues, 0),
      rows,
    };
  }

  private accumulate(
    byStudent: Map<string, StudentAccumulator>,
    row: SectionFeeDemandRow,
  ): void {
    const pending = Number(row.pendingPaise);
    let entry = byStudent.get(row.studentId);
    if (!entry) {
      entry = {
        studentName: [row.studentFirstName, row.studentLastName]
          .filter(Boolean)
          .join(' '),
        rollNo: row.rollNo,
        parentName:
          [row.parentFirstName, row.parentLastName]
            .filter(Boolean)
            .join(' ') || null,
        pendingPaiseSum: 0,
        hasOverdue: false,
        nearestDueDate: null,
        feeHeadName: null,
      };
      byStudent.set(row.studentId, entry);
    }
    if (pending <= 0) return;
    entry.pendingPaiseSum += pending;
    if (row.state === 'OVERDUE') entry.hasOverdue = true;
    if (!entry.nearestDueDate || row.dueDate < entry.nearestDueDate) {
      entry.nearestDueDate = row.dueDate;
      entry.feeHeadName = row.feeHeadName;
    }
  }
}
