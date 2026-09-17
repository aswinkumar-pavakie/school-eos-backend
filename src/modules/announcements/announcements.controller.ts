import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

// School-wide, role-targeted announcements -- distinct from community_announcement
// (scoped to a single community). Principal added (Phase 18): the approved API
// doc names "Admin/leadership/authorized role" for POST /announcements
// specifically -- Principal creates announcements with the same parity as
// Admin, no method-level override needed on create. archive is NOT extended:
// the doc's "leadership" callout is specific to the create line only: every
// other action (schedule/publish/cancel/expire in the doc; archive is the one
// actually implemented) is just "Authorized role" generically, so archive
// stays Admin-only until that's explicitly documented for leadership too.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  // Method-level override, read-only: Vice Principal's own dashboard (Phase 3)
  // needs to read school-wide announcements. Deliberately NOT a class-level
  // change -- create (@Post() below) has no override of its own and inherits
  // the class-level ADMIN+PRINCIPAL default, and Vice Principal is not meant
  // to gain that create authority just by being able to read the list.
  // TRANSPORT_MANAGER added for the same reason -- the Transport Overview
  // dashboard's own real "Notices" card (SIS Transport mockup) reads
  // SCHOOL-wide + ROLE=TRANSPORT_MANAGER announcements via ?roleCode= --
  // still read-only, no create/edit/delete authority granted.
  @Get()
  @Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL', 'TRANSPORT_MANAGER')
  async list(@Query() query: AnnouncementQueryDto) {
    return { data: await this.announcementsService.list(query) };
  }

  // TRANSPORT_MANAGER added here deliberately (explicit product decision,
  // matching the SIS Transport mockup's own "Post a notice" dashboard
  // control) -- real create access, but every notice this role posts uses
  // audienceType 'ROLE'/targetRoles ['TRANSPORT_MANAGER'] client-side (see
  // PostNoticeForm.tsx), so it only ever reaches the same real
  // SCHOOL+ROLE=TRANSPORT_MANAGER feed the Transport dashboard's own Notices
  // card already reads -- never a school-wide post from this role.
  @Post()
  @Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.create(dto, actor.personId),
    };
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.archive(id, actor.personId),
    };
  }

  // Explicit ADMIN-only override added during the hot-fix-sri merge: these
  // two methods originated on hot-fix-sri with no override of their own,
  // which was correct there (class-level was still plain @Roles('ADMIN')
  // on that branch). This branch's class-level is now broadened to
  // ('ADMIN', 'PRINCIPAL') for read-only oversight (see the class comment),
  // and RolesGuard's Reflector.getAllAndOverride means a method with no
  // override inherits that broadened default -- without this override,
  // PRINCIPAL would silently gain edit/delete authority sri never intended.
  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.update(id, dto, actor.personId),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.announcementsService.remove(id, actor.personId);
  }
}
