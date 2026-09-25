import type { SeedContext } from "../lib/db";

import { pick, pickWeighted, rand, exactSplit, shuffle } from "../lib/util";

import { MALE_FIRST_NAMES, FEMALE_FIRST_NAMES, surnamesForCommunity, NEUTRAL_SURNAMES, TN_LOCALITIES } from "../data/names";

import { GRADES, SECTIONS, bandForGrade, SUBJECTS_BY_BAND, SR_SEC_STREAMS, SR_SEC_SUBJECTS, NON_EXAMINABLE_SUBJECTS } from "../data/academics";

import { COMMUNITY_CATEGORIES, COMMUNITY_WEIGHTS, BLOOD_GROUP_WEIGHTS } from "../data/org";

import type { Tier0Ids } from "./tier0";

import { roleEmail, seatEmail, createLoginAndCredential } from "../lib/identity";



export interface PersonRef { id: string; firstName: string; lastName: string; gender: "MALE" | "FEMALE"; }



export interface Tier1Ids {

  sectionIds: Record<string, string>; // "8-A" -> uuid

  sectionMeta: Record<string, { grade: string; band: string; stream?: string }>;

  students: { personId: string; studentId: string; sectionKey: string; communityCategory: string; isHosteller: boolean; usesTransport: boolean; medium: "english" | "tamil" }[];

  staff: { personId: string; staffId: string; isTeaching: boolean; subjectSpecialization?: string; roleCode?: string }[];

  leadershipPersonIds: { principal: string; vicePrincipal: string };

  subjectOfferingIds: { id: string; sectionKey: string; subjectName: string; teacherStaffId: string; examinable: boolean }[];

  academicTermIds: string[];

}



async function createPerson(ctx: SeedContext, opts: {

  firstName: string; lastName: string; gender: "MALE" | "FEMALE"; dob: string; mobile: string; email: string;

}): Promise<string> {

  const locality = pick(TN_LOCALITIES);

  return ctx.insertReturningId("person", {

    first_name: opts.firstName, last_name: opts.lastName,

   

    date_of_birth: opts.dob, gender: opts.gender, mobile: opts.mobile,

    email: opts.email,

    preferred_locale: "en-IN", status: "ACTIVE",

    address_line1: `No. ${Math.floor(rand() * 200 + 1)}, ${locality.area}`,

    city: locality.city, state: "Tamil Nadu", pincode: locality.pincode, district: locality.city,

  });

}



