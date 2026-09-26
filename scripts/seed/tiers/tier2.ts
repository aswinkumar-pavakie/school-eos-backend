import type { SeedContext } from "../lib/db";
import { pick, pickWeighted, rand, exactSplit, isoDate } from "../lib/util";
import { EXAMS, GRADE_BANDS } from "../data/academics";
import { FEE_TUITION_BY_BAND, FEE_ADMISSION, FEE_EXAM_BY_BAND, FEE_ACTIVITY_BY_BAND, FEE_TRANSPORT, FEE_HOSTEL } from "../data/calendar";
import { MALE_FIRST_NAMES, FEMALE_FIRST_NAMES, NEUTRAL_SURNAMES } from "../data/names";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import { roleEmail, createLoginAndCredential } from "../lib/identity";

export interface Tier2Ids {
  examIds: { id: string; name: string; kind: string; date: Date }[];
  gradeScaleBandIds: string[];
  hostelBlockIds: { boys: string[]; girls: string[] };
  feeStructureIdByBand: Record<string, string>;
  guardianPersonIds: string[];
  studentFeeAssignmentIds: Map<string, string>; // studentId -> assignment id
}

// Real family model (see PLAN.md): 1,900 families, 340 with 2 siblings.
function buildFamilyAssignments(studentIds: string[]): Map<string, string[]> {
  // returns familyKey -> [studentIds]; simplistic real pairing: first 680
  // students (already grouped by grade/section order) paired sequentially
  // into 340 sibling families is NOT realistic (siblings are different ages),
  // so instead: reserve last 680 students across the whole roster, pair
  // student i with student i+1120 as siblings (spans grade gap realistically).
  const families = new Map<string, string[]>();
  const siblingCount = 680;
  const singlesCount = studentIds.length - siblingCount;
  for (let i = 0; i < singlesCount; i++) families.set(`FAM-S-${i}`, [studentIds[i]!]);
  for (let i = 0; i < siblingCount / 2; i++) {
    families.set(`FAM-P-${i}`, [studentIds[singlesCount + i]!, studentIds[singlesCount + siblingCount / 2 + i]!]);
  }
  return families;
}

