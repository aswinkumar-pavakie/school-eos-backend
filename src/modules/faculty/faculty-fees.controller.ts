import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyFeesQueryDto } from './dto/faculty-fees-query.dto';
import { FacultyFeesService } from './faculty-fees.service';

@Roles('FACULTY', 'CLASS_ADVISOR')
@Controller('faculty/fees')
export class FacultyFeesController {
  constructor(private readonly service: FacultyFeesService) {}

  @Get()
  async getSectionFees(
    @Query() query: FacultyFeesQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getSectionFees(actor.personId, query.sectionId),
    };
  }
}
