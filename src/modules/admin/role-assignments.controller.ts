import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { GrantRoleAssignmentDto } from './dto/grant-role-assignment.dto';
import { RoleAssignmentQueryDto } from './dto/role-assignment-query.dto';
import { RoleAssignmentsService } from './role-assignments.service';

@Roles('ADMIN')
@Controller('role-assignments')
export class RoleAssignmentsController {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  @Get()
  async list(@Query() query: RoleAssignmentQueryDto) {
    return { data: await this.roleAssignmentsService.list(query) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async grant(
    @Body() dto: GrantRoleAssignmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const result = await this.roleAssignmentsService.grant(dto, actor.personId);
    return { data: result };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const result = await this.roleAssignmentsService.revoke(id, actor.personId);
    return { data: result };
  }
}
