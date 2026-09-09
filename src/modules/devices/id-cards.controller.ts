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
import { BlockIdCardDto } from './dto/block-id-card.dto';
import { CreateIdCardDto } from './dto/create-id-card.dto';
import { IdCardQueryDto } from './dto/id-card-query.dto';
import { ReissueIdCardDto } from './dto/reissue-id-card.dto';
import { IdCardsService } from './id-cards.service';

@Roles('ADMIN')
@Controller('id-cards')
export class IdCardsController {
  constructor(private readonly idCardsService: IdCardsService) {}

  @Get()
  async list(@Query() query: IdCardQueryDto) {
    return { data: await this.idCardsService.list(query) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.idCardsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateIdCardDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.idCardsService.create(dto, actor) };
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @Param('id') id: string,
    @Body() dto: BlockIdCardDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.idCardsService.block(id, dto, actor) };
  }

  @Post(':id/reissue')
  @HttpCode(HttpStatus.CREATED)
  async reissue(
    @Param('id') id: string,
    @Body() dto: ReissueIdCardDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.idCardsService.reissue(id, dto, actor) };
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  async unblock(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.idCardsService.unblock(id, actor.personId) };
  }
}
