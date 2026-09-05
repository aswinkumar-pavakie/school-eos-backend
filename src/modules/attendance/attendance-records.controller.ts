import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AttendanceRecordsService } from './attendance-records.service';
import { CorrectAttendanceRecordDto } from './dto/correct-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';

@Roles('ADMIN')
@Controller('attendance-records')
export class AttendanceRecordsController {
  constructor(private readonly recordsService: AttendanceRecordsService) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceRecordDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.recordsService.update(id, dto, actor.personId) };
  }

  @Post(':id/correct')
  async correct(
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceRecordDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.recordsService.correct(id, dto, actor.personId) };
  }

  @Get(':id/corrections')
  async listCorrections(@Param('id') id: string) {
    return { data: await this.recordsService.listCorrections(id) };
  }
}
