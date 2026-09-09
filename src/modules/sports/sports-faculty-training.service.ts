// Feature #13 — training sessions + attendance. Sport-scoped via the
// session's own team.sport_id (same pattern as equipment/OD requests).

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { RecordTrainingAttendanceDto } from './dto/record-training-attendance.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { isForeignKeyViolation } from './pg-error.util';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';
import {
  TrainingAttendanceRepository,
  TrainingAttendanceRow,
} from './repositories/training-attendance.repository';
import {
  TrainingSessionRepository,
  TrainingSessionRow,
} from './repositories/training-session.repository';

@Injectable()
export class SportsFacultyTrainingService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly sessionRepo: TrainingSessionRepository,
    private readonly attendanceRepo: TrainingAttendanceRepository,
    private readonly audit: AuditService,
  ) {}

  private async requireActiveFaculty(actor: AuthenticatedUser): Promise<void> {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE')
      throw new ForbiddenException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);
  }

  async list(actor: AuthenticatedUser): Promise<TrainingSessionRow[]> {
    await this.requireActiveFaculty(actor);
    const sportIds = await this.sportsFacultyRepo.findActiveSportIdsForFaculty(
      actor.personId,
    );
    return this.sessionRepo.findBySportIds(sportIds);
  }

  private async getAuthorizedSessionOrThrow(
    actor: AuthenticatedUser,
    sessionId: string,
  ): Promise<TrainingSessionRow> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      session.sportId,
    );
    if (!authorized) throw new NotFoundException('Training session not found');
    return session;
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateTrainingSessionDto,
  ): Promise<TrainingSessionRow> {
    await this.requireActiveFaculty(actor);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForTeam(
      actor.personId,
      dto.teamId,
    );
    if (!authorized) throw new NotFoundException(SPORTS_ERRORS.TEAM_NOT_FOUND);

    try {
      const session = await this.sessionRepo.create(dto);
      await this.audit.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'FACULTY',
        action: 'SPORTS_TRAINING_SESSION_CREATED',
        objectType: 'training_session',
        objectId: session.id,
        outcome: 'SUCCESS',
        afterData: session,
      });
      return session;
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'conductedByCoachId does not refer to a real, existing coach',
        );
      throw err;
    }
  }

  async update(
    actor: AuthenticatedUser,
    sessionId: string,
    dto: UpdateTrainingSessionDto,
  ): Promise<TrainingSessionRow> {
    await this.requireActiveFaculty(actor);
    const existing = await this.getAuthorizedSessionOrThrow(actor, sessionId);
    const updated = await this.sessionRepo.update(sessionId, dto);
    await this.audit.record({
      actorPersonId: actor.personId,
      actorRoleCode: 'FACULTY',
      action: 'SPORTS_TRAINING_SESSION_UPDATED',
      objectType: 'training_session',
      objectId: sessionId,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated!;
  }

  async recordAttendance(
    actor: AuthenticatedUser,
    sessionId: string,
    dto: RecordTrainingAttendanceDto,
  ): Promise<TrainingAttendanceRow[]> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedSessionOrThrow(actor, sessionId);

    try {
      const records = await this.attendanceRepo.recordMany(
        sessionId,
        dto.entries,
        actor.personId,
      );
      await this.audit.record({
        actorPersonId: actor.personId,
        actorRoleCode: 'FACULTY',
        action: 'SPORTS_TRAINING_ATTENDANCE_RECORDED',
        objectType: 'training_session',
        objectId: sessionId,
        outcome: 'SUCCESS',
        afterData: { count: dto.entries.length },
      });
      return records;
    } catch (err) {
      if (isForeignKeyViolation(err))
        throw new NotFoundException(
          'One or more studentIds do not refer to real, existing students',
        );
      throw err;
    }
  }

  async listAttendance(
    actor: AuthenticatedUser,
    sessionId: string,
  ): Promise<TrainingAttendanceRow[]> {
    await this.requireActiveFaculty(actor);
    await this.getAuthorizedSessionOrThrow(actor, sessionId);
    return this.attendanceRepo.findBySession(sessionId);
  }
}
