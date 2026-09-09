// Faculty-side: create an event, search/add/remove students, delete an event.
// Every :id route re-checks created_by = actor.personId first -- a faculty
// member only ever manages events they themselves created (mirrors
// MediaInventoryController.assertOwnedByMedia's own-scope boundary).

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GradeRepository } from '../academic/repositories/grade.repository';
import { SectionRepository } from '../academic/repositories/section.repository';
import { StaffRepository } from '../people/repositories/staff.repository';
import { StaffQueryDto } from '../people/dto/staff-query.dto';
import { StaffService } from '../people/staff.service';
import { StudentQueryDto } from '../people/dto/student-query.dto';
import { StudentsService } from '../people/students.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AddParticipantDto } from './dto/add-participant.dto';
import { CreateStudentEventDto } from './dto/create-student-event.dto';
import { PermissionLetterDataService } from './permission-letter-data.service';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';
import {
  ParticipantRow,
  StudentEventParticipantRepository,
} from './repositories/student-event-participant.repository';
import {
  StudentEventRepository,
  StudentEventRow,
} from './repositories/student-event.repository';
import { EVENT_SIGNATURES_BUCKET } from './student-event-storage.util';

export interface StudentEventWithParticipants extends StudentEventRow {
  participants: ParticipantRow[];
}

@Injectable()
export class StudentEventsService {
  constructor(
    private readonly eventRepo: StudentEventRepository,
    private readonly participantRepo: StudentEventParticipantRepository,
    private readonly staffRepo: StaffRepository,
    private readonly staffService: StaffService,
    private readonly studentsService: StudentsService,
    private readonly gradeRepo: GradeRepository,
    private readonly sectionRepo: SectionRepository,
    private readonly storage: StorageService,
    private readonly letterDataService: PermissionLetterDataService,
    private readonly audit: AuditService,
  ) {}

  async list(actorPersonId: string): Promise<StudentEventRow[]> {
    return this.eventRepo.findByCreator(actorPersonId);
  }

  private async getOwned(
    id: string,
    actorPersonId: string,
  ): Promise<StudentEventRow> {
    const event = await this.eventRepo.findById(id);
    if (!event) throw new NotFoundException('Event not found');
    if (event.createdBy !== actorPersonId)
      throw new NotFoundException('Event not found');
    return event;
  }

  async get(
    id: string,
    actorPersonId: string,
  ): Promise<StudentEventWithParticipants> {
    const event = await this.getOwned(id, actorPersonId);
    const participants = await this.participantRepo.findByEventId(id);
    return { ...event, participants };
  }

