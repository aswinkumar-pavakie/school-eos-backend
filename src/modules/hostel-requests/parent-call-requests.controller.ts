import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateCallRequestDto } from './dto/create-call-request.dto';
import { ParentCallRequestsService } from './parent-call-requests.service';

@Roles('PARENT')
@Controller('parent/hostel/call-requests')
export class ParentCallRequestsController {
  constructor(private readonly service: ParentCallRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMine(actor.personId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCallRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, dto) };
  }
}
