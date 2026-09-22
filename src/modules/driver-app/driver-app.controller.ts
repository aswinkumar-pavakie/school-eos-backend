import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { DriverAppService } from './driver-app.service';
import { MarkBoardingDto } from './dto/mark-boarding.dto';
import { TripDirectionQueryDto } from './dto/trip-direction-query.dto';
import { UndoMarkDto } from './dto/undo-mark.dto';

// Driver's own operational surface -- manual attendance fallback for when
// NFC is unavailable, plus the genuine day-to-day info a driver needs (their
// own bus/route/attendant, their own licence/verification compliance, and
// explicit trip start/complete control). Every route derives the driver's
// own identity/scope server-side from the authenticated actor's personId;
// nothing is ever accepted as a driver/route/vehicle/trip id from the
// client. DRIVER-only: this is that role's own surface, not an oversight
// view for any other role.
@Roles('DRIVER')
@Controller('driver')
export class DriverAppController {
  constructor(private readonly driverAppService: DriverAppService) {}

  @Get('dashboard')
  async getDashboard(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.driverAppService.getDashboard(actor.personId) };
  }

  @Get('my-profile')
  async getMyProfile(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.driverAppService.getMyProfile(actor.personId) };
  }

  @Get('my-bus')
  async getMyBus(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.driverAppService.getMyBus(actor.personId) };
  }

  @Get('my-students')
  async getMyStudents(
    @Query() query: TripDirectionQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.driverAppService.getMyStudents(
        actor.personId,
        query.direction,
      ),
    };
  }

  @Post('trip/start')
  @HttpCode(HttpStatus.OK)
  async startTrip(
    @Query() query: TripDirectionQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.driverAppService.startTrip(
        actor.personId,
        query.direction,
      ),
    };
  }

  @Post('trip/complete')
  @HttpCode(HttpStatus.OK)
  async completeTrip(
    @Query() query: TripDirectionQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.driverAppService.completeTrip(
        actor.personId,
        query.direction,
      ),
    };
  }

  @Post('boarding')
  @HttpCode(HttpStatus.OK)
  async markStudents(
    @Body() dto: MarkBoardingDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.driverAppService.markStudents(
        actor.personId,
        dto.direction,
        dto.studentIds,
      ),
    };
  }

  @Post('boarding/undo')
  @HttpCode(HttpStatus.OK)
  async undoMark(
    @Body() dto: UndoMarkDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.driverAppService.undoMark(
      actor.personId,
      dto.direction,
      dto.studentId,
    );
    return { data: { undone: true } };
  }
}
