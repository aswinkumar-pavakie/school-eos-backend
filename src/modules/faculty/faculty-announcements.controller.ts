// Faculty's own Announcements screen -- full CRUD (not just create), scoped
// to the classes they actually advise or teach (never SCHOOL/ROLE, which stay
// ADMIN-only). Reuses the same AnnouncementsService/AnnouncementRepository the
// Admin panel uses -- this controller's whole job is translating "my scoped
// classes" into the generic SECTION-audience shape and enforcing ownership on
// edit/delete, exactly the way every other Faculty feature in this module
// derives scope from the caller rather than trusting client-supplied ids.

import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AnnouncementsService } from '../announcements/announcements.service';
import { FacultyCreateAnnouncementDto } from './dto/faculty-create-announcement.dto';
import { FacultyUpdateAnnouncementDto } from './dto/faculty-update-announcement.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

@Roles('FACULTY')
@Controller('faculty/announcements')
export class FacultyAnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly scopeRepo: FacultyScopeRepository,
  ) {}

  private async assertOwnSections(personId: string, sectionIds: string[]) {
    const scoped = new Set(await this.scopeRepo.getAllScopedSectionIds(personId));
    const notMine = sectionIds.filter((id) => !scoped.has(id));
    if (notMine.length > 0) {
      throw new ForbiddenException('You can only target classes you advise or teach.');
    }
  }

  /** Everything relevant to this Faculty member: SCHOOL-wide, ROLE=FACULTY,
   * and SECTION posts aimed at their own scoped classes -- each row flagged
   * with whether this caller can edit/delete it (their own posts only). */
  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    const sectionIds = await this.scopeRepo.getAllScopedSectionIds(actor.personId);
    const rows = await this.announcementsService.listForFaculty(sectionIds);
    return { data: rows.map((r) => ({ ...r, canEdit: r.createdBy === actor.personId })) };
  }

  /** Just this caller's own posts (for a "manage my announcements" view) --
   * independent of whether their scope has since changed. */
  @Get('mine')
  async listMine(@CurrentActor() actor: AuthenticatedUser) {
    const rows = await this.announcementsService.listCreatedBy(actor.personId);
    return { data: rows.map((r) => ({ ...r, canEdit: true })) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: FacultyCreateAnnouncementDto, @CurrentActor() actor: AuthenticatedUser) {
    await this.assertOwnSections(actor.personId, dto.targetSectionIds);
    const created = await this.announcementsService.create(
      { ...dto, audienceType: 'SECTION' },
      actor.personId,
    );
    return { data: created };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: FacultyUpdateAnnouncementDto, @CurrentActor() actor: AuthenticatedUser) {
    if (dto.targetSectionIds) {
      await this.assertOwnSections(actor.personId, dto.targetSectionIds);
    }
    const updated = await this.announcementsService.update(
      id,
      { ...dto, audienceType: dto.targetSectionIds ? 'SECTION' : undefined },
      actor.personId,
      actor.personId,
    );
    return { data: updated };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.announcementsService.remove(id, actor.personId, actor.personId);
  }
}
