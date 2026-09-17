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
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityPositionsService } from './community-positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

// "Positions & office bearers" -- new (see database/migrations for
// community_position, added alongside removing the standalone Community
// login). Same real scope as the rest of the Communities module: ADMIN
// manages, PRINCIPAL/CORRESPONDENT/VICE_PRINCIPAL get read-only oversight.
// No COMMUNITY role here at all -- that login is being retired, Admin now
// owns this feature completely.
@Roles('ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL')
@Controller()
export class CommunityPositionsController {
  constructor(
    private readonly positionsService: CommunityPositionsService,
  ) {}

  @Get('communities/:id/positions')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.positionsService.listByCommunity(id) };
  }

  @Post('communities/:id/positions')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @Body() dto: CreatePositionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.positionsService.create(id, dto, actor.personId),
    };
  }

  @Patch('community-positions/:positionId')
  @Roles('ADMIN')
  async update(
    @Param('positionId') positionId: string,
    @Body() dto: UpdatePositionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.positionsService.update(
        positionId,
        dto,
        actor.personId,
      ),
    };
  }

  @Delete('community-positions/:positionId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('positionId') positionId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.positionsService.remove(positionId, actor.personId);
  }
}
