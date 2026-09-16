// The one genuinely new query this module needs: "which students are
// currently allocated to these hostels" (the reverse of
// StudentHostelRepository's own student->hostel direction, which the Warden
// relationship endpoint needs going hostel->students). Reuses
// HostelAllocationRepository's own proven filter (hostelIds/status) rather
// than re-deriving the bed->room->floor->block->hostel chain a fourth time.

import { Injectable } from '@nestjs/common';
import { HostelAllocationRepository } from '../../hostel/repositories/hostel-allocation.repository';
import type { Queryable } from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class HostelRelationshipRepository {
  constructor(private readonly allocationRepo: HostelAllocationRepository) {}

  async findCurrentStudentIdsForHostels(
    hostelIds: string[],
    executor?: Queryable,
  ): Promise<string[]> {
    if (hostelIds.length === 0) return [];
    const rows = await this.allocationRepo.findMany(
      { hostelIds, status: 'ACTIVE' },
      executor,
    );
    return [...new Set(rows.map((r) => r.studentId))];
  }
}
