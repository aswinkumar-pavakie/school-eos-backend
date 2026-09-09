// Parent-facing Homework: list a child's own real homework (with their own
// submission status), upload attachment file(s) to a private bucket, and
// mark a homework completed (with or without a file) -- guardian-checked
// first, same as every other Parent feature.

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { HOMEWORK_SUBMISSIONS_BUCKET, homeworkSubmissionObjectKeyFor } from './homework-storage.util';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentAcademicRepository } from './repositories/parent-academic.repository';
import { ParentHomeworkRepository } from './repositories/parent-homework.repository';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

@Injectable()
export class ParentHomeworkService {
  constructor(
    private readonly homeworkRepo: ParentHomeworkRepository,
    private readonly academicRepo: ParentAcademicRepository,
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  async list(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    const offerings = await this.academicRepo.getCurrentOfferings(studentId);
    return this.homeworkRepo.findForStudent(
      studentId,
      offerings.map((o) => o.subjectOfferingId),
    );
  }

  private async requireOwnHomework(studentId: string, homeworkId: string) {
    const homework = await this.homeworkRepo.findById(homeworkId, studentId);
    if (!homework) throw new NotFoundException('Homework not found for this student.');
    const offerings = await this.academicRepo.getCurrentOfferings(studentId);
    if (!offerings.some((o) => o.subjectOfferingId === homework.subjectOfferingId)) {
      throw new NotFoundException('Homework not found for this student.');
    }
    return homework;
  }

  async submit(
    personId: string,
    studentId: string,
    homeworkId: string,
    input: { note?: string },
    files: Express.Multer.File[],
  ) {
    await this.assertGuardian(personId, studentId);
    const homework = await this.requireOwnHomework(studentId, homeworkId);
    if (homework.submissionStatus === 'GRADED') {
      throw new BadRequestException('This homework has already been graded and can no longer be edited.');
    }

    const newObjectKeys: string[] = [];
    for (const file of files) {
      const objectKey = homeworkSubmissionObjectKeyFor(homeworkId, studentId, file);
      await this.storage.upload(HOMEWORK_SUBMISSIONS_BUCKET, objectKey, file.buffer, file.mimetype);
      newObjectKeys.push(objectKey);
    }

    const isLate = new Date() > new Date(`${homework.dueDate}T23:59:59`);
    await this.homeworkRepo.upsertSubmission({
      homeworkId,
      studentId,
      newObjectKeys,
      note: input.note ?? null,
      isLate,
      status: isLate ? 'LATE' : 'SUBMITTED',
    });

    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: 'HOMEWORK_SUBMITTED',
      objectType: 'homework_submission',
      objectId: homeworkId,
      outcome: 'SUCCESS',
      afterData: { studentId, fileCount: newObjectKeys.length, isLate },
    });

    return this.homeworkRepo.findById(homeworkId, studentId);
  }

  /** Faculty already has its own signed-URL route for viewing a submission's
   * files (grading screen); this is the Parent-side equivalent, for a parent
   * to re-open what they themselves uploaded. */
  async getFileUrl(personId: string, studentId: string, homeworkId: string, objectKey: string): Promise<string> {
    await this.assertGuardian(personId, studentId);
    const homework = await this.requireOwnHomework(studentId, homeworkId);
    if (!homework.objectKeys?.includes(objectKey)) {
      throw new NotFoundException('File not found on this submission.');
    }
    return this.storage.createSignedUrl(HOMEWORK_SUBMISSIONS_BUCKET, objectKey, SIGNED_URL_TTL_SECONDS);
  }
}
