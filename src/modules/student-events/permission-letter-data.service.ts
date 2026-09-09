// Assembles the one real payload both the Faculty and Parent "download
// permission letter" endpoints return -- a single source of truth so the letter
// content can never drift between the two sides. The mobile app turns this JSON
// into the actual PDF (via expo-print), same as the Fees receipt already does
// (see school-eos-mobile's receipt-html.ts/receipt-print.ts) -- no PDF library
// needed on this backend.

import { Injectable, NotFoundException } from '@nestjs/common';
import { SchoolProfileRepository } from '../finance/master-data/repositories/school-profile.repository';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { EVENT_SIGNATURES_BUCKET } from './student-event-storage.util';
import { StudentEventParticipantRepository } from './repositories/student-event-participant.repository';

const SIGNATURE_SIGNED_URL_TTL_SECONDS = 15 * 60;

export interface PermissionLetterPayload {
  state: string;
  decidedAt: string | null;
  event: {
    name: string;
    location: string;
    purpose: string;
    startsAt: string;
    endsAt: string;
  };
  monitoringTeacher: { name: string; designation: string | null };
  student: {
    name: string;
    admissionNo: string;
    rollNo: number | null;
    gradeName: string | null;
    sectionName: string | null;
  };
  classTeacherName: string | null;
  parent: {
    name: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  };
  school: {
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    pincode: string | null;
    board: string | null;
    recognitionNo: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null;
  signatureUrl: string | null;
}

@Injectable()
export class PermissionLetterDataService {
  constructor(
    private readonly participantRepo: StudentEventParticipantRepository,
    private readonly schoolProfileRepo: SchoolProfileRepository,
    private readonly storage: StorageService,
  ) {}

  async build(participantId: string): Promise<PermissionLetterPayload> {
    const data = await this.participantRepo.findLetterData(participantId);
    if (!data) throw new NotFoundException('Permission request not found');
    if (data.state === 'PENDING') {
      throw new NotFoundException(
        'This permission letter is only available once the request has been decided.',
      );
    }

    const school = await this.schoolProfileRepo.get();
    const signatureUrl = data.signatureObjectKey
      ? await this.storage.createSignedUrl(
          EVENT_SIGNATURES_BUCKET,
          data.signatureObjectKey,
          SIGNATURE_SIGNED_URL_TTL_SECONDS,
        )
      : null;

    return {
      state: data.state,
      decidedAt: data.decidedAt ? new Date(data.decidedAt).toISOString() : null,
      event: {
        name: data.eventName,
        location: data.eventLocation,
        purpose: data.eventPurpose,
        startsAt: new Date(data.eventStartsAt).toISOString(),
        endsAt: new Date(data.eventEndsAt).toISOString(),
      },
      monitoringTeacher: {
        name: data.monitoringTeacherName,
        designation: data.monitoringTeacherDesignation,
      },
      student: {
        name: data.studentName,
        admissionNo: data.admissionNo,
        rollNo: data.rollNo,
        gradeName: data.gradeName,
        sectionName: data.sectionName,
      },
      classTeacherName: data.classTeacherName,
      parent: {
        name: data.parentName,
        addressLine1: data.parentAddressLine1,
        addressLine2: data.parentAddressLine2,
        city: data.parentCity,
        state: data.parentState,
        pincode: data.parentPincode,
      },
      school: school
        ? {
            name: school.name,
            addressLine1: school.addressLine1,
            addressLine2: school.addressLine2,
            city: school.city,
            district: school.district,
            state: school.state,
            pincode: school.pincode,
            board: school.board,
            recognitionNo: school.recognitionNo,
            contactPhone: school.contactPhone,
            contactEmail: school.contactEmail,
          }
        : null,
      signatureUrl,
    };
  }
}
