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
import { CreateMeetingBookingDto } from './dto/create-meeting-booking.dto';
import { CreateMeetingSlotDto } from './dto/create-meeting-slot.dto';
import { DecideMeetingBookingDto } from './dto/decide-meeting-booking.dto';
import { UpdateMeetingSlotDto } from './dto/update-meeting-slot.dto';
import { FacultyParentMeetingsService } from './faculty-parent-meetings.service';

@Roles('FACULTY')
@Controller('faculty/parent-meetings')
export class FacultyParentMeetingsController {
  constructor(private readonly service: FacultyParentMeetingsService) {}

  @Get('slots')
  async listSlots(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listSlots(actor.personId) };
  }

  @Post('slots')
  @HttpCode(HttpStatus.CREATED)
  async createSlot(
    @Body() dto: CreateMeetingSlotDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createSlot(actor.personId, dto) };
  }

  @Patch('slots/:id')
  async updateSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingSlotDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.updateSlot(actor.personId, id, dto) };
  }

  @Delete('slots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.deleteSlot(actor.personId, id);
  }

  @Post('bookings/:id/decide')
  async decideBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideMeetingBookingDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.decideBooking(actor.personId, id, dto.decision),
    };
  }
}

@Roles('PARENT')
@Controller('parent/meeting-bookings')
export class ParentMeetingBookingController {
  constructor(private readonly service: FacultyParentMeetingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMeetingBookingDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.createBooking(actor.personId, dto) };
  }
}

// A separate controller class (rather than widening the one above) so the
// already-shipped POST /parent/meeting-bookings path is never touched --
// this is purely additive, new surface only.
@Roles('PARENT')
@Controller('parent/meeting-slots')
export class ParentMeetingSlotsController {
  constructor(private readonly service: FacultyParentMeetingsService) {}

  @Get()
  async list(
    @Query('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.listOpenSlotsForStudent(
        actor.personId,
        studentId,
      ),
    };
  }
}
