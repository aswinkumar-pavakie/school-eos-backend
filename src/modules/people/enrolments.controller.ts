import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { TransferEnrolmentDto } from './dto/transfer-enrolment.dto';
import { UpdateEnrolmentDto } from './dto/update-enrolment.dto';
import { EnrolmentsService } from './enrolments.service';

@Roles('ADMIN')
@Controller('enrolments')
export class EnrolmentsController {
  constructor(private readonly enrolmentsService: EnrolmentsService) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEnrolmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.enrolmentsService.update(id, dto, actor.personId) };
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferEnrolmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.enrolmentsService.transferSection(id, dto, actor.personId) };
  }
}
