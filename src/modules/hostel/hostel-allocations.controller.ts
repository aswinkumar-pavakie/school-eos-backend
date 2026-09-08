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
import { CreateHostelAllocationDto } from './dto/create-hostel-allocation.dto';
import { HostelAllocationQueryDto } from './dto/hostel-allocation-query.dto';
import { VacateHostelAllocationDto } from './dto/vacate-hostel-allocation.dto';
import { HostelAllocationsService } from './hostel-allocations.service';

@Roles('ADMIN')
@Controller('hostel-allocations')
export class HostelAllocationsController {
  constructor(
    private readonly hostelAllocationsService: HostelAllocationsService,
  ) {}

  @Get()
  async list(@Query() query: HostelAllocationQueryDto) {
    return { data: await this.hostelAllocationsService.list(query) };
  }

  // Must stay registered before ':id' -- otherwise "unallocated-students" would
  // be swallowed by the :id param route.
  @Get('unallocated-students')
  async listUnallocatedStudents(
    @Query('academicYearId') academicYearId: string,
  ) {
    return {
      data: await this.hostelAllocationsService.listUnallocatedStudents(
        academicYearId,
      ),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.hostelAllocationsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateHostelAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.hostelAllocationsService.create(dto, actor.personId),
    };
  }

  @Post(':id/vacate')
  @HttpCode(HttpStatus.OK)
  async vacate(
    @Param('id') id: string,
    @Body() dto: VacateHostelAllocationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.hostelAllocationsService.vacate(id, dto, actor.personId),
    };
  }
}
