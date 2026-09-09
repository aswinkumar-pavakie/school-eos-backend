import { BadRequestException, Injectable } from '@nestjs/common';
import { PersonsService } from '../admin/persons.service';
import { RoleAssignmentsService } from '../admin/role-assignments.service';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { CorrectAttendanceRecordDto } from '../attendance/dto/correct-attendance-record.dto';
import { GrantRoleAssignmentDto } from '../admin/dto/grant-role-assignment.dto';
import { InventoryItemsService } from '../inventory/inventory-items.service';
import { IssueInventoryItemDto } from '../inventory/dto/issue-inventory-item.dto';
import { TransferInventoryItemDto } from '../inventory/dto/transfer-inventory-item.dto';
import { CreateRepairRequestDto } from '../maintenance/dto/create-repair-request.dto';
import { RepairRequestsService } from '../maintenance/repair-requests.service';
import { StudentsService } from '../people/students.service';
import { ApprovalRequestRow } from './repositories/approval-request.repository';

// Fields an administrative student-record correction is allowed to touch --
// exactly UpdateStudentDto's own fields, all master-data/administrative, never
// marks/grades/promotion or anything else that would be an academic decision.
const STUDENT_CORRECTION_FIELDS = [
  'admissionNo',
  'stateStudentId',
  'mediumId',
  'motherTongue',
  'languageSubjectChoice',
  'communityCategory',
  'isFirstGenLearner',
  'isDifferentlyAbled',
  'supportNeeds',
  'bloodGroup',
  'isHosteller',
  'usesSchoolTransport',
  'commuteMode',
  'bankAccountRef',
] as const;

/** What actually happens to the real record when Admin approves one of the six
 * request types it's authorized to decide. Every branch calls the SAME service
 * the rest of the app already uses for that mutation (attendance correction,
 * person activate/deactivate, role grant/revoke, student update, inventory
 * issue/transfer, repair-request creation) -- never a parallel write path, so
 * there is exactly one authoritative record for each of these afterwards. */
@Injectable()
export class RequestEffectsService {
  constructor(
    private readonly attendanceRecordsService: AttendanceRecordsService,
    private readonly personsService: PersonsService,
    private readonly roleAssignmentsService: RoleAssignmentsService,
    private readonly studentsService: StudentsService,
    private readonly inventoryItemsService: InventoryItemsService,
    private readonly repairRequestsService: RepairRequestsService,
  ) {}

  async apply(
    request: ApprovalRequestRow,
    actorPersonId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const payload = request.payload ?? {};

    switch (request.requestType) {
      case 'ADMIN_ACCESS_REQUEST':
        return this.applyAdminAccess(payload, actorPersonId);
      case 'ATTENDANCE_CORRECTION_REQUEST':
        return this.applyAttendanceCorrection(payload, actorPersonId);
      case 'STUDENT_RECORD_CORRECTION_REQUEST':
        return this.applyStudentRecordCorrection(payload, actorPersonId);
      case 'INVENTORY_REQUEST':
        return this.applyInventoryRequest(payload, actorPersonId);
      case 'REPAIR_MAINTENANCE_REQUEST':
        return this.applyRepairRequest(payload, actorPersonId);
      case 'ADMIN_OTHER_REQUEST':
        // Purely a decision record -- no automatic system effect. Admin acts
        // on it through whatever existing screen the request actually concerns.
        return undefined;
      default:
        throw new BadRequestException(
          `Unknown request type: ${request.requestType}`,
        );
    }
  }

