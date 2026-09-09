// Appraisal -- Faculty submits a self-assessment for a cycle; Principal
// reviews it (Principal's own UI is explicitly out of scope, same exclusion
// as every other approval-routed Faculty feature). Deciding happens through
// the existing generic /approvals/:id/approve|reject endpoints.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { ApprovalStepRepository } from '../approvals/repositories/approval-step.repository';
import { getApprovalTrail } from './approval-trail.util';
import { CreateStaffAppraisalDto } from './dto/create-staff-appraisal.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StaffAppraisalRepository } from './repositories/staff-appraisal.repository';

@Injectable()
export class FacultyAppraisalService {
  constructor(
    private readonly appraisalRepo: StaffAppraisalRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly approvalsService: ApprovalsService,
    private readonly stepRepo: ApprovalStepRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async list(personId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) return [];
    const appraisals = await this.appraisalRepo.findByStaffId(staffId);
    return Promise.all(
      appraisals.map(async (a) => ({
        ...a,
        approvalTrail: await getApprovalTrail(
          this.stepRepo,
          a.approvalRequestId,
        ),
      })),
    );
  }

  async get(personId: string, id: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    const appraisal = await this.appraisalRepo.findById(id);
    if (!appraisal || !staffId || appraisal.staffId !== staffId)
      throw new NotFoundException('Appraisal not found');
    return {
      ...appraisal,
      approvalTrail: await getApprovalTrail(
        this.stepRepo,
        appraisal.approvalRequestId,
      ),
    };
  }

  async create(personId: string, dto: CreateStaffAppraisalDto) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId)
      throw new ForbiddenException('No active staff record for this account.');

    return this.unitOfWork.run(async (client) => {
      const id = await this.appraisalRepo.create(
        {
          staffId,
          cycle: dto.cycle,
          selfAssessment: dto.selfAssessment,
          attachmentObjectKey: dto.attachmentObjectKey ?? null,
          attachmentFileName: dto.attachmentFileName ?? null,
        },
        client,
      );
      await this.approvalsService.createRequest(
        {
          requestType: 'STAFF_APPRAISAL',
          subjectObjectType: 'staff_appraisal',
          subjectObjectId: id,
          requestedBy: personId,
          payload: { cycle: dto.cycle },
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'FACULTY',
          action: 'STAFF_APPRAISAL_SUBMITTED',
          objectType: 'staff_appraisal',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { cycle: dto.cycle },
        },
        client,
      );
      return this.appraisalRepo.findById(id, client);
    });
  }
}
