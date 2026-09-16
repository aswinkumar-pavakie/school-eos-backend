import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ExamRepository } from '../examinations/repositories/exam.repository';
import { FacultyClassResultsService } from './faculty-class-results.service';
import { FacultyReportCardRepository } from './repositories/faculty-report-card.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

// The class advisor's remark on a student's report for one real, already-
// published exam. report_card/report_card_line are real, live tables with
// no application code anywhere until this -- see
// FacultyReportCardRepository's own header for why total/percentage/rank are
// always real (computed from this exact exam's marks, the same numbers the
// Performance screen already shows) and never fabricated, while
// pdf_object_key/sign-off stay null (genuinely out of scope, not faked).
@Injectable()
export class FacultyReportCardService {
  constructor(
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly classResultsService: FacultyClassResultsService,
    private readonly examRepo: ExamRepository,
    private readonly reportCardRepo: FacultyReportCardRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async assertAdvisor(personId: string, sectionId: string) {
    const isAdvisor = await this.scopeRepo.isAdvisorForSection(
      personId,
      sectionId,
    );
    if (!isAdvisor) {
      throw new ForbiddenException(
        'You are not the class advisor for this section.',
      );
    }
  }

  private async resolveExamAndStudent(
    personId: string,
    sectionId: string,
    examId: string,
    studentId: string,
  ) {
    await this.assertAdvisor(personId, sectionId);
    const exam = await this.examRepo.findById(examId);
    if (!exam) throw new NotFoundException('Examination not found');
    const results = await this.classResultsService.getResults(
      personId,
      sectionId,
      examId,
    );
    const student = results.students.find((s) => s.studentId === studentId);
    if (!student) {
      throw new NotFoundException(
        "This student has no results for this exam.",
      );
    }
    return { exam, results, student };
  }

  async getRemark(
    personId: string,
    sectionId: string,
    examId: string,
    studentId: string,
  ): Promise<{ remark: string | null }> {
    const { exam } = await this.resolveExamAndStudent(
      personId,
      sectionId,
      examId,
      studentId,
    );
    const remark = await this.reportCardRepo.getRemark(
      studentId,
      exam.academicYearId,
      exam.term ?? exam.name,
    );
    return { remark };
  }

  async setRemark(
    personId: string,
    sectionId: string,
    examId: string,
    studentId: string,
    remark: string,
  ): Promise<{ remark: string }> {
    const { exam, results, student } = await this.resolveExamAndStudent(
      personId,
      sectionId,
      examId,
      studentId,
    );

    const ranked = results.students
      .filter((s) => s.percent !== null)
      .sort((a, b) => b.percent! - a.percent!);
    const classRank =
      student.percent === null
        ? null
        : ranked.findIndex((s) => s.studentId === studentId) + 1;

    await this.unitOfWork.run(async (client) => {
      await this.reportCardRepo.upsertRemark(
        {
          studentId,
          academicYearId: exam.academicYearId,
          term: exam.term ?? exam.name,
          totalMarks: student.totalObtained,
          percentage: student.percent,
          classRank: classRank && classRank > 0 ? classRank : null,
          advisorRemark: remark,
          generatedBy: personId,
          lines: student.subjects.map((s) => ({
            subjectName: s.subjectName,
            marksObtained: s.marksObtained,
            maxMarks: s.maxMarks,
          })),
        },
        client,
      );
    });

    return { remark };
  }
}
