import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

// Re-inserts only the tier-11 tables whose rows were rejected the first time (nothing else is touched).
export async function seedTier11c(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids) {
  const teachingStaff = t1.staff.filter((s) => s.isTeaching);
  const principalId = t1.leadershipPersonIds.principal;
  const examinableOfferings = t1.subjectOfferingIds.filter((o) => o.examinable);

  // person_document: verified documents must carry verified_at/verified_by
  await ctx.insertMany("person_document",
    ["person_id", "category", "doc_type", "object_key", "file_name", "mime_type", "size_bytes", "checksum_sha256", "is_restricted", "is_verified", "verified_by", "verified_at", "uploaded_by", "retain_until"],
    t1.students.map((s, i) => [s.personId, "ADMISSION", "BIRTH_CERTIFICATE", `docs/${s.personId}/birth-cert.pdf`, "birth_certificate.pdf", "application/pdf",
      380000 + (i % 40) * 1000, (s.personId.replace(/-/g, "") + s.studentId.replace(/-/g, "")).slice(0, 64), false, true, principalId, "2025-06-10T10:00:00Z", principalId, "2032-06-01"]));

  // person_device_token: the first pass passed student ids where person ids are required
  const studentPersons = shuffle(t1.students.map((s) => s.personId)).slice(0, Math.round(t1.students.length * 0.7));
  await ctx.insertMany("person_device_token", ["person_id", "expo_push_token", "platform", "last_seen_at"],
    studentPersons.map((id) => [id, `ExponentPushToken[${id.slice(0, 12)}]`, pick(["ANDROID", "IOS"]), new Date().toISOString()]));

  // purchase_request -> purchase_order -> purchase_order_event
  const purchaseRequestIds: string[] = [];
  for (let i = 0; i < 80; i++) {
    purchaseRequestIds.push(await ctx.insertReturningId("purchase_request", {
      reference_no: `PR-2025-${String(i + 1).padStart(4, "0")}`, request_type: "GOODS", item_name: pick(["Lab Chemicals", "Sports Equipment", "Stationery Bulk", "Cleaning Supplies"]),
      quantity: 10 + Math.floor(rand() * 50), department_id: pick(Object.values(t0.departmentIds)), requested_by: pick(t1.staff.map((s) => s.personId)), state: i < 72 ? "APPROVED" : "PENDING",
    }));
  }
  for (let i = 0; i < 72; i++) {
    const orderId = await ctx.insertReturningId("purchase_order", { purchase_request_id: purchaseRequestIds[i], order_no: `PO-2025-${String(i + 1).padStart(4, "0")}`, quantity_ordered: 20, quantity_delivered: 20, quantity_allotted: 20, stage: "DELIVERED", placed_on: isoDate(new Date()), created_by: principalId });
    await ctx.insertReturningId("purchase_order_event", { purchase_order_id: orderId, stage: "DELIVERED", quantity_delivered: 20, recorded_by: principalId, recorded_at: new Date().toISOString() });
  }

  // google_account_connection
  await ctx.insertMany("google_account_connection", ["staff_id", "google_account_email", "refresh_token_encrypted", "token_scope", "status", "connected_at"],
    teachingStaff.map((s) => [s.staffId, `${s.personId.slice(0, 8)}@sis.in`, "encrypted-token-placeholder", "https://www.googleapis.com/auth/calendar", rand() < 0.95 ? "ACTIVE" : "REVOKED", new Date().toISOString()]));

  // online_class
  const onlineClassRows: unknown[][] = [];
  for (let i = 0; i < 500; i++) {
    const offering = pick(examinableOfferings);
    onlineClassRows.push([offering.id, offering.teacherStaffId, `${offering.subjectName} - Makeup Class`, isoDate(new Date(2025, 7 + (i % 8), 1 + (i % 27))), "16:00", "16:45", "COMPLETED", "GOOGLE_MEET", "SUCCEEDED", `idem-${i}`]);
  }
  await ctx.insertMany("online_class", ["subject_offering_id", "faculty_staff_id", "topic", "scheduled_date", "start_time", "end_time", "status", "meeting_provider", "meeting_creation_status", "idempotency_key"], onlineClassRows);

  console.log("Tier 11c (rejected tier-11 tables refilled) done.");
}