  async create(
    dto: CreateStudentEventDto,
    actorPersonId: string,
  ): Promise<StudentEventRow> {
    if (new Date(dto.endsAt).getTime() <= new Date(dto.startsAt).getTime()) {
      throw new ConflictException('endsAt must be after startsAt.');
    }
    const teacher = await this.staffRepo.findByPersonId(
      dto.monitoringTeacherPersonId,
    );
    if (!teacher)
      throw new NotFoundException(
        'monitoringTeacherPersonId does not refer to a real, existing staff member.',
      );

    try {
      const created = await this.eventRepo.create({
        ...dto,
        createdBy: actorPersonId,
      });
      await this.audit.record({
        actorPersonId,
        actorRoleCode: 'FACULTY',
        action: 'STUDENT_EVENT_CREATED',
        objectType: 'student_event',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'monitoringTeacherPersonId does not refer to a real, existing person.',
        );
      throw err;
    }
  }

  /** Once a parent has signed (APPROVED), that participant row is a real,
   * legally-relevant consent record -- it must never disappear, whether by
   * removing the student directly or by deleting the whole event out from
   * under it (student_event_participant cascades on event delete, so the
   * second path would silently destroy the same signed record the first path
   * already refuses to touch). PENDING and REJECTED stay freely removable --
   * deleting a rejected request and re-adding the student is the intended way
   * to give a family a fresh request. Mirrors the same "a decided record is
   * immutable" convention already used for Concessions
   * (concessions.service.ts's own assertStillOpen). */
  private assertRemovable(
    participant: Pick<ParticipantRow, 'state' | 'studentName'>,
  ): void {
    if (participant.state === 'APPROVED') {
      throw new ConflictException(
        `${participant.studentName}'s parent has already signed and approved this request -- it is a real consent record and cannot be deleted. Remove students who are still waiting or were rejected instead.`,
      );
    }
  }

  async delete(id: string, actorPersonId: string): Promise<void> {
    const event = await this.getOwned(id, actorPersonId);
    const participants = await this.participantRepo.findByEventId(id);
    const approved = participants.filter((p) => p.state === 'APPROVED');
    if (approved.length > 0) {
      throw new ConflictException(
        `${approved.length} student${approved.length > 1 ? 's have' : ' has'} an approved, signed permission for this event -- it cannot be deleted while a signed consent record exists. Remove only the students who are still waiting or were rejected, or keep this event.`,
      );
    }
    await this.eventRepo.delete(id); // cascades student_event_participant rows
    for (const p of participants) {
      if (p.signatureObjectKey) {
        await this.storage.removeBestEffort(
          EVENT_SIGNATURES_BUCKET,
          p.signatureObjectKey,
        );
      }
    }
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'FACULTY',
      action: 'STUDENT_EVENT_DELETED',
      objectType: 'student_event',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: { ...event, participantCount: participants.length },
    });
  }

  /** Case-insensitive name/roll-no search + grade/section filter -- reuses
   * StudentsService.list as-is (see student.repository.ts's own widened search,
   * which now also matches roll_no) rather than a second search implementation. */
  async searchStudents(query: StudentQueryDto) {
    return this.studentsService.list(query);
  }

  /** Real staff search for the monitoring-teacher picker -- reuses
   * StaffService.list as-is. */
  async searchTeachers(query: StaffQueryDto) {
    return this.staffService.list(query);
  }

  /** Real class/section options for the student-search filter (not free text). */
  async listGrades() {
    return this.gradeRepo.findMany();
  }

  async listSections(gradeId?: string) {
    return this.sectionRepo.findMany({ gradeId, status: 'ACTIVE' });
  }

  async addParticipant(
    eventId: string,
    dto: AddParticipantDto,
    actorPersonId: string,
  ): Promise<ParticipantRow> {
    await this.getOwned(eventId, actorPersonId);
    try {
      const created = await this.participantRepo.create({
        eventId,
        studentId: dto.studentId,
        addedBy: actorPersonId,
      });
      await this.audit.record({
        actorPersonId,
        actorRoleCode: 'FACULTY',
        action: 'STUDENT_EVENT_PARTICIPANT_ADDED',
        objectType: 'student_event_participant',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'This student has already been added to this event.',
        );
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'studentId does not refer to a real, existing student.',
        );
      throw err;
    }
  }

  async removeParticipant(
    eventId: string,
    participantId: string,
    actorPersonId: string,
  ): Promise<void> {
    await this.getOwned(eventId, actorPersonId);
    const participant = await this.participantRepo.findById(participantId);
    if (!participant || participant.eventId !== eventId)
      throw new NotFoundException('Student not found on this event');
    this.assertRemovable(participant);
    await this.participantRepo.delete(participantId);
    if (participant.signatureObjectKey) {
      await this.storage.removeBestEffort(
        EVENT_SIGNATURES_BUCKET,
        participant.signatureObjectKey,
      );
    }
    await this.audit.record({
      actorPersonId,
      actorRoleCode: 'FACULTY',
      action: 'STUDENT_EVENT_PARTICIPANT_REMOVED',
      objectType: 'student_event_participant',
      objectId: participantId,
      outcome: 'SUCCESS',
      beforeData: participant,
    });
  }

  async getPermissionLetter(
    eventId: string,
    participantId: string,
    actorPersonId: string,
  ) {
    await this.getOwned(eventId, actorPersonId);
    const participant = await this.participantRepo.findById(participantId);
    if (!participant || participant.eventId !== eventId)
      throw new NotFoundException('Student not found on this event');
    return this.letterDataService.build(participantId);
  }
}
