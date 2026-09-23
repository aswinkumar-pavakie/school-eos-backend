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
import { ClassTeacherLoginService } from './class-teacher-login.service';
import { CreateClassTeacherLoginDto } from './dto/create-class-teacher-login.dto';
import { ReassignClassTeacherDto } from './dto/reassign-class-teacher.dto';

@Roles('ADMIN')
@Controller('class-teacher-logins')
export class ClassTeacherLoginController {
  constructor(private readonly service: ClassTeacherLoginService) {}

  @Get('lookup')
  async lookup(
    @Query('gradeId') gradeId: string,
    @Query('sectionName') sectionName: string,
  ) {
    return { data: await this.service.findByGradeSection(gradeId, sectionName) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateClassTeacherLoginDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Post(':loginPersonId/reassign')
  async reassign(
    @Param('loginPersonId') loginPersonId: string,
    @Body() dto: ReassignClassTeacherDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.reassign(loginPersonId, dto, actor.personId) };
  }

  @Get(':loginPersonId/history')
  async history(@Param('loginPersonId') loginPersonId: string) {
    return { data: await this.service.getHistory(loginPersonId) };
  }
}
