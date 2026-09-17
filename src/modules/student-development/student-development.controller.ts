import { Body, ConflictException, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { StudentDevelopmentService } from './student-development.service';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { CreateMeritPointDto } from './dto/create-merit-point.dto';
import { CreateDisciplineIncidentDto } from './dto/create-discipline-incident.dto';
import { ListByStudentQueryDto } from './dto/list-by-student.query.dto';
import { ListDisciplineIncidentsQueryDto } from './dto/list-discipline-incidents.query.dto';
import { isForeignKeyViolation } from './pg-error.util';

// Student Development -- achievement/merit_point/observation/
// discipline_incident, all real, already-populated tables (see
// student-development.repository.ts's own comment). Reads: broadened to
// PRINCIPAL/VICE_PRINCIPAL, same oversight convention as every other module
// this session. Writes: Admin-only -- recording an achievement, awarding
// merit points, or logging a discipline incident is an administrative action
// in this app the same way creating an exam or a calendar event is (no
// dedicated role like HEALTH_INCHARGE owns this data, and Faculty/Class
// Advisor has no web login to do it themselves -- mobile only, a separate
// future build). Observations stay read-only end to end: recording one is a
// class advisor's own note-taking action, not something Admin should be
// creating on a teacher's behalf.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL')
@Controller('student-development')
export class StudentDevelopmentController {
  constructor(private readonly service: StudentDevelopmentService) {}

  @Get('achievements')
  async listAchievements(@Query() query: ListByStudentQueryDto) {
    return { data: await this.service.listAchievements(query.studentId) };
  }

  @Post('achievements')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createAchievement(@Body() dto: CreateAchievementDto, @CurrentActor() actor: AuthenticatedUser) {
    try {
      return { data: await this.service.createAchievement(dto, actor.personId) };
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('studentId does not exist.');
      throw err;
    }
  }

  @Get('merit-points')
  async listMeritPoints(@Query() query: ListByStudentQueryDto) {
    return { data: await this.service.listMeritPoints(query.studentId) };
  }

  @Post('merit-points')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createMeritPoint(@Body() dto: CreateMeritPointDto, @CurrentActor() actor: AuthenticatedUser) {
    try {
      return { data: await this.service.createMeritPoint(dto, actor.personId) };
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('studentId or houseId does not exist.');
      throw err;
    }
  }

  @Get('observations')
  async listObservations(@Query() query: ListByStudentQueryDto) {
    return { data: await this.service.listObservations(query.studentId) };
  }

  @Get('discipline-incidents')
  async listDisciplineIncidents(@Query() query: ListDisciplineIncidentsQueryDto) {
    return { data: await this.service.listDisciplineIncidents(query) };
  }

  @Post('discipline-incidents')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createDisciplineIncident(@Body() dto: CreateDisciplineIncidentDto, @CurrentActor() actor: AuthenticatedUser) {
    try {
      return { data: await this.service.createDisciplineIncident(dto, actor.personId) };
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('studentId does not exist.');
      throw err;
    }
  }
}
