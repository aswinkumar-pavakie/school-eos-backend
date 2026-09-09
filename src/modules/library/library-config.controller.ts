import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { UpdateConfigDto } from './dto/update-config.dto';
import { LibraryConfigService } from './library-config.service';

@Controller('library/config')
@Roles('LIBRARY', 'ADMIN')
export class LibraryConfigController {
  constructor(private readonly configService: LibraryConfigService) {}

  @Get()
  async get() {
    return { data: await this.configService.get() };
  }

  @Patch()
  @Roles('LIBRARY')
  async update(
    @Body() dto: UpdateConfigDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.configService.update(dto, actor.personId) };
  }
}
