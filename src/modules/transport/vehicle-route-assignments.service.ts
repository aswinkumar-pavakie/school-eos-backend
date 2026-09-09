import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { VehicleRouteAssignmentRepository, type VehicleRouteAssignmentRow } from './repositories/vehicle-route-assignment.repository';
import { CreateVehicleRouteAssignmentDto } from './dto/create-vehicle-route-assignment.dto';
import { UpdateVehicleRouteAssignmentDto } from './dto/update-vehicle-route-assignment.dto';
import { VehicleRouteAssignmentQueryDto } from './dto/vehicle-route-assignment-query.dto';
import { isExclusionViolation, isForeignKeyViolation } from './pg-error.util';

/** Which of vehicle/driver/attendant an overlapping row actually collides on --
 * for a clear error message rather than a generic "conflict". */
function describeOverlap(
  input: { vehicleId: string; driverId?: string | null; attendantId?: string | null },
  other: VehicleRouteAssignmentRow,
): string {
  if (other.vehicleId === input.vehicleId) return 'This vehicle is already assigned to another route in this date range.';
  if (input.driverId && other.driverId === input.driverId) return 'This driver is already assigned to another route in this date range.';
  if (input.attendantId && other.attendantId === input.attendantId) return 'This attendant is already assigned to another route in this date range.';
  return 'This assignment overlaps another assignment sharing the same vehicle, driver, or attendant.';
}

@Injectable()
export class VehicleRouteAssignmentsService {
  constructor(
    private readonly assignmentRepo: VehicleRouteAssignmentRepository,
    private readonly auditService: AuditService,
  ) {}

  list(query: VehicleRouteAssignmentQueryDto) {
    return this.assignmentRepo.findMany(query);
  }

  async get(id: string) {
    const assignment = await this.assignmentRepo.findById(id);
    if (!assignment) throw new NotFoundException('Vehicle route assignment not found');
    return assignment;
  }

  async create(dto: CreateVehicleRouteAssignmentDto, actorPersonId: string) {
    const overlapping = await this.assignmentRepo.findOverlapping(dto, null);
    if (overlapping.length > 0) {
      throw new ConflictException(describeOverlap(dto, overlapping[0]));
    }
    try {
      const created = await this.assignmentRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'VEHICLE_ROUTE_ASSIGNMENT_CREATED',
        objectType: 'vehicle_route_assignment',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException('vehicleId, routeId, driverId, or attendantId does not exist.');
      }
      if (isExclusionViolation(err)) {
        throw new ConflictException('This route already has an assignment covering this date range.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateVehicleRouteAssignmentDto, actorPersonId: string) {
    const existing = await this.get(id);
    const resulting = {
      vehicleId: existing.vehicleId,
      driverId: dto.driverId !== undefined ? dto.driverId : existing.driverId,
      attendantId: dto.attendantId !== undefined ? dto.attendantId : existing.attendantId,
      effectiveFrom: dto.effectiveFrom ?? existing.effectiveFrom,
      effectiveTo: dto.effectiveTo !== undefined ? dto.effectiveTo : existing.effectiveTo,
    };
    const overlapping = await this.assignmentRepo.findOverlapping(resulting, id);
    if (overlapping.length > 0) {
      throw new ConflictException(describeOverlap(resulting, overlapping[0]));
    }
    try {
      const updated = await this.assignmentRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Vehicle route assignment not found');
      await this.auditService.record({
        actorPersonId,
        action: 'VEHICLE_ROUTE_ASSIGNMENT_UPDATED',
        objectType: 'vehicle_route_assignment',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException('driverId or attendantId does not exist.');
      }
      if (isExclusionViolation(err)) {
        throw new ConflictException('This route already has an assignment covering this date range.');
      }
      throw err;
    }
  }
}
