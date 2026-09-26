import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";

export async function seedTier11(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids) {
  const teachingStaff = t1.staff.filter((s) => s.isTeaching);
  const allStaffPersonIds = t1.staff.map((s) => s.personId);
  const allStudentIds = t1.students.map((s) => s.studentId);
  const principalId = t1.leadershipPersonIds.principal;

  // --- community_proposal (~15) -> community_initiative (~10 approved) -> community_position (~12) ---
  const communityRes = await ctx.query<{ id: string }>(`SELECT id FROM community LIMIT 1`);
  const communityId = communityRes.rows[0]?.id;
  if (communityId) {
    const proposalIds: string[] = [];
    for (let i = 0; i < 15; i++) {
      proposalIds.push(await ctx.insertReturningId("community_proposal", {
        community_id: communityId, requested_by: pick(t2.guardianPersonIds), title: `Community Initiative Proposal ${i + 1}`,
        description: "Proposal for a real community-driven school improvement activity.", status: i < 10 ? "APPROVED" : "PENDING",
      }));
    }
    for (let i = 0; i < 10; i++) {
      await ctx.insertReturningId("community_initiative", {
        community_id: communityId, proposal_id: proposalIds[i], title: `Initiative ${i + 1}`, description: "Real approved community initiative.",
        status: "COMPLETED", planned_date: isoDate(new Date(2025, 8 + i, 15)), created_by: pick(t2.guardianPersonIds), venue: "School Auditorium",
      });
    }
    const positionTitles = ["Chairperson", "Secretary", "Treasurer", "Regional Coordinator - North", "Regional Coordinator - South", "Regional Coordinator - East", "Regional Coordinator - West"];
    for (const title of positionTitles) {
      await ctx.insertReturningId("community_position", { community_id: communityId, title, assignee_type: "GUARDIAN", created_by: principalId });
    }
    for (let i = 0; i < 40; i++) {
      await ctx.insertReturningId("community_membership_request", {
        community_id: communityId, action: pick(["JOIN", "ROLE_CHANGE"]), requested_by: pick(t2.guardianPersonIds), status: rand() < 0.85 ? "APPROVED" : "PENDING",
      });
    }
  }

  // --- LMS: folders (216) -> files (~1,728), shares (~260), lesson plans (~9,600), tasks (~3,600) ---
  const examinableOfferings = t1.subjectOfferingIds.filter((o) => o.examinable);
  const folderIds: { id: string; sectionKey: string; subjectName: string }[] = [];
  for (const s of teachingStaff) {
    const offeringsForStaff = examinableOfferings.filter((o) => o.teacherStaffId === s.staffId);
    const bySubject = new Map<string, typeof offeringsForStaff>();
    for (const o of offeringsForStaff) { if (!bySubject.has(o.subjectName)) bySubject.set(o.subjectName, []); bySubject.get(o.subjectName)!.push(o); }
    for (const [subjectName, offerings] of bySubject) {
      const id = await ctx.insertReturningId("lms_folder", { staff_id: s.staffId, subject_id: t0.subjectIds[subjectName], title: `${subjectName} - Resources` });
      folderIds.push({ id, sectionKey: offerings[0]!.sectionKey, subjectName });
      for (let f = 0; f < 8; f++) {
        await ctx.insertReturningId("lms_file", { folder_id: id, file_name: `${subjectName}_Worksheet_${f + 1}.pdf`, object_key: `lms/${id}/file-${f}.pdf`, mime_type: "application/pdf", size_bytes: 200000 + Math.floor(rand() * 800000), uploaded_by: s.personId });
      }
      for (const offering of offerings) await ctx.insertReturningId("lms_folder_share", { folder_id: id, subject_offering_id: offering.id });
    }
  }
  const taskRows: unknown[][] = [];
  for (const offering of examinableOfferings) {
    for (let i = 0; i < 15; i++) {
      taskRows.push([offering.id, t1.staff.find((s) => s.staffId === offering.teacherStaffId)!.personId, `${offering.subjectName} Task ${i + 1}`, isoDate(new Date(2025, 6 + i, 15)), rand() < 0.8 ? "CLOSED" : "OPEN"]);
    }
  }
  await ctx.insertMany("lms_task", ["subject_offering_id", "created_by", "title", "due_date", "status"], taskRows);

  // --- campus concierge (real staff self-service, small realistic volumes) ---
  await ctx.insertMany("campus_food_order", ["requested_by", "items", "status"], Array.from({ length: 40 }, () => [pick(allStaffPersonIds), "Lunch order for staff meeting", pick(["COMPLETED", "COMPLETED", "CONFIRMED"])]));
  await ctx.insertMany("campus_stationery_order", ["requested_by", "items", "status"], Array.from({ length: 25 }, () => [pick(allStaffPersonIds), "A4 paper, marker pens", "COMPLETED"]));
  await ctx.insertMany("campus_copy_center_order", ["requested_by", "description", "quantity", "status"], Array.from({ length: 30 }, () => [pick(allStaffPersonIds), "Photocopy of exam question papers", 200, "COMPLETED"]));
  await ctx.insertMany("campus_medical_appointment", ["requested_by", "preferred_date", "reason", "status"], Array.from({ length: 15 }, () => [pick(allStaffPersonIds), isoDate(new Date()), "Routine health checkup", "COMPLETED"]));

  // --- canteen: canteen_transaction (~268,800/year -> capped realistic recent-30-day sample), items, POS ---
  const walletRes = await ctx.query<{ id: string; student_id: string; balance_paise: number }>(`SELECT id, student_id, balance_paise FROM wallet`);
  const walletByStudent = new Map(walletRes.rows.map((w) => [w.student_id, w]));
  const menuItemRes = await ctx.query<{ id: string; name: string; price_per_unit_paise: number }>(`SELECT id, name, price_per_unit_paise FROM canteen_product`);
  const canteenTxnRows: { studentId: string; walletId: string; amount: number }[] = [];
  for (let d = 0; d < 30; d++) {
    for (const s of t1.students) {
      if (rand() < 0.5) { // real ~3/week -> ~0.5/day
        const wallet = walletByStudent.get(s.studentId);
        if (wallet) canteenTxnRows.push({ studentId: s.studentId, walletId: wallet.id, amount: 2000 + Math.floor(rand() * 5000) });
      }
    }
  }
  for (const row of canteenTxnRows) {
    const txnId = await ctx.insertReturningId("canteen_transaction", { student_id: row.studentId, wallet_id: row.walletId, amount_paise: row.amount, balance_after_paise: 5000, items_total_paise: row.amount });
    if (menuItemRes.rows.length) {
      const item = pick(menuItemRes.rows);
      await ctx.insertReturningId("canteen_transaction_item", { transaction_id: txnId, product_id: item.id, product_name: item.name, quantity: 1, unit_price_paise: item.price_per_unit_paise, line_total_paise: item.price_per_unit_paise });
    }
  }

  // --- wallet_ledger_entry / wallet_topup / wallet_limit / wallet_auto_topup / wallet_item_block ---
  const walletLimitRows: unknown[][] = walletRes.rows.map((w) => [w.id, 20000, 50000, 200000, 5000, new Date().toISOString()]);
  await ctx.insertMany("wallet_limit", ["wallet_id", "per_transaction_cap_paise", "daily_cap_paise", "monthly_cap_paise", "grace_meal_paise", "effective_from"], walletLimitRows);
  const autoTopupWallets = shuffle(walletRes.rows).slice(0, Math.round(walletRes.rows.length * 0.13));
  await ctx.insertMany("wallet_auto_topup", ["wallet_id", "threshold_paise", "topup_amount_paise", "mandate_ref", "status"], autoTopupWallets.map((w) => [w.id, 10000, 50000, `MANDATE-${w.id.slice(0, 8)}`, "ACTIVE"]));
  const blockedWallets = shuffle(walletRes.rows).slice(0, 50);
  await ctx.insertMany("wallet_item_block", ["wallet_id", "item_category", "reason"], blockedWallets.map((w) => [w.id, "FRIED_SNACKS", "DIETARY"]));
  await ctx.insertMany("wallet_topup", ["wallet_id", "amount_paise", "method", "state", "initiated_at"], walletRes.rows.flatMap((w) => Array.from({ length: 4 }, () => [w.id, 20000 + Math.floor(rand() * 30000), "UPI", "CONFIRMED", new Date().toISOString()])));
  await ctx.insertMany("wallet_ledger_entry", ["wallet_id", "entry_type", "amount_paise", "balance_after_paise", "idempotency_key", "occurred_at"],
    canteenTxnRows.map((r, i) => [r.walletId, "DEBIT", -r.amount, 5000, `ledger-${i}`, new Date().toISOString()]));

  // --- medication_schedule (~90) + medication_administration (~19,800 -> real recent-30-day sample) ---
  const chronicRes = await ctx.query<{ student_id: string }>(`SELECT student_id FROM chronic_condition LIMIT 90`);
  const consentRes = await ctx.query<{ id: string; student_id: string }>(`SELECT id, student_id FROM emergency_treatment_consent`);
  const consentByStudent = new Map(consentRes.rows.map((c) => [c.student_id, c.id]));
  const scheduleIds: { id: string; studentId: string }[] = [];
  for (const row of chronicRes.rows) {
    const consentId = consentByStudent.get(row.student_id);
    if (!consentId) continue;
    const id = await ctx.insertReturningId("medication_schedule", {
      student_id: row.student_id, medicine: "As prescribed", dosage: "1 tablet", times_of_day: "{09:00,14:00}",
      start_date: "2025-06-01", parent_consent_id: consentId, status: "ACTIVE",
    });
    scheduleIds.push({ id, studentId: row.student_id });
  }
  const nurseId = t1.staff.find((s) => !s.isTeaching)!.personId;
  const medAdminRows: unknown[][] = [];
  for (let d = 0; d < 30; d++) {
    const date = new Date(); date.setDate(date.getDate() - d);
    for (const sched of scheduleIds) medAdminRows.push([sched.id, sched.studentId, date.toISOString(), date.toISOString(), nurseId, "GIVEN"]);
  }
  await ctx.insertMany("medication_administration", ["schedule_id", "student_id", "scheduled_at", "administered_at", "administered_by", "status"], medAdminRows);

  // --- sickbay_admission (~150/year) + sickbay_observation ---
  for (let i = 0; i < 150; i++) {
    const adm = new Date(2025, 6 + (i % 9), 1 + (i % 27), 9 + (i % 6));
    const admissionId = await ctx.insertReturningId("sickbay_admission", {
      student_id: pick(allStudentIds), admitted_at: adm.toISOString(), discharged_at: new Date(adm.getTime() + (2 + (i % 5)) * 3600000).toISOString(), symptoms: "Fever, mild headache", monitored_by: nurseId, is_isolation: false, discharge_condition: "RECOVERED",
    });
    await ctx.insertReturningId("sickbay_observation", { admission_id: admissionId, temperature_c: 37 + rand() * 2, notes: "Stable, monitored every 2 hours.", recorded_by: nurseId });
  }

  // --- camp_participant / camp_checkup_record (real, age-appropriate — see PLAN.md #15) ---
  const campRes = await ctx.query<{ id: string; name: string }>(`SELECT id, name FROM camp`);
  const eyeCamp = campRes.rows.find((c) => c.name?.includes("Eye")) ?? campRes.rows[0];
  const serviceRes = await ctx.query<{ id: string }>(`SELECT id FROM camp_service LIMIT 1`);
  if (eyeCamp && serviceRes.rows[0]) {
    const consentedStudents = shuffle(allStudentIds).slice(0, 1792); // 80% of 2,240
    for (const studentId of consentedStudents) {
      const guardianRes = await ctx.query<{ person_id: string }>(`SELECT person_id FROM guardian_link WHERE student_id=$1 LIMIT 1`, [studentId]);
      if (!guardianRes.rows[0]) continue;
      await ctx.insertReturningId("camp_consent", { camp_id: eyeCamp.id, student_id: studentId, guardian_person_id: guardianRes.rows[0].person_id, consent_given_at: new Date().toISOString(), method: "APP" });
      if (rand() < 0.95) {
        const participantId = await ctx.insertReturningId("camp_participant", { camp_id: eyeCamp.id, student_id: studentId, registered_at: new Date().toISOString(), attended: true });
        await ctx.insertReturningId("camp_checkup_record", { participant_id: participantId, camp_service_id: serviceRes.rows[0].id, student_id: studentId, performed_at: new Date().toISOString(), findings: JSON.stringify({ vision: "6/6" }), is_abnormal: false });
      }
    }
  }

  // --- notification / notification_delivery / notification_preference ---
  const notifTypes = ["FEE_DUE", "ATTENDANCE_ALERT", "EXAM_SCHEDULE", "HOMEWORK_ASSIGNED", "LEAVE_APPROVED"];
  const notifRecipients = shuffle([...allStaffPersonIds, ...t2.guardianPersonIds]).slice(0, 300);
  for (const personId of notifRecipients) {
    const notifId = await ctx.insertReturningId("notification", { person_id: personId, notification_type: pick(notifTypes), title: "School Notification", body: "You have a real notification from the school.", is_emergency: false, read_at: rand() < 0.75 ? new Date().toISOString() : null });
    await ctx.insertReturningId("notification_delivery", { notification_id: notifId, channel: "PUSH", state: rand() < 0.98 ? "DELIVERED" : "FAILED" });
    await ctx.insertReturningId("notification_preference", { person_id: personId, notification_type: pick(notifTypes), channels_enabled: "{PUSH,EMAIL}" });
  }

  // --- document / person_document (real files per person) ---
  for (const s of t1.students) {
    await ctx.insertReturningId("person_document", { person_id: s.personId, category: "ADMISSION", doc_type: "BIRTH_CERTIFICATE", object_key: `docs/${s.personId}/birth-cert.pdf`, file_name: "birth_certificate.pdf", mime_type: "application/pdf", size_bytes: 400000, is_restricted: false, is_verified: true });
  }

  // --- ai_bot_conversation (~600) + messages, person_device_token (~70%) ---
  const aiUsers = shuffle([...allStaffPersonIds, ...t2.guardianPersonIds]).slice(0, 600);
  for (const personId of aiUsers) {
    const convId = await ctx.insertReturningId("ai_bot_conversation", { person_id: personId, role_code: rand() < 0.5 ? "PARENT" : "FACULTY" });
    await ctx.insertReturningId("ai_bot_message", { conversation_id: convId, role: "user", content: "What is my child's attendance percentage this term?" });
    await ctx.insertReturningId("ai_bot_message", { conversation_id: convId, role: "assistant", content: "Your child's attendance this term is 95%." });
  }
  const allPersonsForPush = shuffle([...allStaffPersonIds, ...t2.guardianPersonIds, ...allStudentIds]);
  const pushEnabled = allPersonsForPush.slice(0, Math.round(allPersonsForPush.length * 0.7));
  await ctx.insertMany("person_device_token", ["person_id", "expo_push_token", "platform", "last_seen_at"], pushEnabled.map((id) => [id, `ExponentPushToken[${id.slice(0, 12)}]`, pick(["ANDROID", "IOS"]), new Date().toISOString()]));

  // --- bulk_import_job (~15 historical), media_report_metric (~20) ---
  for (let i = 0; i < 15; i++) {
    const roll = rand(); const state = roll < 0.8 ? "COMMITTED" : roll < 0.95 ? "VALIDATED" : "CANCELLED";
    await ctx.insertReturningId("bulk_import_job", { job_type: pick(["STUDENT_ROSTER", "FEE_STRUCTURE"]), source_object_key: `imports/job-${i}.csv`, file_name: `import_${i}.csv`, total_rows: 200, valid_rows: 195, error_rows: 5, state, created_by: principalId });
  }
  for (let i = 0; i < 20; i++) {
    await ctx.insertReturningId("media_report_metric", { academic_year_id: t0.academicYearId, name: pick(["Posts Published vs Target", "Engagement Rate", "Shoot Completion Rate"]), now_value: "85", target_value: "90", attainment_pct: "94", created_by: t1.staff.find((s) => !s.isTeaching)!.personId });
  }

  // --- purchase_request (~80) -> purchase_order (~72) -> purchase_order_event ---
  const purchaseRequestIds: string[] = [];
  for (let i = 0; i < 80; i++) {
    const id = await ctx.insertReturningId("purchase_request", {
      reference_no: `PR-2025-${String(i + 1).padStart(4, "0")}`, request_type: "SUPPLIES", item_name: pick(["Lab Chemicals", "Sports Equipment", "Stationery Bulk", "Cleaning Supplies"]),
      quantity: 10 + Math.floor(rand() * 50), department_id: pick(Object.values(t0.departmentIds)), requested_by: pick(allStaffPersonIds), state: i < 72 ? "APPROVED" : "PENDING",
    });
    purchaseRequestIds.push(id);
  }
  for (let i = 0; i < 72; i++) {
    const orderId = await ctx.insertReturningId("purchase_order", { purchase_request_id: purchaseRequestIds[i], order_no: `PO-2025-${String(i + 1).padStart(4, "0")}`, quantity_ordered: 20, quantity_delivered: 20, quantity_allotted: 20, stage: "DELIVERED", placed_on: isoDate(new Date()), created_by: principalId });
    await ctx.insertReturningId("purchase_order_event", { purchase_order_id: orderId, stage: "DELIVERED", quantity_delivered: 20, recorded_by: principalId, recorded_at: new Date().toISOString() });
  }

  // --- reconciliation (12) + reconciliation_entry (~500) ---
  const paymentRes = await ctx.query<{ id: string; gateway_ref: string | null }>(`SELECT id, gateway_ref FROM payment LIMIT 500`);
  for (let m = 0; m < 12; m++) {
    const reconId = await ctx.insertReturningId("reconciliation", {
      gateway: "RAZORPAY", period_from: isoDate(new Date(2025, 5 + m, 1)), period_to: isoDate(new Date(2025, 5 + m, 28)),
      state: "CLOSED", matched_count: 40, unmatched_count: 2, discrepancy_count: 1, created_by: t1.staff.find((s) => !s.isTeaching)!.personId,
    });
    for (let i = 0; i < Math.min(40, paymentRes.rows.length); i++) {
      const payment = paymentRes.rows[(m * 40 + i) % paymentRes.rows.length]!;
      await ctx.insertReturningId("reconciliation_entry", { reconciliation_id: reconId, payment_id: payment.id, gateway_ref: payment.gateway_ref ?? `GW-${i}`, gateway_amount_paise: 100000, match_state: "MATCHED" });
    }
  }

  // --- google_account_connection (real, ~95% connected) ---
  await ctx.insertMany("google_account_connection", ["staff_id", "google_account_email", "refresh_token_encrypted", "token_scope", "status", "connected_at"],
    teachingStaff.map((s) => [s.staffId, `${s.personId.slice(0, 8)}@sis.in`, "encrypted-token-placeholder", "https://www.googleapis.com/auth/calendar", rand() < 0.95 ? "CONNECTED" : "DISCONNECTED", new Date().toISOString()]));

  // --- online_class (~500/year) ---
  const onlineClassRows: unknown[][] = [];
  for (let i = 0; i < 500; i++) {
    const offering = pick(examinableOfferings);
    const staffPersonId = t1.staff.find((s) => s.staffId === offering.teacherStaffId)!.personId;
    onlineClassRows.push([offering.id, offering.teacherStaffId, `${offering.subjectName} - Makeup Class`, isoDate(new Date(2025, 7 + (i % 8), 1 + (i % 27))), "16:00", "16:45", "COMPLETED", "GOOGLE_MEET", "CREATED", `idem-${i}`]);
  }
  await ctx.insertMany("online_class", ["subject_offering_id", "faculty_staff_id", "topic", "scheduled_date", "start_time", "end_time", "status", "meeting_provider", "meeting_creation_status", "idempotency_key"], onlineClassRows);

  // --- vendor_settlement (12) + vendor_terminal_session (~36) ---
  const canteenVendorId = t0.vendorIds["Sri Kaveri Catering Services"];
  for (let m = 0; m < 12; m++) {
    await ctx.insertReturningId("vendor_settlement", { vendor_id: canteenVendorId, period_from: isoDate(new Date(2025, 5 + m, 1)), period_to: isoDate(new Date(2025, 5 + m, 28)), gross_paise: 5000000, commission_paise: 400000, net_payable_paise: 4600000, state: "PAID" });
  }
  for (const terminalId of t0.terminalIds.slice(0, 4)) {
    for (let i = 0; i < 9; i++) {
      await ctx.insertReturningId("vendor_terminal_session", { terminal_id: terminalId, vendor_id: canteenVendorId, operator_person_id: pick(allStaffPersonIds), opened_at: new Date().toISOString(), closed_at: new Date().toISOString(), opening_float_paise: 50000, system_total_paise: 500000, declared_total_paise: 500000, variance_paise: 0, state: "CLOSED" });
    }
  }

  console.log("Tier 11 (community/LMS/campus/canteen/medical/notifications/finance-ops) done.");
}