  private async applyAdminAccess(
    payload: Record<string, unknown>,
    actorPersonId: string,
  ) {
    const action = payload.action;
    const targetPersonId = payload.targetPersonId;
    if (typeof targetPersonId !== 'string' && action !== 'REVOKE_ROLE') {
      throw new BadRequestException('This request is missing targetPersonId.');
    }

    if (action === 'ACTIVATE') {
      await this.personsService.activate(
        targetPersonId as string,
        actorPersonId,
      );
      return { appliedAction: 'ACTIVATE', targetPersonId };
    }
    if (action === 'DEACTIVATE') {
      await this.personsService.deactivate(
        targetPersonId as string,
        actorPersonId,
      );
      return { appliedAction: 'DEACTIVATE', targetPersonId };
    }
    if (action === 'GRANT_ROLE') {
      const dto: GrantRoleAssignmentDto = {
        personId: targetPersonId as string,
        roleCode: payload.roleCode as string,
        scopeType: payload.scopeType as string,
        scopeId: payload.scopeId as string | undefined,
        scopeStage: payload.scopeStage as string | undefined,
        academicYearId: payload.academicYearId as string | undefined,
      };
      const created = await this.roleAssignmentsService.grant(
        dto,
        actorPersonId,
      );
      return { appliedAction: 'GRANT_ROLE', roleAssignmentId: created.id };
    }
    if (action === 'REVOKE_ROLE') {
      const roleAssignmentId = payload.roleAssignmentId;
      if (typeof roleAssignmentId !== 'string') {
        throw new BadRequestException(
          'This request is missing roleAssignmentId.',
        );
      }
      await this.roleAssignmentsService.revoke(roleAssignmentId, actorPersonId);
      return { appliedAction: 'REVOKE_ROLE', roleAssignmentId };
    }
    throw new BadRequestException(
      `Unknown admin access action: ${String(action)}`,
    );
  }

  private async applyAttendanceCorrection(
    payload: Record<string, unknown>,
    actorPersonId: string,
  ) {
    const attendanceRecordId = payload.attendanceRecordId;
    if (typeof attendanceRecordId !== 'string') {
      throw new BadRequestException(
        'This request is missing attendanceRecordId.',
      );
    }
    const dto: CorrectAttendanceRecordDto = {
      newStatus: payload.newStatus as string,
      reason: (payload.reason as string) ?? 'Approved via Requests & Approvals',
    };
    const result = await this.attendanceRecordsService.correct(
      attendanceRecordId,
      dto,
      actorPersonId,
    );
    return { attendanceRecordId, correctionId: result.correction.id };
  }

  private async applyStudentRecordCorrection(
    payload: Record<string, unknown>,
    actorPersonId: string,
  ) {
    const studentId = payload.studentId;
    const field = payload.field;
    if (typeof studentId !== 'string' || typeof field !== 'string') {
      throw new BadRequestException(
        'This request is missing studentId or field.',
      );
    }
    if (
      !STUDENT_CORRECTION_FIELDS.includes(
        field as (typeof STUDENT_CORRECTION_FIELDS)[number],
      )
    ) {
      throw new BadRequestException(
        `"${field}" isn't an administrative field this workflow can change -- academic fields aren't handled here.`,
      );
    }
    const updated = await this.studentsService.update(
      studentId,
      { [field]: payload.newValue },
      actorPersonId,
    );
    return {
      studentId,
      field,
      appliedValue: (updated as unknown as Record<string, unknown>)[field],
    };
  }

  private async applyInventoryRequest(
    payload: Record<string, unknown>,
    actorPersonId: string,
  ) {
    const itemId = payload.itemId;
    if (typeof itemId !== 'string')
      throw new BadRequestException('This request is missing itemId.');

    if (payload.action === 'ISSUE') {
      const dto: IssueInventoryItemDto = {
        assignedToPersonId: payload.assignedToPersonId as string,
        assignedOn: payload.assignedOn as string | undefined,
      };
      const updated = await this.inventoryItemsService.issue(
        itemId,
        dto,
        actorPersonId,
      );
      return { itemId, appliedAction: 'ISSUE', status: updated.status };
    }
    if (payload.action === 'TRANSFER') {
      const dto: TransferInventoryItemDto = {
        location: payload.location as string,
      };
      const updated = await this.inventoryItemsService.transfer(
        itemId,
        dto,
        actorPersonId,
      );
      return { itemId, appliedAction: 'TRANSFER', location: updated.location };
    }
    throw new BadRequestException(
      `Unknown inventory request action: ${String(payload.action)}`,
    );
  }

  private async applyRepairRequest(
    payload: Record<string, unknown>,
    actorPersonId: string,
  ) {
    const dto: CreateRepairRequestDto = {
      title: payload.title as string,
      inventoryItemId: payload.inventoryItemId as string | undefined,
      issueType: payload.issueType as string | undefined,
      location: payload.location as string | undefined,
      priority: payload.priority as string | undefined,
      description: payload.description as string,
      requestedOn: payload.requestedOn as string | undefined,
    };
    const created = await this.repairRequestsService.create(dto, actorPersonId);
    return { repairRequestId: created.id };
  }
}