export async function seedTier1(ctx: SeedContext, t0: Tier0Ids): Promise<Tier1Ids> {

  // --- Sections: 56 = 14 grades x 4 sections ---

  const sectionIds: Record<string, string> = {};

  const sectionMeta: Tier1Ids["sectionMeta"] = {};

  for (const grade of GRADES) {

    const band = bandForGrade(grade);

    const streams = band === "SR_SEC" ? SR_SEC_STREAMS : [undefined];

    for (let i = 0; i < SECTIONS.length; i++) {

      const sec = SECTIONS[i]!;

      const key = `${grade}-${sec}`;

      const stream = band === "SR_SEC" ? SR_SEC_STREAMS[i % SR_SEC_STREAMS.length] : undefined;

      const id = await ctx.insertReturningId("section", {

        academic_year_id: t0.academicYearId, grade_id: t0.gradeIds[grade], medium_id: t0.mediumIds.english,

        campus_id: t0.campusId, name: sec, capacity: 40, status: "ACTIVE",

      });

      sectionIds[key] = id;

      sectionMeta[key] = { grade, band, stream };

    }

  }



  // --- Students: 2,240, real ratios reconciled in PLAN.md ---

  const students: Tier1Ids["students"] = [];

  const hostellerFlags = shuffle([...Array(224).fill(true), ...Array(2016).fill(false)]);

  const transportFlags = shuffle([...Array(672).fill(true), ...Array(1568).fill(false)]);

  const mediumFlags = shuffle([...Array(1904).fill("english" as const), ...Array(336).fill("tamil" as const)]);

  const communityFlags = shuffle(

    Object.entries(exactSplit(2240, COMMUNITY_WEIGHTS)).flatMap(([cat, n]) => Array(n).fill(cat)),

  );

  const bloodFlags = shuffle(

    Object.entries(BLOOD_GROUP_WEIGHTS).flatMap(([bg, n]) => Array(n).fill(bg)),

  );

  const firstGenFlags = shuffle([...Array(134).fill(true), ...Array(2106).fill(false)]);

  const disabledFlags = shuffle([...Array(45).fill(true), ...Array(2195).fill(false)]);



  let studentCursor = 0;

  let admissionCounter = 100001;

  for (const grade of GRADES) {

    for (const sec of SECTIONS) {

      const key = `${grade}-${sec}`;

      for (let s = 0; s < 40; s++) {

        const gender = rand() < 0.5 ? "MALE" : "FEMALE";

        const community = communityFlags[studentCursor] as (typeof COMMUNITY_CATEGORIES)[number];

        const surnamePool = surnamesForCommunity(community);

        const firstName = gender === "MALE" ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);

        const lastName = pick(surnamePool);

        const ageBase = grade === "LKG" ? 4 : grade === "UKG" ? 5 : Number(grade) + 5;

        const dob = `${2026 - ageBase}-${String(Math.floor(rand() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rand() * 28) + 1).padStart(2, "0")}`;

        const personId = await createPerson(ctx, { firstName, lastName, gender, dob, mobile: `9${Math.floor(rand() * 900000000 + 100000000)}`, email: roleEmail("student", `${firstName}${lastName}`) });

        const isHosteller = hostellerFlags[studentCursor]!;

        const usesTransport = transportFlags[studentCursor]!;

        const medium = mediumFlags[studentCursor]!;

        const isDifferentlyAbled = disabledFlags[studentCursor]!;

        const studentId = await ctx.insertReturningId("student", {

          person_id: personId, admission_no: `SVM${admissionCounter++}`,

          admission_date: `${2025}-06-01`, medium_id: t0.mediumIds[medium as "english" | "tamil"],

          community_category: community === "OC" ? "GENERAL" : community === "SC(A)" ? "SC" : community, is_first_gen_learner: firstGenFlags[studentCursor],

          is_differently_abled: isDifferentlyAbled,

          support_needs: isDifferentlyAbled ? "Requires extended time in written exams" : null,

          blood_group: bloodFlags[studentCursor], is_hosteller: isHosteller, uses_school_transport: usesTransport,

          status: "ACTIVE", commute_mode: isHosteller ? "WALK" : usesTransport ? "OTHER" : "PARENT_DROP",

          nationality: "Indian", admission_quota: studentCursor < 40 && grade === "LKG" && studentCursor < 40 * 0.25 ? "RTE" : "GENERAL",

        });

        students.push({ personId, studentId, sectionKey: key, communityCategory: community, isHosteller, usesTransport, medium });

        studentCursor++;

      }

    }

  }

  // student_enrolment, one per student, current year+section â€” real exhaustive link.

  await ctx.insertMany(

    "student_enrolment",

    ["student_id", "section_id", "academic_year_id", "roll_no", "status"],

    students.map((s, i) => {

      const rollNo = (i % 40) + 1;

      return [s.studentId, sectionIds[s.sectionKey], t0.academicYearId, rollNo, "ACTIVE"];

    }),

  );



  // --- Staff: 150 = 110 teaching (incl. 2 leadership) + 40 non-teaching ---

  const staff: Tier1Ids["staff"] = [];

  const ACADEMIC_SUBJECT_POOL = ["English", "Tamil", "Mathematics", "Science", "Social Science", "Physics", "Chemistry", "Computer Science", "Accountancy", "Economics", "History"];

  let empCounter = 1001;

  async function makeStaffPerson(isTeaching: boolean, subjectSpecialization: string | undefined, roleWord: string, roleCode?: string) {

    const gender = rand() < 0.5 ? "MALE" : "FEMALE";

    const firstName = gender === "MALE" ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);

    const lastName = pick(NEUTRAL_SURNAMES);

    const dob = `${1970 + Math.floor(rand() * 30)}-${String(Math.floor(rand() * 12) + 1).padStart(2, "0")}-15`;

    const email = roleEmail(roleWord, `${firstName}${lastName}`);

    const personId = await createPerson(ctx, { firstName, lastName, gender, dob, mobile: `9${Math.floor(rand() * 900000000 + 100000000)}`, email });

    await createLoginAndCredential(ctx, personId, email);

    const staffId = await ctx.insertReturningId("staff", {

      person_id: personId, employee_no: `EMP${empCounter++}`,

      designation: isTeaching ? "Teacher" : "Support Staff", is_teaching: isTeaching,

      date_of_joining: `${2015 + Math.floor(rand() * 9)}-06-01`, status: "ACTIVE",

      experience_years: 2 + Math.floor(rand() * 20), department_id: t0.departmentIds["Primary"],

      campus_id: t0.campusId, blood_group: pickWeighted(BLOOD_GROUP_WEIGHTS as any),

      employment_type: "PERMANENT", highest_qualification: isTeaching ? (rand() < 0.3 ? "M.Ed" : "B.Ed") : "Bachelor's Degree",

      specialization: subjectSpecialization ?? null, tet_net_cleared: isTeaching, is_hosteller: false, uses_school_transport: false,

    });

    staff.push({ personId, staffId, isTeaching, subjectSpecialization, roleCode });

    return { personId, staffId };

  }



  const leadershipPrincipal = await makeStaffPerson(true, "Educational Leadership", "principal", "PRINCIPAL");

  const leadershipVP = await makeStaffPerson(true, "Educational Leadership", "viceprincipal", "VICE_PRINCIPAL");

  for (let i = 0; i < 108; i++) await makeStaffPerson(true, pick(ACADEMIC_SUBJECT_POOL), "faculty", "FACULTY");

  // [designation, count, emailRoleWord, real role_code or undefined when the

  // job has no matching app role (lab assistant/counsellor/security)] — the

  // SAME mapping tier5_org.ts now reads via staff[].roleCode, so email prefix

  // and role_assignment can never drift apart.

  const nonTeachingCounts: [string, number, string, string | undefined][] = [

    ["Admin/Office", 2, "admin", "ADMIN"], ["Finance/Accounts", 4, "finance", "FINANCE"],

    ["Librarian", 3, "library", "LIBRARY"], ["Lab Assistant", 4, "labassistant", undefined],

    ["Hostel Warden", 2, "hostelwarden", "HOSTEL_WARDEN"], ["Nurse", 2, "healthincharge", "HEALTH_INCHARGE"],

    ["Counsellor", 2, "counsellor", undefined], ["Security", 5, "security", undefined],

    ["Bus Attendant", 12, "busattendant", "BUS_ATTENDANT"], ["Transport Manager", 1, "transportmanager", "TRANSPORT_MANAGER"],

    ["Media Room Staff", 3, "mediaroom", "MEDIA_ROOM"],

  ];

  for (const [designation, count, roleWord, roleCode] of nonTeachingCounts) {

    for (let i = 0; i < count; i++) await makeStaffPerson(false, undefined, roleWord, roleCode);

  }



  // --- subject_offering: 376 total, real per-band subject list ---

  const teachingStaffPool = staff.filter((s) => s.isTeaching).map((s) => s.staffId);

  const subjectOfferingIds: Tier1Ids["subjectOfferingIds"] = [];

  for (const [key, meta] of Object.entries(sectionMeta)) {

    const subjects = meta.band === "SR_SEC" ? SR_SEC_SUBJECTS[meta.stream as keyof typeof SR_SEC_SUBJECTS] : SUBJECTS_BY_BAND[meta.band as keyof typeof SUBJECTS_BY_BAND];

    const nonExaminable = meta.band === "PRE_PRIMARY" ? [] : NON_EXAMINABLE_SUBJECTS;

    for (const subjName of [...subjects, ...nonExaminable]) {

      const subjectId = t0.subjectIds[subjName];

      if (!subjectId) continue;

      const teacherStaffId = pick(teachingStaffPool);

      const weeklyPeriods = subjName === "Mathematics" ? 6 : subjName === "Physical Education" ? 2 : subjName === "Club Activity" ? 1 : 5;

      const id = await ctx.insertReturningId("subject_offering", {

        academic_year_id: t0.academicYearId, section_id: sectionIds[key], subject_id: subjectId,

        teacher_staff_id: teacherStaffId, is_practical: ["Physics", "Chemistry", "Computer Science"].includes(subjName),

        weekly_periods: weeklyPeriods, status: "ACTIVE",

      });

      subjectOfferingIds.push({ id, sectionKey: key, subjectName: subjName, teacherStaffId, examinable: meta.band !== "PRE_PRIMARY" && !NON_EXAMINABLE_SUBJECTS.includes(subjName) });

    }

  }



  // --- academic_term: real 3-term Samacheer Kalvi structure ---

  const academicTermIds: string[] = [];

  for (const [num, name, start, end] of [

    [1, "Term 1", "2025-06-01", "2025-09-30"],

    [2, "Term 2", "2025-10-01", "2025-12-31"],

    [3, "Term 3", "2026-01-01", "2026-04-30"],

  ] as const) {

    academicTermIds.push(await ctx.insertReturningId("academic_term", {

      academic_year_id: t0.academicYearId, term_number: num, name, start_date: start, end_date: end, is_current: num === 2,

    }));

  }



  // --- class_teacher_login + academic_coordinator_login: real, SEPARATE seat

  // identities (own person/login_identifier/user_credential/role_assignment),

  // never the real teacher's own personId â€” confirmed against the actual

  // migrations (0032_class_teacher_login.sql, 0015_academic_coordinator_

  // secondary_login.sql), which both explicitly mirror the Community-login

  // pattern: "a brand-new person row ... NOT a second credential bolted onto

  // an existing person." The link back to the real teacher is the separate

  // faculty_person_id column, not the login identity itself.

  const classAdvisorStaff = shuffle(teachingStaffPool).slice(0, 56);

  let advisorIdx = 0;

  for (const grade of GRADES) {

    for (const sec of SECTIONS) {

      const advisorStaffId = classAdvisorStaff[advisorIdx++]!;

      const advisorPersonId = staff.find((s) => s.staffId === advisorStaffId)!.personId;

      const advisorEmail = seatEmail(`classadvisor${grade}${sec}`);

      const seatPersonId = await ctx.insertReturningId("person", {

        first_name: "Class Advisor", last_name: `${grade}${sec}`, email: advisorEmail, status: "ACTIVE",

      });

      await createLoginAndCredential(ctx, seatPersonId, advisorEmail);

      await ctx.query(

        `INSERT INTO class_teacher_login (login_person_id, grade_id, section_name) VALUES ($1,$2,$3)`,

        [seatPersonId, t0.gradeIds[grade], sec],

      );

      ctx.counters["class_teacher_login"] = (ctx.counters["class_teacher_login"] ?? 0) + 1;

      await ctx.insertReturningId("class_teacher_login_assignment", {

        class_teacher_login_id: seatPersonId, academic_year_id: t0.academicYearId, section_id: sectionIds[`${grade}-${sec}`],

        faculty_person_id: advisorPersonId, assigned_on: new Date().toISOString(), status: "ACTIVE",

      });

      await ctx.insertReturningId("role_assignment", {

        person_id: seatPersonId, role_code: "CLASS_ADVISOR", scope_type: "SECTION", scope_id: sectionIds[`${grade}-${sec}`],

        academic_year_id: t0.academicYearId, valid_from: "2025-06-01", status: "ACTIVE",

      });

    }

  }

  const coordinatorCandidates = shuffle(teachingStaffPool.filter((id) => !classAdvisorStaff.includes(id))).slice(0, 12);

  let coordSeq = 0;

  for (const staffId of coordinatorCandidates) {

    coordSeq++;

    const facultyPersonId = staff.find((s) => s.staffId === staffId)!.personId;

    const seatPersonId = await ctx.insertReturningId("person", {

      first_name: "Academic", last_name: `Coordinator ${coordSeq}`, email: seatEmail(`academiccoordinator${coordSeq}`), status: "ACTIVE",

    });

    await createLoginAndCredential(ctx, seatPersonId, seatEmail(`academiccoordinator${coordSeq}`));

    await ctx.query(`INSERT INTO academic_coordinator_login (coordinator_person_id, faculty_person_id) VALUES ($1,$2)`, [seatPersonId, facultyPersonId]);

    ctx.counters["academic_coordinator_login"] = (ctx.counters["academic_coordinator_login"] ?? 0) + 1;

    await ctx.insertReturningId("role_assignment", {

      person_id: seatPersonId, role_code: "ACADEMIC_COORDINATOR", scope_type: "SCHOOL",

      academic_year_id: t0.academicYearId, valid_from: "2025-06-01", status: "ACTIVE",

    });

  }



  return {

    sectionIds, sectionMeta, students, staff,

    leadershipPersonIds: { principal: leadershipPrincipal.personId, vicePrincipal: leadershipVP.personId },

    subjectOfferingIds, academicTermIds,

  };

}

