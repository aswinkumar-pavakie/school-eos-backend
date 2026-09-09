// "Role permission preview" — exactly which modules an account with this role_code
// will get. Static mapping (ROLE_MODULE_ACCESS), not a configurable permission builder
// — see role.repository.ts's own comment for why.

import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import {
  ROLE_MODULE_ACCESS,
  RoleRepository,
} from './repositories/role.repository';

@Roles('ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly roleRepo: RoleRepository) {}

  @Get()
  async list() {
    const roles = await this.roleRepo.findAll();
    return {
      data: roles.map((role) => ({
        ...role,
        moduleAccess: ROLE_MODULE_ACCESS[role.code] ?? [],
      })),
    };
  }
}
