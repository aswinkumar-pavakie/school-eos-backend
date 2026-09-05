import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { VehicleRouteAssignmentRepository } from './repositories/vehicle-route-assignment.repository';
import { CreateVehicleRouteAssignmentDto } from './dto/create-vehicle-route-assignment.dto';
import { UpdateVehicleRouteAssignmentDto } from './dto/update-vehicle-route-assignment.dto';
import { VehicleRouteAssignmentQueryDto } from './dto/vehicle-route-assignment-query.dto';
import { isForeignKeyViolation } from './pg-error.util';

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
      throw err;
    }
  }

  async update(id: string, dto: UpdateVehicleRouteAssignmentDto, actorPersonId: string) {
    const existing = await this.get(id);
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
      throw err;
    }
  }
}
