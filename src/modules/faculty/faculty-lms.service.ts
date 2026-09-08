// Current Term (LMS) -- Google-Classroom-style, per (faculty, subject). The
// top-level "subject folder" is derived at read time from the faculty's own
// real subject_offering rows grouped by subject_id (one faculty + one
// subject = one folder, no matter how many classes they teach it to); the
// real lms_folder rows are the "Unit 1"-style sub-folders inside Materials,
// each independently shared with a chosen subset of those same classes.
// Task/Lesson Plan stay scoped to one real class (subject_offering) at a
// time, never shared across classes. Sensitive, class-scoped file content --
// every read/write here re-derives and re-checks ownership from the real
// subject_offering/staff tables, never trusts a client-supplied staffId or
// an unvalidated share list.

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { CreateLmsFolderDto } from './dto/create-lms-folder.dto';
import { CreateLmsLessonPlanDto } from './dto/create-lms-lesson-plan.dto';
import { CreateLmsTaskDto } from './dto/create-lms-task.dto';
import { UpdateLmsFolderDto } from './dto/update-lms-folder.dto';
import { UpdateLmsLessonPlanDto } from './dto/update-lms-lesson-plan.dto';
import { UpdateLmsTaskDto } from './dto/update-lms-task.dto';
import { LMS_MATERIALS_BUCKET, lmsFileObjectKeyFor } from './lms-storage.util';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { LmsFolderRepository } from './repositories/lms-folder.repository';
import { LmsLessonPlanRepository } from './repositories/lms-lesson-plan.repository';
import { LmsTaskRepository } from './repositories/lms-task.repository';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

@Injectable()
export class FacultyLmsService {
  constructor(
    private readonly folderRepo: LmsFolderRepository,
    private readonly taskRepo: LmsTaskRepository,
    private readonly lessonPlanRepo: LmsLessonPlanRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================
  // Virtual top-level subject folders
  // ============================================================

  async listSubjects(personId: string) {
    const offerings = await this.scopeRepo.getTeachingOfferings(personId);
    const bySubject = new Map<string, { subjectId: string; subjectName: string; classes: { subjectOfferingId: string; gradeName: string; sectionName: string }[] }>();
    for (const o of offerings) {
      let entry = bySubject.get(o.subjectId);
      if (!entry) {
        entry = { subjectId: o.subjectId, subjectName: o.subjectName, classes: [] };
        bySubject.set(o.subjectId, entry);
      }
      entry.classes.push({ subjectOfferingId: o.subjectOfferingId, gradeName: o.gradeName, sectionName: o.sectionName });
    }
    return [...bySubject.values()];
  }

  private async assertTeachesSubject(personId: string, subjectId: string): Promise<{ staffId: string; offeringIds: string[] }> {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) throw new ForbiddenException('No active staff record for this account.');
    const offerings = await this.scopeRepo.getTeachingOfferings(personId);
    const matching = offerings.filter((o) => o.subjectId === subjectId);
    if (matching.length === 0) throw new ForbiddenException('You do not teach this subject.');
    return { staffId, offeringIds: matching.map((o) => o.subjectOfferingId) };
  }

  private validateShareIds(shareIds: string[] | undefined, validOfferingIds: string[]): string[] {
    if (!shareIds) return [];
    const invalid = shareIds.filter((id) => !validOfferingIds.includes(id));
    if (invalid.length > 0) throw new BadRequestException('One or more selected classes are not classes you teach this subject to.');
    return shareIds;
  }

  // ============================================================
  // Materials sub-folders
  // ============================================================

  async listFolders(personId: string, subjectId: string) {
    const { staffId } = await this.assertTeachesSubject(personId, subjectId);
    const folders = await this.folderRepo.findForStaffSubject(staffId, subjectId);
    return Promise.all(
      folders.map(async (f) => ({
        ...f,
        shareOfferingIds: await this.folderRepo.findShareOfferingIds(f.id),
        files: await this.folderRepo.findFiles(f.id),
      })),
    );
  }

  private async assertOwnsFolder(personId: string, folderId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    const folder = await this.folderRepo.findById(folderId);
    if (!folder || !staffId || folder.staffId !== staffId) throw new NotFoundException('Folder not found');
    return folder;
  }

  async getFolder(personId: string, folderId: string) {
    const folder = await this.assertOwnsFolder(personId, folderId);
    const [shareOfferingIds, files] = await Promise.all([
      this.folderRepo.findShareOfferingIds(folderId),
      this.folderRepo.findFiles(folderId),
    ]);
    return { ...folder, shareOfferingIds, files };
  }

