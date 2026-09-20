import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { StudentDevelopmentRepository } from './repositories/student-development.repository';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { CreateMeritPointDto } from './dto/create-merit-point.dto';
import { UpdateMeritPointDto } from './dto/update-merit-point.dto';
import { CreateDisciplineIncidentDto } from './dto/create-discipline-incident.dto';

@Injectable()
export class StudentDevelopmentService {
  constructor(
    private readonly repo: StudentDevelopmentRepository,
    private readonly auditService: AuditService,
  ) {}

  listAchievements(studentId?: string) {
    return this.repo.findAchievements({ studentId });
  }

  async createAchievement(dto: CreateAchievementDto, actorPersonId: string) {
    const created = await this.repo.createAchievement(dto);
    await this.auditService.record({
      actorPersonId,
      action: 'ACHIEVEMENT_RECORDED',
      objectType: 'achievement',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: { ...dto },
    });
    return created;
  }

  listMeritPoints(studentId?: string) {
    return this.repo.findMeritPoints({ studentId });
  }

  async createMeritPoint(dto: CreateMeritPointDto, actorPersonId: string) {
    const created = await this.repo.createMeritPoint({ ...dto, awardedBy: actorPersonId });
    await this.auditService.record({
      actorPersonId,
      action: 'MERIT_POINT_AWARDED',
      objectType: 'merit_point',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: { ...dto },
    });
    return created;
  }

  // Edit/Delete for the Sports Admin console's own Houses & inter-house
  // screen -- genuinely unbuilt before this.
  async updateMeritPoint(id: string, dto: UpdateMeritPointDto, actorPersonId: string) {
    const existing = await this.repo.findMeritPointById(id);
    if (!existing) throw new NotFoundException('Merit point award not found');
    await this.repo.updateMeritPoint(id, dto);
    const updated = await this.repo.findMeritPointById(id);
    await this.auditService.record({
      actorPersonId,
      action: 'MERIT_POINT_UPDATED',
      objectType: 'merit_point',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async deleteMeritPoint(id: string, actorPersonId: string): Promise<void> {
    const existing = await this.repo.findMeritPointById(id);
    if (!existing) throw new NotFoundException('Merit point award not found');
    await this.repo.deleteMeritPoint(id);
    await this.auditService.record({
      actorPersonId,
      action: 'MERIT_POINT_DELETED',
      objectType: 'merit_point',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }

  listObservations(studentId?: string) {
    return this.repo.findObservations({ studentId });
  }

  listDisciplineIncidents(filter: { studentId?: string; state?: string }) {
    return this.repo.findDisciplineIncidents(filter);
  }

  async createDisciplineIncident(dto: CreateDisciplineIncidentDto, actorPersonId: string) {
    const created = await this.repo.createDisciplineIncident({ ...dto, reportedBy: actorPersonId });
    await this.auditService.record({
      actorPersonId,
      action: 'DISCIPLINE_INCIDENT_RECORDED',
      objectType: 'discipline_incident',
      objectId: created.id,
      outcome: 'SUCCESS',
      afterData: { ...dto },
    });
    return created;
  }
}
