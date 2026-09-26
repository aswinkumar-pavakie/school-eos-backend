// Health In-charge console logic. Design rules:
//  * every write is one transaction that includes its audit row;
//  * serious visits (sent home / referred / sickbay admit) tell the guardians in the SAME
//    transaction, so a visit can never be saved "notified" without the notice existing;
//  * the role only ever touches students who are ACTIVE, and never edits history
//    (a visit's student and complaint are fixed once recorded).

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import {
  CreateEscalationDto,
  CreateInfirmaryVisitDto,
  UpdateInfirmaryVisitDto,
  UpsertHealthProfileDto,
} from './dto/health-incharge.dto';
import { HealthInchargeRepository } from './repositories/health-incharge.repository';
import { HealthRepository } from './repositories/health.repository';

const SERIOUS_ACTIONS = ['SENT_HOME', 'REFERRED', 'SICKBAY_ADMIT'];
const ROLE = 'HEALTH_INCHARGE';

@Injectable()
export class HealthInchargeService {
  constructor(
    private readonly repo: HealthInchargeRepository,
    private readonly readRepo: HealthRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async dashboard() {
    const [counts, recentVisits, needsNotice, openAlerts] = await Promise.all([
      this.repo.dashboardCounts(),
      this.readRepo.findInfirmaryVisits({ limit: 8 }),
      this.readRepo.findInfirmaryVisits({ needsParentNotice: true, limit: 6 }),
      this.readRepo.findAlerts({ acknowledged: false, limit: 6 }),
    ]);
    return { counts, recentVisits, needsNotice, openAlerts };
  }

  searchStudents(search: string | undefined) {
    return this.repo.searchStudents(search, 25);
  }

  /** Everything the health desk needs about one student, on one screen. */
  async studentSummary(studentId: string) {
    const student = await this.repo.findActiveStudent(studentId);
    if (!student) throw new NotFoundException('Student not found');
    const [profile, consents, visits, escalations] = await Promise.all([
      this.readRepo.findProfileByStudentId(studentId),
      this.readRepo.findConsentsByStudentId(studentId),
      this.readRepo.findInfirmaryVisits({ studentId, limit: 30 }),
      this.readRepo.findEscalations({ studentId, limit: 30 }),
    ]);
    return { student, profile, consents, visits, escalations };
  }

  async saveProfile(studentId: string, dto: UpsertHealthProfileDto, actorPersonId: string) {
    const student = await this.repo.findActiveStudent(studentId);
    if (!student) throw new NotFoundException('Student not found');
    const clean = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null);
    const input = {
      bloodGroup: dto.bloodGroup ?? null,
      heightCm: dto.heightCm ?? null,
      weightKg: dto.weightKg ?? null,
      measuredOn: dto.measuredOn ?? null,
      familyDoctor: clean(dto.familyDoctor),
      doctorPhone: clean(dto.doctorPhone),
      insuranceRef: clean(dto.insuranceRef),
      notes: clean(dto.notes),
    };
    const before = await this.readRepo.findProfileByStudentId(studentId);
    await this.unitOfWork.run(async (client) => {
      await this.repo.upsertProfile(studentId, input, actorPersonId, client);
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: ROLE,
          action: 'HEALTH_PROFILE_SAVED',
          objectType: 'health_profile',
          objectId: studentId,
          outcome: 'SUCCESS',
          beforeData: before ?? undefined,
          afterData: input,
        },
        client,
      );
    });
    return this.readRepo.findProfileByStudentId(studentId);
  }

  listVisits(filter: {
    studentId?: string;
    action?: string;
    from?: string;
    to?: string;
    needsParentNotice?: boolean;
  }) {
    return this.readRepo.findInfirmaryVisits({ ...filter, limit: 200 });
  }

  async createVisit(dto: CreateInfirmaryVisitDto, actorPersonId: string) {
    const student = await this.repo.findActiveStudent(dto.studentId);
    if (!student) throw new NotFoundException('Student not found or not active');

    const notify = dto.notifyParent ?? SERIOUS_ACTIONS.includes(dto.action);
    const vitals = dto.vitals ? { ...dto.vitals } : null;

    const { visitId, guardiansNotified } = await this.unitOfWork.run(async (client) => {
      const id = await this.repo.createVisit(
        {
          studentId: dto.studentId,
          complaint: dto.complaint.trim(),
          vitals: vitals && Object.keys(vitals).length > 0 ? vitals : null,
          observation: dto.observation?.trim() || null,
          action: dto.action,
          outcome: dto.outcome?.trim() || null,
        },
        actorPersonId,
        client,
      );
      let told = 0;
      if (notify) {
        told = await this.repo.notifyGuardians(id, client);
        if (told > 0) await this.repo.markParentNotified(id, client);
      }
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: ROLE,
          action: 'INFIRMARY_VISIT_RECORDED',
          objectType: 'infirmary_visit',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { studentId: dto.studentId, action: dto.action, guardiansNotified: told },
        },
        client,
      );
      return { visitId: id, guardiansNotified: told };
    });

    const [visit] = await this.readRepo.findInfirmaryVisits({ id: visitId, limit: 1 });
    return { visit, guardiansNotified, noGuardianOnFile: notify && guardiansNotified === 0 };
  }

  async updateVisit(id: string, dto: UpdateInfirmaryVisitDto, actorPersonId: string) {
    if (dto.observation === undefined && dto.outcome === undefined && dto.action === undefined) {
      throw new BadRequestException('Nothing to update.');
    }
    const existing = await this.repo.findVisitBasics(id);
    if (!existing) throw new NotFoundException('Visit not found');
    await this.unitOfWork.run(async (client) => {
      await this.repo.updateVisit(
        id,
        { observation: dto.observation?.trim(), outcome: dto.outcome?.trim(), action: dto.action },
        client,
      );
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: ROLE,
          action: 'INFIRMARY_VISIT_UPDATED',
          objectType: 'infirmary_visit',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: { action: existing.action },
          afterData: dto,
        },
        client,
      );
    });
    const [visit] = await this.readRepo.findInfirmaryVisits({ id, limit: 1 });
    return visit;
  }

  /** Tell the guardians now (for a visit recorded without notifying them). */
  async notifyParent(id: string, actorPersonId: string) {
    const visit = await this.repo.findVisitBasics(id);
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.parentNotifiedAt) throw new ConflictException('The guardians were already notified about this visit.');
    return this.unitOfWork.run(async (client) => {
      const told = await this.repo.notifyGuardians(id, client);
      if (told === 0) throw new BadRequestException('There is no active guardian on file to notify.');
      await this.repo.markParentNotified(id, client);
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: ROLE,
          action: 'INFIRMARY_PARENT_NOTIFIED',
          objectType: 'infirmary_visit',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { guardiansNotified: told },
        },
        client,
      );
      return { guardiansNotified: told };
    });
  }

  listAlerts(status: 'open' | 'done' | undefined) {
    return this.readRepo.findAlerts({
      acknowledged: status === 'done' ? true : status === 'open' ? false : undefined,
      limit: 200,
    });
  }

  async acknowledgeAlert(id: string, actorPersonId: string) {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Invalid alert id.');
    const done = await this.repo.acknowledgeAlert(id, actorPersonId);
    if (!done) {
      if (await this.repo.alertExists(id)) throw new ConflictException('This alert was already acknowledged.');
      throw new NotFoundException('Alert not found');
    }
    await this.audit.record({
      actorPersonId,
      actorRoleCode: ROLE,
      action: 'HEALTH_ALERT_ACKNOWLEDGED',
      objectType: 'health_alert',
      outcome: 'SUCCESS',
      afterData: { alertId: id },
    });
    return { acknowledged: true };
  }

  listEscalations(studentId: string | undefined) {
    return this.readRepo.findEscalations({ studentId, limit: 200 });
  }

  async createEscalation(dto: CreateEscalationDto, actorPersonId: string) {
    const visit = await this.repo.findVisitBasics(dto.visitId);
    if (!visit) throw new NotFoundException('Visit not found');
    return this.unitOfWork.run(async (client) => {
      await this.repo.lockEscalationThread(dto.visitId, client);
      const sequenceNo = await this.repo.createEscalation(
        {
          visitId: dto.visitId,
          studentId: visit.studentId,
          contactedName: dto.contactedName.trim(),
          channel: dto.channel,
          response: dto.response?.trim() || null,
          outcome: dto.outcome?.trim() || null,
        },
        client,
      );
      await this.audit.record(
        {
          actorPersonId,
          actorRoleCode: ROLE,
          action: 'MEDICAL_ESCALATION_LOGGED',
          objectType: 'infirmary_visit',
          objectId: dto.visitId,
          outcome: 'SUCCESS',
          afterData: { sequenceNo, channel: dto.channel },
        },
        client,
      );
      return { sequenceNo };
    });
  }
}
