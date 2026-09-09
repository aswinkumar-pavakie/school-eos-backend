// Identity, Roles & Assignments — the person side: list/create/activate/deactivate,
// general password reset, force sign-out.

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreatePersonDto } from './dto/create-person.dto';
import { GeneralPasswordResetDto } from './dto/general-password-reset.dto';
import { PersonQueryDto } from './dto/person-query.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { photoMulterOptions } from './photo-storage.util';
import { PersonsService } from './persons.service';

@Roles('ADMIN')
@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  async list(@Query() query: PersonQueryDto) {
    const result = await this.personsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const result = await this.personsService.get(id);
    return { data: result };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePersonDto, @CurrentActor() actor: AuthenticatedUser) {
    const result = await this.personsService.create(dto, actor.personId);
    return { data: result };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.personsService.update(id, dto, actor.personId) };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.personsService.activate(id, actor.personId);
    return { data: { activated: true } };
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.personsService.deactivate(id, actor.personId);
    return { data: { deactivated: true } };
  }

  @Post(':id/password-reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: GeneralPasswordResetDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const result = await this.personsService.resetPassword(id, dto, actor.personId);
    return { data: result };
  }

  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', photoMulterOptions))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('A photo file is required (field name "photo").');
    return { data: await this.personsService.uploadPhoto(id, file, actor.personId) };
  }

  @Delete(':id/photo')
  @HttpCode(HttpStatus.OK)
  async removePhoto(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.personsService.removePhoto(id, actor.personId);
    return { data: { removed: true } };
  }

  @Post(':id/force-sign-out')
  @HttpCode(HttpStatus.OK)
  async forceSignOut(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.personsService.forceSignOut(id, actor.personId);
    return { data: { signedOut: true } };
  }
}
