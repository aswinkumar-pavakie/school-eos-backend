import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ParentPermissionsService } from './parent-permissions.service';
import { SignPermissionRequestDto } from './dto/sign-permission-request.dto';

// Parent's own "Permissions" feature: view a request for their own child (real
// ACTIVE guardian_link required -- see ParentPermissionsService), reject it, or
// sign as guardian (uploads the actual digital signature).
@Controller('parent/permission-requests')
@Roles('PARENT')
export class ParentPermissionsController {
  constructor(private readonly service: ParentPermissionsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.get(id, actor.personId) };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.reject(id, actor.personId);
    return { data: { state: 'REJECTED' } };
  }

  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  async sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignPermissionRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.sign(id, dto.signaturePngBase64, actor.personId);
    return { data: { state: 'APPROVED' } };
  }

  @Get(':id/permission-letter')
  async getPermissionLetter(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getPermissionLetter(id, actor.personId) };
  }
}
