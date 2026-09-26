import type { SeedContext } from "../lib/db";
import { pick, rand, isoDate } from "../lib/util";
import { TN_HOLIDAYS, SCHOOL_EVENTS } from "../data/calendar";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

export async function seedTier5Org(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids) {
  // role catalogue is seeded in tier0.ts (role_assignment rows in tier1.ts need it first).

  // --- role_assignment: real mapping per PLAN.md §2 ---
  const assign = async (personId: string, roleCode: string, scopeType: string, scopeId: string | null = null) => {
    await ctx.insertReturningId("role_assignment", {
      person_id: personId, role_code: roleCode, scope_type: scopeType, scope_id: scopeId,
      academic_year_id: t0.academicYearId, valid_from: "2025-06-01", status: "ACTIVE",
    });
  };
  await assign(t1.leadershipPersonIds.principal, "PRINCIPAL", "SCHOOL");
  await assign(t1.leadershipPersonIds.vicePrincipal, "VICE_PRINCIPAL", "SCHOOL");
  for (const s of t1.staff.filter((x) => x.isTeaching)) await assign(s.personId, "FACULTY", "SCHOOL");
  // Non-teaching + leadership roles come straight from the roleCode tier1.ts
  // stamped on each staff row at creation (same source as the email prefix),
  // so a "finance..." login can never end up holding a different role.
  const singleton = new Set(["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"]); // DB allows one ACTIVE holder of these
  const seenSingleton = new Set<string>();
  for (const s of t1.staff.filter((x) => !x.isTeaching && x.roleCode)) {
    if (singleton.has(s.roleCode!)) { if (seenSingleton.has(s.roleCode!)) continue; seenSingleton.add(s.roleCode!); }
    await assign(s.personId, s.roleCode!, "SCHOOL");
  }
  const teachingPool = t1.staff.filter((x) => x.isTeaching).map((x) => x.personId);
  for (let i = 0; i < 20; i++) await assign(teachingPool[i]!, "SPORTS_FACULTY", "SCHOOL");
  for (let i = 0; i < 2; i++) await assign(teachingPool[i]!, "SPORTS_ADMIN", "SCHOOL");
  for (let i = 20; i < 25; i++) await assign(teachingPool[i]!, "COMMUNITY_INCHARGE", "SCHOOL");
  for (const personId of t2.guardianPersonIds) await assign(personId, "PARENT", "SCHOOL");
  const communitySubset = t2.guardianPersonIds.slice(0, 80);
  for (const personId of communitySubset) await assign(personId, "COMMUNITY", "SCHOOL");

  // --- calendar_event: real TN festival + school-event calendar ---
  for (const h of TN_HOLIDAYS) {
    const start = new Date(h.month >= 6 ? 2025 : 2026, h.month - 1, h.day);
    const end = new Date(start); end.setDate(end.getDate() + h.days - 1);
    await ctx.insertReturningId("calendar_event", {
      academic_year_id: t0.academicYearId, title: h.name, event_type: "HOLIDAY", is_holiday: true,
      start_date: isoDate(start), end_date: isoDate(end), scope_type: "SCHOOL",
    });
  }
  for (const [i, name] of SCHOOL_EVENTS.entries()) {
    const d = new Date(2025 + Math.floor(i / 6), (6 + i * 2) % 12, 15);
    await ctx.insertReturningId("calendar_event", {
      academic_year_id: t0.academicYearId, title: name, event_type: "FUNCTION", is_holiday: false,
      start_date: isoDate(d), end_date: isoDate(d), scope_type: "SCHOOL",
    });
  }

  // --- id_card: one per student + one per staff, real ---
  const idCardRows: unknown[][] = [];
  for (const s of t1.students) idCardRows.push([`ID-STU-${s.studentId.slice(0, 8)}`, "DESFIRE_EV2", "STUDENT", s.studentId, null, "2025-06-10", "ACTIVE"]);
  for (const s of t1.staff) idCardRows.push([`ID-STF-${s.staffId.slice(0, 8)}`, "DESFIRE_EV2", "STAFF", null, s.staffId, "2025-06-10", "ACTIVE"]);
  await ctx.insertMany("id_card", ["card_uid", "card_tech", "holder_type", "student_id", "staff_id", "issued_on", "status"], idCardRows);

  // --- announcement: real school notices, targeted correctly ---
  const announcementDefs = [
    { title: "Pongal Holidays Announced", body: "School will remain closed from Jan 14 to Jan 17 for Pongal.", category: "GENERAL" },
    { title: "Annual Day Celebrations", body: "Annual Day will be held on the school grounds. All parents are invited.", category: "EVENT" },
    { title: "Fee Payment Reminder - Term 2", body: "Term 2 fee instalment is due. Please clear dues at the earliest.", category: "FINANCE" },
    { title: "PTA Meeting Scheduled", body: "Parent-Teacher meeting for all grades on the coming Saturday.", category: "GENERAL" },
    { title: "Sports Day Schedule", body: "Sports Day trials begin next week. Selected students will be notified.", category: "SPORTS" },
  ];
  for (const a of announcementDefs) {
    const id = await ctx.insertReturningId("announcement", {
      title: a.title, body: a.body, category: a.category, priority: "NORMAL", is_emergency: false,
      publish_at: new Date().toISOString(), created_by: t1.leadershipPersonIds.principal, state: "PUBLISHED",
    });
    await ctx.insertReturningId("announcement_audience", { announcement_id: id, audience_type: "SCHOOL" });
  }

  console.log("Tier 5 (org-wide) done.");
}
