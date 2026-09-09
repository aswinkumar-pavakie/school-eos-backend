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
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationQueryDto } from './dto/reservation-query.dto';
import { ReservationsService } from './reservations.service';

@Controller('library/reservations')
@Roles('LIBRARY', 'ADMIN')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  async list(@Query() query: ReservationQueryDto) {
    return { data: await this.reservationsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.reservationsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('LIBRARY')
  async create(
    @Body() dto: CreateReservationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.reservationsService.create(dto, actor.personId) };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async cancel(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.reservationsService.cancel(id, actor.personId) };
  }
}
