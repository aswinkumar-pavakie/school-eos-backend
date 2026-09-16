import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from '../approvals/approvals.service';
import { RouteRepository } from './repositories/route.repository';
import { RouteStopRepository } from './repositories/route-stop.repository';
import { StudentTransportAllocationRepository } from './repositories/student-transport-allocation.repository';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateRouteStopDto } from './dto/create-route-stop.dto';
import { UpdateRouteStopDto } from './dto/update-route-stop.dto';
import { RequestRouteDeactivateDto } from './dto/request-route-deactivate.dto';
import { RequestRouteStopDeleteDto } from './dto/request-route-stop-delete.dto';
import { isForeignKeyViolation, isUniqueViolation } from './pg-error.util';

@Injectable()
export class RoutesService {
  constructor(
    private readonly routeRepo: RouteRepository,
    private readonly routeStopRepo: RouteStopRepository,
    private readonly studentTransportAllocationRepo: StudentTransportAllocationRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
    private readonly approvalsService: ApprovalsService,
  ) {}

  list() {
    return this.routeRepo.findMany();
  }

  async get(id: string) {
    const route = await this.routeRepo.findById(id);
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async create(dto: CreateRouteDto, actorPersonId: string) {
    try {
      const created = await this.routeRepo.create(dto);
      await this.auditService.record({
        actorPersonId,
        action: 'ROUTE_CREATED',
        objectType: 'route',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A route with this name or code already exists.',
        );
      throw err;
    }
  }

  async update(id: string, dto: UpdateRouteDto, actorPersonId: string) {
    const existing = await this.get(id);
    try {
      const updated = await this.routeRepo.update(id, dto);
      if (!updated) throw new NotFoundException('Route not found');
      await this.auditService.record({
        actorPersonId,
        action: 'ROUTE_UPDATED',
        objectType: 'route',
        objectId: id,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A route with this name or code already exists.',
        );
      throw err;
    }
  }

  async listStops(routeId: string) {
    await this.get(routeId);
    return this.routeStopRepo.findByRouteId(routeId);
  }

  async listAssignedStudents(routeId: string) {
    await this.get(routeId);
    return this.studentTransportAllocationRepo.findAssignedForRoute(routeId);
  }

  async createStop(
    routeId: string,
    dto: CreateRouteStopDto,
    actorPersonId: string,
  ) {
    await this.get(routeId);
    try {
      const created = await this.routeStopRepo.create(routeId, dto);
      await this.auditService.record({
        actorPersonId,
        action: 'ROUTE_STOP_CREATED',
        objectType: 'route_stop',
        objectId: created.id,
        outcome: 'SUCCESS',
        afterData: created,
      });
      return created;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A stop with this sequence number already exists on this route.',
        );
      throw err;
    }
  }

  async updateStop(
    stopId: string,
    dto: UpdateRouteStopDto,
    actorPersonId: string,
  ) {
    const existing = await this.routeStopRepo.findById(stopId);
    if (!existing) throw new NotFoundException('Route stop not found');
    try {
      const updated = await this.routeStopRepo.update(stopId, dto);
      if (!updated) throw new NotFoundException('Route stop not found');
      await this.auditService.record({
        actorPersonId,
        action: 'ROUTE_STOP_UPDATED',
        objectType: 'route_stop',
        objectId: stopId,
        outcome: 'SUCCESS',
        beforeData: existing,
        afterData: updated,
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          'A stop with this sequence number already exists on this route.',
        );
      throw err;
    }
  }

  async deleteStop(stopId: string, actorPersonId: string) {
    try {
      const deleted = await this.routeStopRepo.delete(stopId);
      if (!deleted) throw new NotFoundException('Route stop not found');
      await this.auditService.record({
        actorPersonId,
        action: 'ROUTE_STOP_DELETED',
        objectType: 'route_stop',
        objectId: stopId,
        outcome: 'SUCCESS',
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          'This stop is still referenced by a student transport allocation and cannot be deleted.',
        );
      }
      throw err;
    }
  }

  /** No real hard-delete for a route anywhere in this app -- see
   * VehiclesService.requestDeactivate's own comment on this codebase's
   * "deactivate, not delete" convention. Transport Manager's own request to
   * deactivate (status -> INACTIVE), routed through the generic approvals
   * engine to a real ADMIN decision. */
  async requestDeactivate(
    id: string,
    dto: RequestRouteDeactivateDto,
    actorPersonId: string,
  ) {
    const route = await this.get(id);
    return this.unitOfWork.run(async (client) => {
      const { rows: pending } = await client.query(
        `SELECT id FROM approval_request WHERE subject_object_type = 'route' AND subject_object_id = $1 AND state IN ('PENDING', 'RETROSPECTIVE_PENDING') LIMIT 1`,
        [id],
      );
      if (pending[0]) {
        throw new ConflictException(
          'A deactivation request for this route is already pending Admin review.',
        );
      }
      const request = await this.approvalsService.createRequest(
        {
          requestType: 'ROUTE_DEACTIVATE',
          subjectObjectType: 'route',
          subjectObjectId: id,
          requestedBy: actorPersonId,
          payload: { name: route.name, code: route.code, reason: dto.reason },
        },
        client,
      );
      await this.auditService.record(
        {
          actorPersonId,
          action: 'ROUTE_DEACTIVATE_REQUESTED',
          objectType: 'route',
          objectId: id,
          outcome: 'SUCCESS',
          afterData: { approvalRequestId: request.id, reason: dto.reason },
        },
        client,
      );
      return request;
    });
  }

  /** The real hard DELETE (deleteStop above) stays ADMIN-only -- this is
   * Transport Manager's own request to delete a stop, routed through the
   * generic approvals engine to a real ADMIN decision. */
  async requestDeleteStop(
    stopId: string,
    dto: RequestRouteStopDeleteDto,
    actorPersonId: string,
  ) {
    const stop = await this.routeStopRepo.findById(stopId);
    if (!stop) throw new NotFoundException('Route stop not found');
    return this.unitOfWork.run(async (client) => {
      const { rows: pending } = await client.query(
        `SELECT id FROM approval_request WHERE subject_object_type = 'route_stop' AND subject_object_id = $1 AND state IN ('PENDING', 'RETROSPECTIVE_PENDING') LIMIT 1`,
        [stopId],
      );
      if (pending[0]) {
        throw new ConflictException(
          'A deletion request for this stop is already pending Admin review.',
        );
      }
      const request = await this.approvalsService.createRequest(
        {
          requestType: 'ROUTE_STOP_DELETE',
          subjectObjectType: 'route_stop',
          subjectObjectId: stopId,
          requestedBy: actorPersonId,
          payload: { stopName: stop.stopName, routeId: stop.routeId, reason: dto.reason },
        },
        client,
      );
      await this.auditService.record(
        {
          actorPersonId,
          action: 'ROUTE_STOP_DELETE_REQUESTED',
          objectType: 'route_stop',
          objectId: stopId,
          outcome: 'SUCCESS',
          afterData: { approvalRequestId: request.id, reason: dto.reason },
        },
        client,
      );
      return request;
    });
  }
}
