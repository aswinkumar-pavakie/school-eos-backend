import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateStudentDutyDto } from './dto/create-student-duty.dto';
import { UpdateStudentDutyDto } from './dto/update-student-duty.dto';
import { FacultyClassTeacherService } from './faculty-class-teacher.service';

@Roles('FACULTY')
@Controller('faculty/class-teacher')
export class FacultyClassTeacherController {
  constructor(private readonly service: FacultyClassTeacherService) {}

  @Get('sections/:sectionId/dashboard')
  async dashboard(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getDashboard(actor.personId, sectionId) };
  }

  @Get('sections/:sectionId/students/search')
  async searchStudents(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query('q') q: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.searchStudents(
        actor.personId,
        sectionId,
        q ?? '',
      ),
    };
  }

  @Get('sections/:sectionId/duties')
  async listDuties(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.listDuties(actor.personId, sectionId) };
  }

  @Post('sections/:sectionId/duties')
  @HttpCode(HttpStatus.CREATED)
  async createDuty(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: CreateStudentDutyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.createDuty(actor.personId, sectionId, dto),
    };
  }

  @Patch('duties/:id')
  async updateDuty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDutyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateDuty(actor.personId, id, dto) };
  }

  @Delete('duties/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDuty(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.removeDuty(actor.personId, id);
  }
}
