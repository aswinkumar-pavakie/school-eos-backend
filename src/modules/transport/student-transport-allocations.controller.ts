import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CancelStudentTransportAllocationDto } from './dto/cancel-student-transport-allocation.dto';
import { CreateStudentTransportAllocationDto } from './dto/create-student-transport-allocation.dto';
import { StudentTransportAllocationQueryDto } from './dto/student-transport-allocation-query.dto';
import { UpdateStudentTransportAllocationDto } from './dto/update-student-transport-allocation.dto';
import { StudentTransportAllocationsService } from './student-transport-allocations.service';

@Roles('ADMIN')
@Controller('student-transport-allocations')
export class StudentTransportAllocationsController {
  constructor(private readonly allocationsService: StudentTransportAllocationsService) {}

  @Get()
  async list(@Query() query: StudentTransportAllocationQueryDto) {
    return { data: await this.allocationsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.allocationsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStudentTransportAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.allocationsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentTransportAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.allocationsService.update(id, dto, actor.personId) };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelStudentTransportAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.allocationsService.cancel(id, dto, actor.personId) };
  }
}
