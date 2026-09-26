import type { SeedContext } from "../lib/db";
import { pick, rand, exactSplit, isoDate, shuffle } from "../lib/util";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

export async function seedTier6Library(ctx: SeedContext, t1: Tier1Ids, t2: Tier2Ids) {
  // --- library_member: students(2,240) + staff(150) + 30% of guardians(941) ---
  const memberIds: { id: string; type: "STUDENT" | "STAFF" | "GUARDIAN" }[] = [];
  const studentMemberRows: unknown[][] = t1.students.map((s) => [s.personId, "STUDENT", 3, "ACTIVE"]);
  const staffMemberRows: unknown[][] = t1.staff.map((s) => [s.personId, "STAFF", 5, "ACTIVE"]);
  // member_type is a real CHECK (STUDENT | STAFF only) - guardians are not library members in this schema.
  const allMemberRows = [...studentMemberRows, ...staffMemberRows];
  await ctx.insertMany("library_member", ["person_id", "member_type", "max_books_allowed", "status"], allMemberRows);

  const memberRes = await ctx.query<{ id: string; person_id: string }>(`SELECT id, person_id FROM library_member`);
  const bookCopyRes = await ctx.query<{ id: string; book_id: string }>(`SELECT id, book_id FROM library_book_copy`);
  // library_book_copy itself must exist first — real 1.64 copies/title average.
  const bookRes = await ctx.query<{ id: string }>(`SELECT id FROM library_book`);
  const copyRows: unknown[][] = [];
  let copyCounter = 1;
  for (const book of bookRes.rows) {
    const copies = rand() < 0.3 ? (rand() < 0.5 ? 3 : 5) : 1; // popular titles get more copies
    for (let c = 0; c < copies; c++) {
      copyRows.push([book.id, `CPY-${String(copyCounter++).padStart(6, "0")}`, "AVAILABLE"]);
    }
  }
  await ctx.insertMany("library_book_copy", ["book_id", "copy_code", "status"], copyRows);
  const copies = (await ctx.query<{ id: string }>(`SELECT id FROM library_book_copy`)).rows;
  const members = memberRes.rows;

  // --- library_issue: ~18,000/year real circulation, 90% on-time / 7% late / 3% out ---
  const issueTotal = 18000;
  const issueSplit = exactSplit(issueTotal, { ON_TIME: 90, LATE: 7, CURRENT: 3 } as const);
  const issueRows: unknown[][] = [];
  const lateIssueMarkers: number[] = [];
  let issueCursor = 0;
  const currentCopyPool = shuffle(copies.map((c) => c.id)); // a copy can only be out with ONE member at a time
  for (const [kind, count] of Object.entries(issueSplit)) {
    for (let i = 0; i < count; i++) {
      const member = pick(members);
      const copy = kind === "CURRENT" ? { id: currentCopyPool.pop()! } : pick(copies);
      const issuedAt = new Date(2025, 5 + Math.floor(rand() * 10), 1 + Math.floor(rand() * 27));
      const dueDate = new Date(issuedAt); dueDate.setDate(dueDate.getDate() + 14);
      let returnedAt: string | null = null; let status = "RETURNED";
      if (kind === "ON_TIME") { const r = new Date(dueDate); r.setDate(r.getDate() - Math.floor(rand() * 5)); returnedAt = r.toISOString(); }
      else if (kind === "LATE") { const r = new Date(dueDate); r.setDate(r.getDate() + 1 + Math.floor(rand() * 8)); returnedAt = r.toISOString(); lateIssueMarkers.push(issueCursor); }
      else { status = "ISSUED"; }
      issueRows.push([copy.id, member.id, member.person_id, issuedAt.toISOString(), isoDate(dueDate), returnedAt, 0, status]);
      issueCursor++;
    }
  }
  await ctx.insertMany("library_issue", ["copy_id", "member_id", "issued_by", "issued_at", "due_date", "returned_at", "renewed_count", "status"], issueRows);
  const issues = (await ctx.query<{ id: string; member_id: string; due_date: string; returned_at: string | null }>(`SELECT id, member_id, due_date, returned_at FROM library_issue WHERE returned_at IS NOT NULL`)).rows;

  // --- library_fine: real ₹5/day on the late-return cohort (~7% = ~1,260) ---
  const fineRows: unknown[][] = [];
  for (const issue of issues) {
    const due = new Date(issue.due_date);
    const returned = new Date(issue.returned_at!);
    const lateDays = Math.round((returned.getTime() - due.getTime()) / 86400000);
    if (lateDays > 0) {
      const amount = lateDays * 500;
      const roll = rand();
      const status = roll < 0.8 ? "PAID" : roll < 0.95 ? "WAIVED" : "PENDING";
      fineRows.push([issue.id, issue.member_id, "OVERDUE", amount, new Date().toISOString(), members[0]!.person_id, status]);
    }
  }
  await ctx.insertMany("library_fine", ["issue_id", "member_id", "reason", "amount_paise", "assessed_at", "assessed_by", "status"], fineRows);

  // --- library_reservation: ~600/year real holds ---
  const reservationRows: unknown[][] = [];
  for (let i = 0; i < 600; i++) {
    const book = pick(bookRes.rows);
    const member = pick(members);
    const roll = rand();
    const status = roll < 0.7 ? "FULFILLED" : roll < 0.9 ? "EXPIRED" : "PENDING";
    reservationRows.push([book.id, member.id, new Date().toISOString(), status]);
  }
  await ctx.insertMany("library_reservation", ["book_id", "member_id", "reserved_at", "status"], reservationRows);

  // --- library_lost_damaged_report: ~40/year ---
  const lostDamagedRows: unknown[][] = [];
  for (let i = 0; i < 40; i++) {
    const copy = pick(copies);
    lostDamagedRows.push([copy.id, pick(["LOST", "DAMAGED"]), "Reported by student during return", pick(members).person_id, new Date().toISOString()]);
  }
  await ctx.insertMany("library_lost_damaged_report", ["copy_id", "type", "reason", "reported_by", "reported_at"], lostDamagedRows);

  console.log("Tier 6 (library circulation) done.");
}
