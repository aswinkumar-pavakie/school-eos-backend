// Registers Sports' subject_object_type handler with the generic approvals
// engine at startup — same seam as FinanceApprovalHandlers. On approval, this
// is the one place that bridges a sport_od_request to the ALREADY-LIVE
// student_event/student_event_participant tables: creates one all-day
// student_event for the fixture and adds every active roster student as a
// participant, so the existing parent-facing consent screen (sign/reject with a
// real digital signature) picks it up completely unchanged.
//
// Equipment restock requests (SPORTS_EQUIPMENT_REQUEST) deliberately do NOT get
// a new handler here — they route to the SAME 'purchase_request' subject type
// Finance already registered (see finance-approval-handlers.service.ts), just
// under a different approval_policy.request_type. Only the stock-increment on
// delivery (not on approval) is Sports-specific — see PurchaseRequestsService.
// allotOrder's own equipmentId hook.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { SubjectStateRegistry } from '../approvals/subject-state.registry';
import { StudentEventParticipantRepository } from '../student-events/repositories/student-event-participant.repository';
import { StudentEventRepository } from '../student-events/repositories/student-event.repository';
import { SportOdRequestRepository } from './repositories/sport-od-request.repository';
import { TeamMemberRepository } from './repositories/team-member.repository';

@Injectable()
export class SportsApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly odRequestRepo: SportOdRequestRepository,
    private readonly teamMemberRepo: TeamMemberRepository,
    private readonly studentEventRepo: StudentEventRepository,
    private readonly participantRepo: StudentEventParticipantRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register('sport_od_request', {
      onApproved: async (id, executor, decidedBy) => {
        const request = await this.odRequestRepo.findById(id, executor);
        if (!request) return; // approval_request found it fine; defensive only.

        // All-day window — an OD excuses the student for the whole match day,
        // not a specific class period.
        const startsAt = `${request.eventDate}T00:00:00.000Z`;
        const endsAt = `${request.eventDate}T23:59:59.000Z`;

        const event = await this.studentEventRepo.create(
          {
            name: `On-duty — ${request.teamName} (${request.sportName})`,
            location: 'TBD — see fixture',
            purpose: `On-duty for a ${request.sportName} match: ${request.reason}`,
            startsAt,
            endsAt,
            // The PT teacher who raised the request is the monitoring teacher —
            // matches student_event's own "who supervises this" semantics.
            monitoringTeacherPersonId: request.requestedBy,
            createdBy: request.requestedBy,
          },
          executor,
        );

        const roster = await this.teamMemberRepo.findActiveByTeam(
          request.teamId,
          executor,
        );
        for (const member of roster) {
          await this.participantRepo.create(
            {
              eventId: event.id,
              studentId: member.studentId,
              addedBy: decidedBy,
            },
            executor,
          );
        }

        await this.odRequestRepo.markApproved(id, event.id, executor);
      },
      onRejected: async (id, executor) => {
        await this.odRequestRepo.setState(id, 'REJECTED', executor);
      },
      onWithdrawn: async (id, executor) => {
        await this.odRequestRepo.setState(id, 'CANCELLED', executor);
      },
    });
  }
}
