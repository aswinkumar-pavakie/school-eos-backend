// Small master-data surface Finance needs for the rest of the module to be usable at
// all: fee_head IDs for fee-structure lines, expense_category IDs (with their petty-cash
// limit) for expenses, grade IDs for the Student Workspace's own filters. Not part of
// the numbered 2.1-2.9 feature list, but a genuine prerequisite for every one of them
// to work end-to-end. grade itself is owned by Academics (no such module exists yet) —
// read-only here, no write endpoint.

import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateFeeHeadDto } from './dto/create-fee-head.dto';
import { UpdateFeeHeadDto } from './dto/update-fee-head.dto';
import { AcademicYearLookupRepository } from './repositories/academic-year-lookup.repository';
import { DepartmentLookupRepository } from './repositories/department-lookup.repository';
import { ExpenseCategoryRepository } from './repositories/expense-category.repository';
import { FeeHeadRepository } from './repositories/fee-head.repository';
import { GradeLookupRepository } from './repositories/grade-lookup.repository';
import { MediumLookupRepository } from './repositories/medium-lookup.repository';
import { SchoolProfileRepository } from './repositories/school-profile.repository';

@Controller('finance/fee-heads')
@Roles('FINANCE', 'ADMIN')
export class FeeHeadsController {
  constructor(private readonly repo: FeeHeadRepository) {}

  @Get()
  async list() {
    return { data: await this.repo.list() };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.repo.findById(id);
    if (!data) throw new NotFoundException('Fee head not found');
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFeeHeadDto) {
    return { data: await this.repo.create(dto) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFeeHeadDto) {
    return { data: await this.repo.update(id, dto) };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string) {
    await this.repo.setStatus(id, 'ACTIVE');
    return { data: await this.repo.findById(id) };
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string) {
    await this.repo.setStatus(id, 'INACTIVE');
    return { data: await this.repo.findById(id) };
  }
}

@Controller('finance/expense-categories')
@Roles('FINANCE', 'ADMIN')
export class ExpenseCategoriesController {
  constructor(private readonly repo: ExpenseCategoryRepository) {}

  @Get()
  async list() {
    return { data: await this.repo.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExpenseCategoryDto) {
    return { data: await this.repo.create(dto) };
  }
}

@Controller('finance/grades')
@Roles('FINANCE', 'ADMIN')
export class GradesController {
  constructor(private readonly repo: GradeLookupRepository) {}

  @Get()
  async list() {
    return { data: await this.repo.list() };
  }
}

// Also readable by PRINCIPAL — needed to populate the department picker on the
// Purchase/Service Request creation form.
@Controller('finance/departments')
@Roles('FINANCE', 'ADMIN', 'PRINCIPAL')
export class DepartmentsController {
  constructor(private readonly repo: DepartmentLookupRepository) {}

  @Get()
  async list() {
    return { data: await this.repo.list() };
  }
}

@Controller('finance/academic-years')
@Roles('FINANCE', 'ADMIN')
export class AcademicYearsController {
  constructor(private readonly repo: AcademicYearLookupRepository) {}

  @Get()
  async list() {
    return { data: await this.repo.list() };
  }
}

@Controller('finance/mediums')
@Roles('FINANCE', 'ADMIN')
export class MediumsController {
  constructor(private readonly repo: MediumLookupRepository) {}

  @Get()
  async list() {
    return { data: await this.repo.list() };
  }
}

// The school's own institutional profile — used only to put a real name/address on a
// printed receipt.
@Controller('finance/school-profile')
@Roles('FINANCE', 'ADMIN')
export class SchoolProfileController {
  constructor(private readonly repo: SchoolProfileRepository) {}

  @Get()
  async get() {
    return { data: await this.repo.get() };
  }
}
