import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateOutingRequestDto } from './dto/create-outing-request.dto';
import { ParentHostelRequestsService } from './parent-hostel-requests.service';

@Roles('PARENT')
@Controller('parent/hostel/gate-pass-requests')
export class ParentGatePassController {
  constructor(private readonly service: ParentHostelRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMine(actor.personId, 'GATE_PASS') };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateOutingRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, 'GATE_PASS', dto) };
  }
}

@Roles('PARENT')
@Controller('parent/hostel/emergency-exit-requests')
export class ParentEmergencyExitController {
  constructor(private readonly service: ParentHostelRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMine(actor.personId, 'EMERGENCY_EXIT') };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateOutingRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor.personId, 'EMERGENCY_EXIT', dto) };
  }
}
