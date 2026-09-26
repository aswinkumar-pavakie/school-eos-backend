import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

// Re-inserts only the tier-12 tables whose rows were rejected the first time.
export async function seedTier12c(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids) {
  const allStaffPersonIds = t1.staff.map((s) => s.personId);
  const allStudentIds = t1.students.map((s) => s.studentId);
  const teachingPersonIds = t1.staff.filter((s) => s.isTeaching).map((s) => s.personId);
  const advisorId = teachingPersonIds[0]!;
  const principalId = t1.leadershipPersonIds.principal;

  await ctx.insertMany("card_replacement_request", ["student_id", "reason", "fee_charged_paise", "status"],
    Array.from({ length: 15 }, (_, i) => [allStudentIds[(i * 137) % allStudentIds.length], pick(["LOST", "DAMAGED", "NAME_CHANGE"]), 15000, "ISSUED"]));

  await ctx.insertMany("health_alert", ["alert_type", "student_id", "detected_at", "detail"],
    Array.from({ length: 10 }, () => [pick(["ALLERGY_RISK", "MEDICATION_MISSED", "FOLLOWUP_OVERDUE"]), pick(allStudentIds), new Date().toISOString(), JSON.stringify({ source: "nurse_review" })]));

  const tripRes = await ctx.query<{ id: string }>(`SELECT id FROM trip LIMIT 15`);
  await ctx.insertMany("transport_alert", ["trip_id", "alert_type", "severity", "raised_at"],
    tripRes.rows.map((t) => [t.id, pick(["DELAY", "DEVIATION"]), "INFO", new Date().toISOString()]));

  await ctx.insertMany("sos_incident", ["source_domain", "raised_by_person_id", "description", "raised_at", "state", "outcome_note"],
    Array.from({ length: 10 }, () => [pick(["TRANSPORT", "HOSTEL"]), pick(allStaffPersonIds), "SOS drill test - resolved.", new Date().toISOString(), "RESOLVED", "Drill completed; response time within limit."]));

  // student_event_participant: decision columns must agree with state (PENDING => all null; APPROVED => decider + time + signature)
  const events = (await ctx.query<{ id: string }>(`SELECT id FROM student_event`)).rows;
  const partRows: unknown[][] = [];
  for (const ev of events) {
    for (const studentId of shuffle(allStudentIds).slice(0, 30)) {
      if (rand() < 0.9) partRows.push([ev.id, studentId, "APPROVED", advisorId, advisorId, "2025-09-05T10:00:00Z", `event-consent/${ev.id}/${studentId}.png`]);
      else partRows.push([ev.id, studentId, "PENDING", advisorId, null, null, null]);
    }
  }
  await ctx.insertMany("student_event_participant", ["event_id", "student_id", "state", "added_by", "decided_by_person_id", "decided_at", "signature_object_key"], partRows);

  // finance_misc_receivable: person_id must be a person id
  const receivableIds: string[] = [];
  for (let i = 0; i < 60; i++) {
    const paid = rand() < 0.85;
    receivableIds.push(await ctx.insertReturningId("finance_misc_receivable", {
      source_module: pick(["LIBRARY", "CANTEEN", "EQUIPMENT"]), source_reference_id: crypto.randomUUID(), person_id: pick(t1.students).personId,
      description: "One-off receivable outside the standard fee cycle", amount_paise: 50000, paid_paise: paid ? 50000 : 0, status: paid ? "PAID" : "PENDING",
    }));
  }
  const financeStaffId = t1.staff.find((s) => !s.isTeaching)!.personId;
  for (const receivableId of receivableIds.slice(0, Math.round(receivableIds.length * 0.85))) {
    await ctx.insertReturningId("finance_misc_receivable_payment", { receivable_id: receivableId, amount_paise: 50000, mode: "ONLINE", collected_by: financeStaffId, paid_at: new Date().toISOString(), idempotency_key: `misc-${receivableId}` });
  }

  const docRows: unknown[][] = [];
  for (let i = 0; i < 300; i++) {
    const g = pick(t2.guardianPersonIds);
    docRows.push([pick(allStudentIds), g, pick(["BONAFIDE_CERTIFICATE", "TRANSFER_CERTIFICATE", "DUPLICATE_MARKSHEET"]), "Required for official purpose", rand() < 0.9 ? "APPROVED" : "PENDING"]);
  }
  await ctx.insertMany("document_request", ["student_id", "requested_by", "doc_type", "reason", "state"], docRows);

  console.log("Tier 12c (rejected tier-12 tables refilled) done.");
}