  async createFolder(personId: string, dto: CreateLmsFolderDto) {
    const { staffId, offeringIds } = await this.assertTeachesSubject(personId, dto.subjectId);
    const shareIds = this.validateShareIds(dto.shareOfferingIds, offeringIds);
    const id = await this.folderRepo.create({ staffId, subjectId: dto.subjectId, title: dto.title, description: dto.description ?? null });
    if (shareIds.length > 0) await this.folderRepo.setShares(id, shareIds);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'LMS_FOLDER_CREATED',
      objectType: 'lms_folder',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: { subjectId: dto.subjectId, title: dto.title, shareIds },
    });
    return this.getFolder(personId, id);
  }

  async updateFolder(personId: string, folderId: string, dto: UpdateLmsFolderDto) {
    const folder = await this.assertOwnsFolder(personId, folderId);
    await this.folderRepo.update(folderId, { title: dto.title, description: dto.description });
    if (dto.shareOfferingIds !== undefined) {
      const offerings = await this.scopeRepo.getTeachingOfferings(personId);
      const validIds = offerings.filter((o) => o.subjectId === folder.subjectId).map((o) => o.subjectOfferingId);
      const shareIds = this.validateShareIds(dto.shareOfferingIds, validIds);
      await this.folderRepo.setShares(folderId, shareIds);
    }
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'LMS_FOLDER_UPDATED',
      objectType: 'lms_folder',
      objectId: folderId,
      outcome: 'SUCCESS',
    });
    return this.getFolder(personId, folderId);
  }

  async deleteFolder(personId: string, folderId: string) {
    const folder = await this.assertOwnsFolder(personId, folderId);
    const files = await this.folderRepo.findFiles(folderId);
    await this.folderRepo.delete(folderId);
    for (const file of files) {
      await this.storage.removeBestEffort(LMS_MATERIALS_BUCKET, file.objectKey);
    }
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'LMS_FOLDER_DELETED',
      objectType: 'lms_folder',
      objectId: folderId,
      outcome: 'SUCCESS',
      beforeData: folder,
    });
  }

  async uploadFile(personId: string, folderId: string, file: Express.Multer.File) {
    await this.assertOwnsFolder(personId, folderId);
    const objectKey = lmsFileObjectKeyFor(folderId, file);
    await this.storage.upload(LMS_MATERIALS_BUCKET, objectKey, file.buffer, file.mimetype);
    const id = await this.folderRepo.createFile({
      folderId,
      fileName: file.originalname,
      objectKey,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: personId,
    });
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'LMS_FILE_UPLOADED',
      objectType: 'lms_file',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: { fileName: file.originalname, folderId },
    });
    return this.folderRepo.findFiles(folderId);
  }

  async getFileSignedUrl(personId: string, fileId: string): Promise<string> {
    const staffId = await this.scopeRepo.getStaffId(personId);
    const file = await this.folderRepo.findFileById(fileId);
    if (!file || !staffId || file.staffId !== staffId) throw new NotFoundException('File not found');
    return this.storage.createSignedUrl(LMS_MATERIALS_BUCKET, file.objectKey, SIGNED_URL_TTL_SECONDS);
  }

  async deleteFile(personId: string, fileId: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    const file = await this.folderRepo.findFileById(fileId);
    if (!file || !staffId || file.staffId !== staffId) throw new NotFoundException('File not found');
    await this.folderRepo.deleteFile(fileId);
    await this.storage.removeBestEffort(LMS_MATERIALS_BUCKET, file.objectKey);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'LMS_FILE_DELETED',
      objectType: 'lms_file',
      objectId: fileId,
      outcome: 'SUCCESS',
      beforeData: file,
    });
  }

  // ============================================================
  // Tasks (per real class -- subject_offering)
  // ============================================================

  async listTasks(personId: string, subjectOfferingId: string) {
    const owns = await this.scopeRepo.ownsOffering(personId, subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    return this.taskRepo.findForOffering(subjectOfferingId);
  }

  async createTask(personId: string, dto: CreateLmsTaskDto) {
    const owns = await this.scopeRepo.ownsOffering(personId, dto.subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    const id = await this.taskRepo.create({
      subjectOfferingId: dto.subjectOfferingId,
      createdBy: personId,
      title: dto.title,
      description: dto.description ?? null,
      dueDate: dto.dueDate ?? null,
      attachmentObjectKey: null,
      attachmentFileName: null,
    });
    return this.taskRepo.findById(id);
  }

  private async assertOwnsTask(personId: string, taskId: string) {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new NotFoundException('Task not found');
    const owns = await this.scopeRepo.ownsOffering(personId, task.subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    return task;
  }

  async updateTask(personId: string, taskId: string, dto: UpdateLmsTaskDto) {
    await this.assertOwnsTask(personId, taskId);
    await this.taskRepo.update(taskId, dto);
    return this.taskRepo.findById(taskId);
  }

  async deleteTask(personId: string, taskId: string) {
    await this.assertOwnsTask(personId, taskId);
    await this.taskRepo.delete(taskId);
  }

  // ============================================================
  // Lesson Plans (per real class -- subject_offering)
  // ============================================================

  async listLessonPlans(personId: string, subjectOfferingId: string) {
    const owns = await this.scopeRepo.ownsOffering(personId, subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    return this.lessonPlanRepo.findForOffering(subjectOfferingId);
  }

  async createLessonPlan(personId: string, dto: CreateLmsLessonPlanDto) {
    const owns = await this.scopeRepo.ownsOffering(personId, dto.subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    const id = await this.lessonPlanRepo.create({
      subjectOfferingId: dto.subjectOfferingId,
      createdBy: personId,
      title: dto.title,
      content: dto.content,
      weekStart: dto.weekStart ?? null,
      attachmentObjectKey: null,
      attachmentFileName: null,
    });
    return this.lessonPlanRepo.findById(id);
  }

  private async assertOwnsLessonPlan(personId: string, planId: string) {
    const plan = await this.lessonPlanRepo.findById(planId);
    if (!plan) throw new NotFoundException('Lesson plan not found');
    const owns = await this.scopeRepo.ownsOffering(personId, plan.subjectOfferingId);
    if (!owns) throw new ForbiddenException('You do not teach this class.');
    return plan;
  }

  async updateLessonPlan(personId: string, planId: string, dto: UpdateLmsLessonPlanDto) {
    await this.assertOwnsLessonPlan(personId, planId);
    await this.lessonPlanRepo.update(planId, dto);
    return this.lessonPlanRepo.findById(planId);
  }

  async deleteLessonPlan(personId: string, planId: string) {
    await this.assertOwnsLessonPlan(personId, planId);
    await this.lessonPlanRepo.delete(planId);
  }
}
