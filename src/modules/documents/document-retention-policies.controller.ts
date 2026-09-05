import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateDocumentRetentionPolicyDto } from './dto/create-document-retention-policy.dto';
import { UpdateDocumentRetentionPolicyDto } from './dto/update-document-retention-policy.dto';
import { DocumentRetentionPoliciesService } from './document-retention-policies.service';

@Roles('ADMIN')
@Controller('document-retention-policies')
export class DocumentRetentionPoliciesController {
  constructor(private readonly retentionPoliciesService: DocumentRetentionPoliciesService) {}

  @Get()
  async list() {
    return { data: await this.retentionPoliciesService.list() };
  }

  @Get(':category')
  async get(@Param('category') category: string) {
    return { data: await this.retentionPoliciesService.get(category) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateDocumentRetentionPolicyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.retentionPoliciesService.create(dto, actor.personId) };
  }

  @Patch(':category')
  async update(
    @Param('category') category: string,
    @Body() dto: UpdateDocumentRetentionPolicyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.retentionPoliciesService.update(category, dto, actor.personId) };
  }
}
