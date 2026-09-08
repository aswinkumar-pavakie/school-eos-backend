import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentFeedbackRepository } from './repositories/parent-feedback.repository';

@Injectable()
export class ParentFeedbackService {
  constructor(
    private readonly feedbackRepo: ParentFeedbackRepository,
    private readonly guardianRepo: GuardianLinkRepository,
    private readonly audit: AuditService,
  ) {}

  private async assertGuardian(personId: string, studentId: string) {
    const link = await this.guardianRepo.findActiveLink(personId, studentId);
    if (!link) throw new ForbiddenException('You are not a registered guardian of this student.');
  }

  async list(personId: string, studentId: string) {
    await this.assertGuardian(personId, studentId);
    return this.feedbackRepo.findCurrentTermSubjects(studentId);
  }

  async submit(personId: string, studentId: string, dto: SubmitFeedbackDto) {
    await this.assertGuardian(personId, studentId);
    const subjects = await this.feedbackRepo.findCurrentTermSubjects(studentId);
    if (!subjects.some((s) => s.subjectOfferingId === dto.subjectOfferingId)) {
      throw new NotFoundException('Subject not found for this student.');
    }
    await this.feedbackRepo.upsertRating({
      subjectOfferingId: dto.subjectOfferingId,
      studentId,
      rating: dto.rating,
      submittedBy: personId,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'PARENT',
      action: 'FEEDBACK_SUBMITTED',
      objectType: 'staff_feedback_response',
      objectId: dto.subjectOfferingId,
      outcome: 'SUCCESS',
      afterData: { studentId, rating: dto.rating },
    });
    return this.feedbackRepo.findCurrentTermSubjects(studentId);
  }
}
