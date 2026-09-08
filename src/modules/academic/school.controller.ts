import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { SchoolService } from './school.service';

@Roles('ADMIN')
@Controller('school')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  @Get()
  async get() {
    return { data: await this.schoolService.get() };
  }

  @Patch()
  async update(
    @Body() dto: UpdateSchoolDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.schoolService.update(dto, actor.personId) };
  }
}
