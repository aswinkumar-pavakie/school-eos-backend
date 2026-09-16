import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentQueryDto } from './dto/parent-query.dto';
import { ParentsService } from './parents.service';

// Broadened to include PRINCIPAL for read-only oversight (Principal's own
// /principal/parents module), and to VICE_PRINCIPAL (Phase 5 mobile Parents
// module -- same read-only oversight need) -- no method-level override
// needed here, unlike students/concessions/etc., because this controller has
// no write endpoints at all (parent creation/contact-edit/activation/reset,
// and every guardian-link mutation -- set-primary, revoke, relationship edit
// -- all live on separate controllers this change doesn't touch, still
// ADMIN-only).
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get()
  async list(@Query() query: ParentQueryDto) {
    const result = await this.parentsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  // Security correction: parentsService.get() returns admin-only fields
  // (adminVisiblePassword -- the actual visible parent login password;
  // resetAllowanceUsed -- account-security state; the full home address) that
  // were being sent to every role this controller allows, including
  // PRINCIPAL/VICE_PRINCIPAL, with only the frontend choosing not to render
  // them -- the raw API response still carried them either way. This strips
  // those fields server-side for anyone who isn't ADMIN, so the wire response
  // itself never carries them to a role that shouldn't see them, not just the
  // UI. annualIncomePaise on each linked child is trimmed for VICE_PRINCIPAL
  // specifically (kept for PRINCIPAL) -- financial detail, same
  // Principal-sees-it/Vice-Principal-doesn't split already established for
  // students' own financial sections elsewhere in this app.
  @Get(':id')
  async get(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const parent = await this.parentsService.get(id);
    if (actor.roles.includes('ADMIN')) {
      return { data: parent };
    }

    // Allow-list, not a deny-list -- a new admin-only field added to
    // ParentsService.get() later stays excluded here by default instead of
    // silently leaking to PRINCIPAL/VICE_PRINCIPAL until someone remembers
    // to also deny-list it.
    const isPrincipal = actor.roles.includes('PRINCIPAL');
    const children = parent.children.map((child) => ({
      id: child.id,
      studentId: child.studentId,
      studentFirstName: child.studentFirstName,
      studentLastName: child.studentLastName,
      studentAdmissionNo: child.studentAdmissionNo,
      studentPhotoUrl: child.studentPhotoUrl,
      gradeName: child.gradeName,
      sectionName: child.sectionName,
      relationship: child.relationship,
      isPrimaryContact: child.isPrimaryContact,
      accessLevel: child.accessLevel,
      isAuthorisedPickup: child.isAuthorisedPickup,
      occupation: child.occupation,
      annualIncomePaise: isPrincipal ? child.annualIncomePaise : null,
      status: child.status,
    }));

    return {
      data: {
        id: parent.id,
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email,
        mobile: parent.mobile,
        dateOfBirth: parent.dateOfBirth,
        gender: parent.gender,
        status: parent.status,
        photoUrl: parent.photoUrl,
        children,
        loginIdentifiers: parent.loginIdentifiers,
      },
    };
  }
}
