import {
  Body,
  Controller,
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
import { CancelStudentTransportAllocationDto } from './dto/cancel-student-transport-allocation.dto';
import { CreateStudentTransportAllocationDto } from './dto/create-student-transport-allocation.dto';
import { StudentTransportAllocationQueryDto } from './dto/student-transport-allocation-query.dto';
import { UpdateStudentTransportAllocationDto } from './dto/update-student-transport-allocation.dto';
import { RequestStudentTransportAllocationCancelDto } from './dto/request-student-transport-allocation-cancel.dto';
import { StudentTransportAllocationsService } from './student-transport-allocations.service';

@Roles('ADMIN')
@Controller('student-transport-allocations')
export class StudentTransportAllocationsController {
  constructor(
    private readonly allocationsService: StudentTransportAllocationsService,
  ) {}

  // Method-level @Roles OVERRIDES the class-level one (RolesGuard uses
  // getAllAndOverride, not a merge) -- TRANSPORT_MANAGER gets real
  // create/update access here now (explicit product decision) alongside the
  // existing read access; cancel stays ADMIN-only -- Transport Manager's own
  // path for removing a student is the request-cancel endpoint below,
  // routed through the generic approvals engine to a real ADMIN decision.
  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get()
  async list(@Query() query: StudentTransportAllocationQueryDto) {
    return { data: await this.allocationsService.list(query) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.allocationsService.get(id) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStudentTransportAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.allocationsService.create(dto, actor.personId) };
  }

  @Roles('ADMIN', 'TRANSPORT_MANAGER')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentTransportAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.allocationsService.update(id, dto, actor.personId),
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelStudentTransportAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.allocationsService.cancel(id, dto, actor.personId),
    };
  }

  // No direct cancel access for Transport Manager (see class comment) -- this
  // is their own request, routed through the generic approvals engine.
  @Post(':id/request-cancel')
  @Roles('TRANSPORT_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async requestCancel(
    @Param('id') id: string,
    @Body() dto: RequestStudentTransportAllocationCancelDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.allocationsService.requestCancel(id, dto, actor.personId),
    };
  }
}
