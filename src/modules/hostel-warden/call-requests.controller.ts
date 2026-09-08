import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CallRequestsService } from './call-requests.service';
import { ApproveCallRequestDto } from './dto/approve-call-request.dto';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/call-requests')
export class CallRequestsController {
  constructor(private readonly service: CallRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.get(id, actor.personId) };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCallRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.approve(id, dto, actor.personId) };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.reject(id, actor.personId) };
  }
}