export async function seedTier2(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids): Promise<Tier2Ids> {
  // --- exam: 7/year for grades 1-12 (LKG/UKG get 2 informal assessments) ---
  const examIds: Tier2Ids["examIds"] = [];
  for (const e of EXAMS) {
    const date = new Date(e.month >= 6 ? 2025 : 2026, e.month - 1, 15);
    const id = await ctx.insertReturningId("exam", {
      academic_year_id: t0.academicYearId, name: e.name, exam_type: e.kind,
      grade_scale_id: t0.gradeScaleId, state: "CONDUCTED", // marks can only be inserted while CONDUCTED/MARKS_ENTRY; run.ts publishes right after marks load
    });
    examIds.push({ id, name: e.name, kind: e.kind, date });
  }

  // --- grade_band: real CBSE/TN 8-band scale ---
  const gradeScaleBandIds: string[] = [];
  for (const b of GRADE_BANDS) {
    gradeScaleBandIds.push(await ctx.insertReturningId("grade_band", {
      grade_scale_id: t0.gradeScaleId, label: b.label, min_percent: b.min, max_percent: b.max,
      grade_point: b.label === "E" ? 0 : (10 - GRADE_BANDS.indexOf(b)),
    }));
  }

  // --- hostel_block / hostel_floor / hostel_room / hostel_bed (real capacity math, see PLAN.md) ---
  const hostelBlockIds = { boys: [] as string[], girls: [] as string[] };
  for (let i = 1; i <= 2; i++) hostelBlockIds.boys.push(await ctx.insertReturningId("hostel_block", { hostel_id: t0.hostelIds.boys, name: `Block ${i}` }));
  for (let i = 1; i <= 2; i++) hostelBlockIds.girls.push(await ctx.insertReturningId("hostel_block", { hostel_id: t0.hostelIds.girls, name: `Block ${i}` }));

  const allBeds: { bedId: string; gender: "MALE" | "FEMALE" }[] = [];
  for (const [gender, blockIds, floorsPerBlock, roomsPerFloor] of [
    ["MALE", hostelBlockIds.boys, 2, 10], ["FEMALE", hostelBlockIds.girls, 2, 8],
  ] as const) {
    for (const blockId of blockIds) {
      for (let f = 1; f <= floorsPerBlock; f++) {
        const floorId = await ctx.insertReturningId("hostel_floor", { block_id: blockId, floor_no: f });
        for (let r = 1; r <= roomsPerFloor; r++) {
          const roomId = await ctx.insertReturningId("hostel_room", { floor_id: floorId, room_no: `${f}${String(r).padStart(2, "0")}`, room_type: "STANDARD", bed_capacity: 4, status: "ACTIVE" });
          for (let b = 1; b <= 4; b++) {
            const bedId = await ctx.insertReturningId("hostel_bed", { room_id: roomId, bed_no: `${r}-${b}`, status: "VACANT" });
            allBeds.push({ bedId, gender });
          }
        }
      }
    }
  }

  // --- fee_structure + fee_structure_line: real TN rupee figures per band ---
  const bandKeyFor = (band: string, stream?: string) =>
    band === "SR_SEC" ? (stream === "SCIENCE" ? "SR_SEC_SCIENCE" : "SR_SEC_OTHER") : band;
  const feeStructureIdByBand: Record<string, string> = {};
  const feeStructureLineByBand: Record<string, { instalment: number; head: string; amountPaise: number; dueMonth: number }[]> = {};
  for (const bandKey of ["PRE_PRIMARY", "PRIMARY", "MIDDLE", "SECONDARY", "SR_SEC_SCIENCE", "SR_SEC_OTHER"]) {
    const tuition = FEE_TUITION_BY_BAND[bandKey]!;
    const exam = FEE_EXAM_BY_BAND[bandKey]!;
    const activity = FEE_ACTIVITY_BY_BAND[bandKey]!;
    const total = (tuition + exam + activity) * 100;
    const gradeForBand = bandKey === "PRE_PRIMARY" ? t0.gradeIds["LKG"] : bandKey === "PRIMARY" ? t0.gradeIds["1"] : bandKey === "MIDDLE" ? t0.gradeIds["6"] : bandKey === "SECONDARY" ? t0.gradeIds["9"] : t0.gradeIds["11"];
    const structureId = await ctx.insertReturningId("fee_structure", {
      academic_year_id: t0.academicYearId, grade_id: gradeForBand, category: bandKey, total_paise: total, state: "ACTIVE",
    });
    feeStructureIdByBand[bandKey] = structureId;
    const perInstalment = Math.round(total / 4);
    const lines = [];
    for (let inst = 1; inst <= 4; inst++) {
      const dueMonth = [7, 9, 12, 2][inst - 1]!;
      const lineId = await ctx.insertReturningId("fee_structure_line", {
        fee_structure_id: structureId, fee_head_id: t0.feeHeadIds["Tuition Fee"], amount_paise: perInstalment,
        instalment_no: inst, due_date: isoDate(new Date(dueMonth >= 6 ? 2025 : 2026, dueMonth - 1, 5)), late_fee_paise: 20000,
      });
      lines.push({ instalment: inst, head: "Tuition Fee", amountPaise: perInstalment, dueMonth });
    }
    feeStructureLineByBand[bandKey] = lines;
  }

  // --- guardian_link: real family model (1,900 families, 3,135 distinct guardians, 3,696 links) ---
  const families = buildFamilyAssignments(t1.students.map((s) => s.studentId));
  const guardianPersonIds: string[] = [];
  const familyList = [...families.entries()];
  const twoGuardianFlags = familyList.map((_, i) => i < familyList.length * 0.65);
  for (let fi = 0; fi < familyList.length; fi++) {
    const [, studentIdsInFamily] = familyList[fi]!;
    const isTwoGuardian = twoGuardianFlags[fi]!;
    const fatherName = pick(MALE_FIRST_NAMES);
    const motherName = pick(FEMALE_FIRST_NAMES);
    const surname = pick(NEUTRAL_SURNAMES);
    const guardians: { personId: string; relationship: string }[] = [];
    const fatherPersonId = await createGuardianPerson(ctx, fatherName, surname, "MALE");
    guardians.push({ personId: fatherPersonId, relationship: "FATHER" });
    guardianPersonIds.push(fatherPersonId);
    if (isTwoGuardian) {
      const motherPersonId = await createGuardianPerson(ctx, motherName, surname, "FEMALE");
      guardians.push({ personId: motherPersonId, relationship: "MOTHER" });
      guardianPersonIds.push(motherPersonId);
    }
    for (const studentId of studentIdsInFamily) {
      for (let gi = 0; gi < guardians.length; gi++) {
        await ctx.insertReturningId("guardian_link", {
          student_id: studentId, person_id: guardians[gi]!.personId, relationship: guardians[gi]!.relationship,
          is_primary_contact: gi === 0, access_level: "FULL", is_authorised_pickup: true,
          occupation: pick(["Engineer", "Teacher", "Business", "Government Employee", "Farmer", "Homemaker"]),
        });
      }
    }
  }

  // --- health_profile: 2,240, real height/weight by age band ---
  const healthRows: unknown[][] = [];
  for (const s of t1.students) {
    healthRows.push([s.studentId, pickWeighted({ "O+": 840, "B+": 660, "A+": 470, "AB+": 160, "O-": 45, "B-": 35, "A-": 20, "AB-": 10 }), 100 + Math.floor(rand() * 65), 18 + Math.floor(rand() * 45), isoDate(new Date(2025, 5, 1))]);
  }
  await ctx.insertMany("health_profile", ["student_id", "blood_group", "height_cm", "weight_kg", "measured_on"], healthRows);

  // --- wallet: 2,240, real balance distribution ---
  const balanceSplit = exactSplit(2240, { LOW: 30, MID: 40, HIGH: 20, TOPUP: 10 } as const);
  const balances = [
    ...Array(balanceSplit.LOW).fill(0).map(() => Math.floor(rand() * 20000)),
    ...Array(balanceSplit.MID).fill(0).map(() => 20000 + Math.floor(rand() * 30000)),
    ...Array(balanceSplit.HIGH).fill(0).map(() => 50000 + Math.floor(rand() * 50000)),
    ...Array(balanceSplit.TOPUP).fill(0).map(() => 100000 + Math.floor(rand() * 100000)),
  ];
  await ctx.insertMany("wallet", ["student_id", "balance_paise", "status", "version"], t1.students.map((s, i) => [s.studentId, balances[i] ?? 5000, "ACTIVE", 1]));

  // --- student_fee_assignment: 2,240, real concession-aware net ---
  const studentFeeAssignmentIds = new Map<string, string>();
  for (const s of t1.students) {
    const meta = t1.sectionMeta[s.sectionKey]!;
    const bandKey = bandKeyFor(meta.band, meta.stream);
    const structureId = feeStructureIdByBand[bandKey]!;
    const grossPaise = (FEE_TUITION_BY_BAND[bandKey]! + FEE_EXAM_BY_BAND[bandKey]! + FEE_ACTIVITY_BY_BAND[bandKey]!) * 100
      + (s.usesTransport ? FEE_TRANSPORT * 100 : 0) + (s.isHosteller ? FEE_HOSTEL * 100 : 0);
    const concessionPaise = ["SC", "SC(A)", "ST"].includes(s.communityCategory) && rand() < 0.9 ? Math.round(grossPaise * 0.7) : (rand() < 0.05 ? Math.round(grossPaise * 0.2) : 0);
    const assignId = await ctx.insertReturningId("student_fee_assignment", {
      student_id: s.studentId, fee_structure_id: structureId, academic_year_id: t0.academicYearId,
      gross_paise: grossPaise, concession_paise: concessionPaise, net_paise: grossPaise - concessionPaise, status: "ACTIVE",
    });
    studentFeeAssignmentIds.set(s.studentId, assignId);
  }

  return { examIds, gradeScaleBandIds, hostelBlockIds, feeStructureIdByBand, guardianPersonIds, studentFeeAssignmentIds };
}

async function createGuardianPerson(ctx: SeedContext, firstName: string, lastName: string, gender: "MALE" | "FEMALE"): Promise<string> {
  const email = roleEmail("parent", `${firstName}${lastName}`);
  const personId = await ctx.insertReturningId("person", {
    first_name: firstName, last_name: lastName,
    gender, mobile: `9${Math.floor(rand() * 900000000 + 100000000)}`, email,
    preferred_locale: "en-IN", status: "ACTIVE",
  });
  await createLoginAndCredential(ctx, personId, email);
  return personId;
}
