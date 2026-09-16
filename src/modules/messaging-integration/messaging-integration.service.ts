// Backs GET /internal/v1/messaging/relationships/{parent,faculty,warden}/:personId
// — computes the exact LLD §19-21 relationship algorithms, reusing every query
// already proven in messaging/repositories and hostel-warden/repositories
// rather than re-deriving them. Returns a flat, deduplicated list of related
// person IDs: that's all Messaging's authorization engine needs to answer
// "is this target in my direct scope" (LLD §73's own discovery response only
// ever exposes a coarse SCOPED/UNSCOPED distinction to the client anyway, so a
// finer per-relationship-type breakdown isn't required here).

import { Injectable } from '@nestjs/common';
import { ClassAdvisorRepository } from '../messaging/repositories/class-advisor.repository';
import { GuardianLinkRepository } from '../messaging/repositories/guardian-link.repository';
import { StaffRepository } from '../messaging/repositories/staff.repository';
import { SubjectOfferingRepository } from '../messaging/repositories/subject-offering.repository';
import type { SectionYearContext } from '../messaging/repositories/subject-offering.repository';
import { StudentGuardianRepository } from '../hostel-warden/repositories/student-guardian.repository';
import { StudentHostelRepository } from '../hostel-warden/repositories/student-hostel.repository';
import { WardenAssignmentRepository } from '../hostel-warden/repositories/warden-assignment.repository';
import { HostelRelationshipRepository } from './repositories/hostel-relationship.repository';

function dedupeSectionPairs(pairs: SectionYearContext[]): SectionYearContext[] {
  const seen = new Map<string, SectionYearContext>();
  for (const pair of pairs) {
    seen.set(`${pair.sectionId}:${pair.academicYearId}`, pair);
  }
  return [...seen.values()];
}

@Injectable()
export class MessagingIntegrationService {
  constructor(
    private readonly guardianLinkRepo: GuardianLinkRepository,
    private readonly classAdvisorRepo: ClassAdvisorRepository,
    private readonly subjectOfferingRepo: SubjectOfferingRepository,
    private readonly staffRepo: StaffRepository,
    private readonly wardenAssignmentRepo: WardenAssignmentRepository,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly studentGuardianRepo: StudentGuardianRepository,
    private readonly hostelRelationshipRepo: HostelRelationshipRepository,
  ) {}

  /** LLD §19: for each current active ward, the union of current subject
   * faculty + class advisor + same-section parents + current hostel warden
   * (if currently boarding). */
  async getParentRelationships(parentPersonId: string): Promise<string[]> {
    const wards = await this.guardianLinkRepo.findActiveWardEnrolments(parentPersonId);
    if (wards.length === 0) return [];

    const related = new Set<string>();
    const pairs = dedupeSectionPairs(
      wards.map((w) => ({ sectionId: w.sectionId, academicYearId: w.academicYearId })),
    );

    for (const pair of pairs) {
      const [teachers, advisors] = await Promise.all([
        this.subjectOfferingRepo.findActiveTeachersForSection(pair.sectionId, pair.academicYearId),
        this.classAdvisorRepo.findActiveAdvisorsForSection(pair.sectionId),
      ]);
      for (const t of teachers) related.add(t.personId);
      for (const a of advisors) related.add(a.personId);
    }

    const sameSectionParents = await this.guardianLinkRepo.findActiveGuardiansForSections(pairs);
    for (const p of sameSectionParents) related.add(p.parentPersonId);

    for (const ward of wards) {
      const hostelId = await this.studentHostelRepo.findCurrentHostelIdForStudent(ward.studentId);
      if (!hostelId) continue;
      const wardens = await this.wardenAssignmentRepo.findPersonIdsForHostel(hostelId);
      for (const w of wardens) related.add(w);
    }

    related.delete(parentPersonId);
    return [...related];
  }

  /** LLD §20: every (section, year) this faculty currently teaches or advises
   * -> union of co-faculty (subject teachers + class advisors) + that
   * section's current parents. Principal/VP are deliberately NOT included
   * here (LLD §24: "if target is Principal/VP: REQUIRE_REQUEST" even for
   * Faculty) — this endpoint reports only the ALLOW_DIRECT scope. */
  async getFacultyRelationships(facultyPersonId: string): Promise<string[]> {
    const staff = await this.staffRepo.findByPersonId(facultyPersonId);
    if (!staff || staff.status !== 'ACTIVE') return [];

    const [advisorSections, teachingSections] = await Promise.all([
      this.classAdvisorRepo.findActiveSectionsForAdvisor(facultyPersonId),
      this.subjectOfferingRepo.findActiveSectionsForTeacher(staff.id),
    ]);
    const pairs = dedupeSectionPairs([...advisorSections, ...teachingSections]);
    if (pairs.length === 0) return [];

    const related = new Set<string>();
    for (const pair of pairs) {
      const [teachers, advisors] = await Promise.all([
        this.subjectOfferingRepo.findActiveTeachersForSection(pair.sectionId, pair.academicYearId),
        this.classAdvisorRepo.findActiveAdvisorsForSection(pair.sectionId),
      ]);
      for (const t of teachers) related.add(t.personId);
      for (const a of advisors) related.add(a.personId);
    }

    const parents = await this.guardianLinkRepo.findActiveGuardiansForSections(pairs);
    for (const p of parents) related.add(p.parentPersonId);

    related.delete(facultyPersonId);
    return [...related];
  }

  /** LLD §21: every currently-active guardian of every student currently
   * allocated to a hostel this person currently wardens. */
  async getWardenRelationships(wardenPersonId: string): Promise<string[]> {
    const hostelIds = await this.wardenAssignmentRepo.findActiveHostelIdsForPerson(wardenPersonId);
    if (hostelIds.length === 0) return [];

    const studentIds = await this.hostelRelationshipRepo.findCurrentStudentIdsForHostels(hostelIds);
    if (studentIds.length === 0) return [];

    const related = new Set<string>();
    // One query per student -- acceptable at a single hostel's real roster
    // size (dozens, not thousands); a bulk version is a documented future
    // optimization if load ever shows otherwise.
    for (const studentId of studentIds) {
      const guardians = await this.studentGuardianRepo.findActiveGuardians(studentId);
      for (const g of guardians) related.add(g.personId);
    }

    related.delete(wardenPersonId);
    return [...related];
  }
}
