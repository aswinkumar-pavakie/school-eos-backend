// Resolves "who is this Warden and which hostel(s) may they touch" -- the one place
// every hostel-warden service starts, mirroring OnlineClassesService.requireActiveFaculty
// (online-classes module): @Roles('HOSTEL_WARDEN') on the JWT only proves "this caller
// is *a* hostel warden somewhere", never "this caller may see *this* hostel's data" --
// every request re-derives the caller's real staff.id and their real, currently ACTIVE
// role_assignment(role_code='HOSTEL_WARDEN', scope_type='HOSTEL') rows, server-side,
// on every call. Client-supplied wardenId/staffId/hostelId are never trusted.

import { ForbiddenException, Injectable } from '@nestjs/common';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import type { Queryable } from '../../infrastructure/postgres/postgres.service';
import { StaffRepository } from '../people/repositories/staff.repository';
import { WardenAssignmentRepository } from './repositories/warden-assignment.repository';

export interface WardenContext {
  staffId: string;
  personId: string;
  hostelIds: string[];
}

@Injectable()
export class WardenContextService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly wardenAssignmentRepo: WardenAssignmentRepository,
  ) {}

  /** Throws ForbiddenException if the caller isn't an active staff member currently
   * holding at least one ACTIVE HOSTEL_WARDEN assignment. Never trusts anything
   * client-supplied -- personId comes from the verified JWT only. */
  async requireActiveWarden(
    personId: string,
    executor?: Queryable,
  ): Promise<WardenContext> {
    const staff = executor
      ? await this.staffRepo.findByPersonId(personId, executor)
      : await this.staffRepo.findByPersonId(personId);
    if (!staff || staff.status !== 'ACTIVE') {
      throw new ForbiddenException(HOSTEL_WARDEN_ERRORS.NOT_WARDEN);
    }
    const hostelIds = executor
      ? await this.wardenAssignmentRepo.findActiveHostelIdsForPerson(
          personId,
          executor,
        )
      : await this.wardenAssignmentRepo.findActiveHostelIdsForPerson(personId);
    if (hostelIds.length === 0) {
      throw new ForbiddenException(HOSTEL_WARDEN_ERRORS.NOT_WARDEN);
    }
    return { staffId: staff.id, personId, hostelIds };
  }
}
