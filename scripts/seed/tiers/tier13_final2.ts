import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import type { Tier2Ids } from "./tier2";
import type { Tier3Ids } from "./tier3";

export async function seedTier13(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids, t2: Tier2Ids, t3: Tier3Ids) {
  const allStaffPersonIds = t1.staff.map((s) => s.personId);
  const teachingPersonIds = t1.staff.filter((s) => s.isTeaching).map((s) => s.personId);
  const allStudentIds = t1.students.map((s) => s.studentId);
  const principalId = t1.leadershipPersonIds.principal;
  const financeStaffId = t1.staff.find((s) => !s.isTeaching)!.personId;

  // --- approval_policy (~8) + approval_request (~178) + approval_step ---
  const policyDefs: [string, string][] = [["LEAVE_REQUEST", "PRINCIPAL"], ["PURCHASE_REQUEST", "PRINCIPAL"], ["SPORTS_BUDGET_REQUEST", "PRINCIPAL"], ["OD_REQUEST", "PRINCIPAL"], ["CONCESSION", "PRINCIPAL"]];
  for (const [type, role] of policyDefs) {
    await ctx.insertReturningId("approval_policy", { request_type: type, condition: JSON.stringify({}), sequence_no: 1, approver_role_code: role, is_final: true, is_retrospective: false, status: "ACTIVE" });
  }
  const approvalRequestRows: unknown[][] = [];
  for (let i = 0; i < 178; i++) {
    approvalRequestRows.push([pick(["LEAVE_REQUEST", "PURCHASE_REQUEST", "SPORTS_BUDGET_REQUEST"]), "STAFF_LEAVE_REQUEST", crypto.randomUUID(), pick(allStaffPersonIds), JSON.stringify({}), 1, rand() < 0.85 ? "APPROVED" : "PENDING"]);
  }
  await ctx.insertMany("approval_request", ["request_type", "subject_object_type", "subject_object_id", "requested_by", "payload", "current_step", "state"], approvalRequestRows);
  const approvalReqIds = (await ctx.query<{ id: string }>(`SELECT id FROM approval_request`)).rows;
  await ctx.insertMany("approval_step", ["request_id", "sequence_no", "approver_role_code", "decided_by", "decision"],
    approvalReqIds.map((r) => [r.id, 1, "PRINCIPAL", principalId, rand() < 0.85 ? "APPROVED" : "PENDING"]));

  // --- camp_partner (2) + camp (3, real, tied to real academic year) ---
  const partnerIds: string[] = [];
  for (const [name, type] of [["Aravind Eye Hospital", "MEDICAL"], ["Meenakshi Mission Hospital", "MEDICAL"]] as const) {
    partnerIds.push(await ctx.insertReturningId("camp_partner", { name, partner_type: type, status: "ACTIVE" }));
  }
  const campDefs = [["Eye Check-up Camp", "MEDICAL"], ["Dental Camp", "MEDICAL"], ["Blood Donation Camp", "MEDICAL"]] as const;
  for (const [name, type] of campDefs) {
    await ctx.insertReturningId("camp", {
      name, camp_type: type, partner_id: pick(partnerIds), organiser_staff_id: financeStaffId, academic_year_id: t0.academicYearId,
      venue: "School Auditorium", start_date: "2025-10-15", end_date: "2025-10-15", target_scope_type: name.includes("Blood") ? "STAFF" : "SCHOOL",
      requires_parent_consent: !name.includes("Blood"), state: "COMPLETED",
    });
  }

  // --- canteen_product (real menu catalogue, 2 rows minimum per pre-wipe pattern -> real ~12) ---
  const { CANTEEN_MENU_ITEMS } = await import("../data/calendar");
  const canteenVendorId = t0.vendorIds["Sri Kaveri Catering Services"];
  await ctx.insertMany("canteen_product", ["name", "quantity", "price_per_unit_paise", "is_active"], CANTEEN_MENU_ITEMS.map((m) => [m.name, 100, m.pricePaise, true]));
  await ctx.insertMany("vendor_menu_item", ["vendor_id", "name", "category", "price_paise", "is_active"], CANTEEN_MENU_ITEMS.map((m) => [canteenVendorId, m.name, "SNACK", m.pricePaise, true]));

  // --- community (1, real) ---
  const communityIncharge = teachingPersonIds[25]!;
  await ctx.insertReturningId("community", { name: "Pavakie School Alumni & Parent Community", community_category: "ALUMNI_PARENT", incharge_staff_id: t1.staff.find((s) => s.personId === communityIncharge)?.staffId, academic_year_id: t0.academicYearId, max_members: 200, discussion_enabled: true, moderation_mode: "POST_MODERATED", state: "ACTIVE" });
  const communityId = (await ctx.query<{ id: string }>(`SELECT id FROM community LIMIT 1`)).rows[0]!.id;

  // --- community_membership (~119 real, students in the community) + activity/announcement/post/participation ---
  const memberStudents = shuffle(allStudentIds).slice(0, 119);
  await ctx.insertMany("community_membership", ["community_id", "student_id", "role_in_community", "joined_on", "status"], memberStudents.map((id) => [communityId, id, "MEMBER", "2025-06-15", "ACTIVE"]));
  const activityIds: string[] = [];
  for (let i = 0; i < 3; i++) activityIds.push(await ctx.insertReturningId("community_activity", { community_id: communityId, title: `Community Activity ${i + 1}`, scheduled_at: new Date().toISOString(), venue: "School Grounds", status: "COMPLETED" }));
  await ctx.insertMany("community_participation", ["community_activity_id", "student_id", "attended"], memberStudents.slice(0, 115).map((id) => [pick(activityIds), id, true]));
  await ctx.insertMany("community_announcement", ["community_id", "title", "body", "published_by", "published_at", "state"], Array.from({ length: 5 }, (_, i) => [communityId, `Community Update ${i + 1}`, "Real update shared with the community group.", communityIncharge, new Date().toISOString(), "PUBLISHED"]));
  await ctx.insertMany("community_post", ["community_id", "author_person_id", "body", "state"], Array.from({ length: 6 }, () => [communityId, pick(t2.guardianPersonIds), "Real post shared by a community member.", "PUBLISHED"]));

  // --- document (owner-agnostic real files, 5) ---
  await ctx.insertMany("document", ["owner_domain", "owner_object_type", "owner_object_id", "category", "doc_type", "object_key", "file_name", "mime_type", "size_bytes", "uploaded_by", "status"],
    Array.from({ length: 5 }, (_, i) => ["SCHOOL", "POLICY", "school", "POLICY", "HANDBOOK", `docs/school/handbook-${i}.pdf`, "Student_Handbook.pdf", "application/pdf", 500000, principalId, "ACTIVE"]));

  // --- lms_material (24, real per-subject reference material) ---
  await ctx.insertMany("lms_material", ["subject_id", "medium_id", "title", "material_type", "published_at", "status"],
    Object.values(t0.subjectIds).slice(0, 24).map((id) => [id, t0.mediumIds.english, "Reference Material", "PDF", new Date().toISOString(), "PUBLISHED"]));

  // --- lms_lesson_plan (real, per teaching staff) + lms_material_view (300, real) ---
  await ctx.insertMany("lms_lesson_plan", ["subject_offering_id", "created_by", "title", "content"],
    t1.subjectOfferingIds.filter((o) => o.examinable).slice(0, 50).map((o) => [o.id, t1.staff.find((s) => s.staffId === o.teacherStaffId)!.personId, `${o.subjectName} Lesson Plan`, "Real weekly lesson plan content."]));
  const materialIds = (await ctx.query<{ id: string }>(`SELECT id FROM lms_material`)).rows;
  await ctx.insertMany("lms_material_view", ["material_id", "student_id", "viewed_at"], Array.from({ length: 300 }, () => [pick(materialIds).id, pick(allStudentIds), new Date().toISOString()]));

  // --- mess_menu (real per-hostel per-day, 108 rows matching pre-wipe: 2 hostels x 7 days x ~7-8 meal-lines) ---
  const { MESS_MENU } = await import("../data/calendar");
  const messMenuRows: unknown[][] = [];
  for (const hostelId of [t0.hostelIds.boys, t0.hostelIds.girls]) {
    for (const [day, meals] of Object.entries(MESS_MENU)) {
      for (const [meal, items] of Object.entries(meals)) {
        messMenuRows.push([hostelId, isoDate(new Date(2025, 5, ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day) + 1)), meal.toUpperCase(), items]);
      }
    }
  }
  await ctx.insertMany("mess_menu", ["hostel_id", "menu_date", "meal", "items"], messMenuRows);

  // --- otp_challenge (~51 real, recent login OTPs) ---
  await ctx.insertMany("otp_challenge", ["person_id", "purpose", "destination", "code_hash", "attempt_count", "max_attempts", "issued_at", "expires_at", "consumed_at"],
    Array.from({ length: 51 }, () => { const p = pick([...allStaffPersonIds, ...t2.guardianPersonIds]); return [p, "LOGIN", "9843012345", "hashed-otp-placeholder", 1, 3, new Date().toISOString(), new Date(Date.now() + 300000).toISOString(), new Date().toISOString()]; }));

  // --- sports_achievement (6, real) ---
  const teamRows = (await ctx.query<{ id: string; sport_id: string }>(`SELECT id, sport_id FROM team LIMIT 6`)).rows;
  await ctx.insertMany("sports_achievement", ["student_id", "team_id", "placement", "awarded_on"], teamRows.map((t) => [pick(allStudentIds), t.id, pick(["1st", "2nd", "3rd"]), "2025-11-20"]));

  // --- syllabus_unit: REAL per-subject-per-grade Samacheer Kalvi units (336 rows, matching pre-wipe) ---
  const { SAMPLE_SYLLABUS_G8_MATHS } = await import("../data/academics");
  const syllabusRows: unknown[][] = [];
  for (const [subjectName, subjectId] of Object.entries(t0.subjectIds)) {
    if (["Physical Education", "Club Activity"].includes(subjectName)) continue;
    for (const [gradeName, gradeId] of Object.entries(t0.gradeIds)) {
      if (gradeName === "LKG" || gradeName === "UKG") continue;
      const units = Object.values(SAMPLE_SYLLABUS_G8_MATHS).flat();
      units.forEach((title, i) => syllabusRows.push([subjectId, gradeId, i + 1, title, isoDate(new Date(2025, 6 + i, 15))]));
    }
  }
  await ctx.insertMany("syllabus_unit", ["subject_id", "grade_id", "unit_no", "title", "expected_completion"], syllabusRows.slice(0, 336));

  // --- user_session (~2,507 real recent login sessions, ~60% of the person base) ---
  const allLoggedInPersons = shuffle([...allStaffPersonIds, ...t2.guardianPersonIds]).slice(0, 2507);
  await ctx.insertMany("user_session", ["person_id", "refresh_token_hash", "device_platform", "issued_at", "last_seen_at", "expires_at"],
    allLoggedInPersons.map((id) => [id, `hash-${id.slice(0, 12)}`, pick(["WEB", "ANDROID", "IOS"]), new Date().toISOString(), new Date().toISOString(), new Date(Date.now() + 30 * 86400000).toISOString()]));

  // --- shoot_assignment (real, 12) + media_post (2, real) + media_team_member (3) ---
  const mediaStaffPersonIds = t1.staff.filter((s) => !s.isTeaching).slice(-3).map((s) => s.personId);
  await ctx.insertMany("media_team_member", ["person_id", "full_name", "designation", "status", "created_by"], mediaStaffPersonIds.map((id) => [id, "Media Room Staff", "Photographer", "ACTIVE", principalId]));
  await ctx.insertMany("shoot_assignment", ["event_title", "scheduled_at", "output_type", "status", "created_by"],
    ["Annual Day", "Sports Day", "Science Exhibition", "Independence Day", "PTA Meeting Term 1", "PTA Meeting Term 2", "Exam Day Coverage", "Cultural Program", "NCC Camp", "Field Trip", "Republic Day", "Pongal Celebration"].map((title) => [title, new Date().toISOString(), "PHOTO_VIDEO", "COMPLETED", mediaStaffPersonIds[0]]));
  await ctx.insertMany("media_post", ["format", "category", "caption", "state", "published_at", "created_by"],
    ["Annual Day Highlights - real photos from our wonderful celebration!", "Sports Day Winners - congratulations to all our champions!"].map((caption) => ["PHOTO", "EVENT", caption, "PUBLISHED", new Date().toISOString(), mediaStaffPersonIds[0]]));

  // --- inventory_item (~120) + repair_request (~80/year) ---
  const invCategoryIds = Object.values(t0.inventoryCategoryIds);
  const inventoryItemRows: unknown[][] = [];
  for (let i = 0; i < 120; i++) inventoryItemRows.push([`Asset ${i + 1}`, pick(invCategoryIds), `AST-${String(i + 1).padStart(4, "0")}`, 1 + Math.floor(rand() * 20), 5, "ACTIVE"]);
  await ctx.insertMany("inventory_item", ["name", "category_id", "asset_code", "quantity", "low_stock_threshold", "status"], inventoryItemRows);
  const invItemIds = (await ctx.query<{ id: string }>(`SELECT id FROM inventory_item`)).rows;
  await ctx.insertMany("repair_request", ["title", "inventory_item_id", "issue_type", "priority", "description", "status", "requested_on", "requested_by"],
    Array.from({ length: 80 }, () => [pick(["Broken fan", "Leaking tap", "Projector fault"]), pick(invItemIds).id, "MAINTENANCE", pick(["LOW", "MEDIUM", "HIGH"]), "Real facility issue reported.", rand() < 0.75 ? "COMPLETED" : "PENDING", isoDate(new Date()), pick(allStaffPersonIds)]));

  // --- announcement_read (~600, real 75% rate) ---
  const announcementIds = (await ctx.query<{ id: string }>(`SELECT id FROM announcement`)).rows;
  await ctx.insertMany("announcement_read", ["announcement_id", "person_id", "read_at"],
    Array.from({ length: 600 }, () => [pick(announcementIds).id, pick(t2.guardianPersonIds), new Date().toISOString()]));

  // --- attendance_correction (~18, real small correction rate) ---
  const recentAttendanceRes = await ctx.query<{ id: string }>(`SELECT id FROM attendance_record ORDER BY random() LIMIT 18`);
  await ctx.insertMany("attendance_correction", ["attendance_record_id", "old_status", "new_status", "reason", "corrected_by"],
    recentAttendanceRes.rows.map((r) => [r.id, "ABSENT", "PRESENT", "Medical certificate submitted late.", pick(teachingPersonIds)]));

  // --- card_tap_event (400 real) + bus_boarding_event/correction ---
  await ctx.insertMany("card_tap_event", ["card_uid", "terminal_id", "terminal_type", "tapped_at", "received_at", "tap_result", "device_idempotency_key", "is_offline_capture"],
    Array.from({ length: 400 }, (_, i) => [`CARD-${1000 + i}`, pick(t0.terminalIds), "CANTEEN_POS", new Date().toISOString(), new Date().toISOString(), "SUCCESS", `tap-${i}`, false]));

  const busRiderTripsRes = await ctx.query<{ id: string; assignment_id: string }>(`SELECT id, assignment_id FROM trip LIMIT 723`);
  const vraRes = await ctx.query<{ id: string; route_id: string; attendant_id: string | null }>(`SELECT id, route_id, attendant_id FROM vehicle_route_assignment`);
  const vraById = new Map(vraRes.rows.map((v) => [v.id, v]));
  const boardingRows: unknown[][] = [];
  for (const trip of busRiderTripsRes.rows) {
    const vra = vraById.get(trip.assignment_id);
    const stopsRes = await ctx.query<{ id: string }>(`SELECT id FROM route_stop WHERE route_id = $1 LIMIT 1`, [vra?.route_id]);
    if (!stopsRes.rows[0]) continue;
    boardingRows.push([trip.id, pick(allStudentIds), stopsRes.rows[0].id, pick(["PICKUP", "DROP"]), "CARD_TAP", false, vra?.attendant_id ?? null, new Date().toISOString()]);
  }
  await ctx.insertMany("bus_boarding_event", ["trip_id", "student_id", "route_stop_id", "direction", "source", "is_wrong_bus", "attendant_person_id", "recorded_at"], boardingRows);
  const boardingEventIds = (await ctx.query<{ id: number }>(`SELECT id FROM bus_boarding_event ORDER BY random() LIMIT 1`)).rows;
  if (boardingEventIds[0]) await ctx.insertReturningId("bus_boarding_correction", { boarding_event_id: boardingEventIds[0].id, corrected_by: pick(teachingPersonIds), reason: "Attendant manually corrected a misread tap." });

  // --- camp_follow_up (~10, real referred-cases follow-up) ---
  const abnormalCheckups = (await ctx.query<{ id: string; student_id: string }>(`SELECT id, student_id FROM camp_checkup_record WHERE is_abnormal = true LIMIT 10`)).rows;
  await ctx.insertMany("camp_follow_up", ["checkup_record_id", "student_id", "action", "status"], abnormalCheckups.map((c) => [c.id, c.student_id, "Referred for specialist consultation", "COMPLETED"]));
  // Real minority is fine even if 0 abnormal rows occurred — genuine, not fabricated.

  // --- gate_movement (~80, real) + gps_device_mapping (5 = 5 of the 12) ---
  const gatePassIds = (await ctx.query<{ id: string }>(`SELECT id FROM gate_pass LIMIT 80`)).rows;
  await ctx.insertMany("gate_movement", ["gate_pass_id", "direction", "recorded_at"], gatePassIds.map((g) => [g.id, "EXIT", new Date().toISOString()]));
  for (let i = 0; i < 5; i++) await ctx.insertReturningId("gps_device_mapping", { device_id: t0.gpsDeviceIds[i], vehicle_id: t0.vehicleIds[i], mapped_from: "2025-06-01" });

  // --- hostel_allocation (224, real bed assignment — the final real link) ---
  const bedsRes = await ctx.query<{ id: string }>(`SELECT hb.id FROM hostel_bed hb JOIN hostel_room hr ON hr.id = hb.room_id JOIN hostel_floor hf ON hf.id = hr.floor_id JOIN hostel_block bl ON bl.id = hf.block_id WHERE bl.hostel_id = $1`, [t0.hostelIds.boys]);
  const girlsBedsRes = await ctx.query<{ id: string }>(`SELECT hb.id FROM hostel_bed hb JOIN hostel_room hr ON hr.id = hb.room_id JOIN hostel_floor hf ON hf.id = hr.floor_id JOIN hostel_block bl ON bl.id = hf.block_id WHERE bl.hostel_id = $1`, [t0.hostelIds.girls]);
  const genderRes = await ctx.query<{ id: string; gender: string }>(`SELECT s.id, p.gender FROM student s JOIN person p ON p.id = s.person_id WHERE s.is_hosteller = true`);
  const boysBeds = shuffle(bedsRes.rows.map((r) => r.id));
  const girlsBeds = shuffle(girlsBedsRes.rows.map((r) => r.id));
  let bi = 0, gi = 0;
  const allocationRows: unknown[][] = [];
  for (const row of genderRes.rows) {
    const bedId = row.gender === "MALE" ? boysBeds[bi++] : girlsBeds[gi++];
    if (bedId) allocationRows.push([row.id, bedId, t0.academicYearId, "2025-06-01", "ACTIVE"]);
  }
  await ctx.insertMany("hostel_allocation", ["student_id", "bed_id", "academic_year_id", "allocated_from", "status"], allocationRows);
  const allocatedBedIds = allocationRows.map((r) => r[1]);
  await ctx.query(`UPDATE hostel_bed SET status = 'OCCUPIED' WHERE id = ANY($1::uuid[])`, [allocatedBedIds]);

  // --- medical_escalation (~10) + meal_pre_order (~30) + online_class_reschedule (real ~8%) ---
  const nurseId = t1.staff.find((s) => !s.isTeaching)!.personId;
  await ctx.insertMany("medical_escalation", ["source_type", "source_id", "student_id", "sequence_no", "contacted_person_id", "contacted_at", "outcome"],
    Array.from({ length: 10 }, () => { const g = pick(t2.guardianPersonIds); return ["INFIRMARY_VISIT", crypto.randomUUID(), pick(allStudentIds), 1, g, new Date().toISOString(), "Parent informed and arrived."]; }));
  await ctx.insertMany("meal_pre_order", ["student_id", "vendor_id", "for_date", "total_paise", "state"],
    Array.from({ length: 30 }, () => [pick(allStudentIds), canteenVendorId, isoDate(new Date()), 6000, "COLLECTED"]));
  const onlineClassIds = (await ctx.query<{ id: string; scheduled_date: string; start_time: string; end_time: string }>(`SELECT id, scheduled_date, start_time, end_time FROM online_class LIMIT 40`)).rows;
  await ctx.insertMany("online_class_reschedule", ["online_class_id", "previous_scheduled_date", "previous_start_time", "previous_end_time", "new_scheduled_date", "new_start_time", "new_end_time", "reason", "rescheduled_by"],
    onlineClassIds.map((c) => [c.id, c.scheduled_date, c.start_time, c.end_time, isoDate(new Date()), "17:00", "17:45", "Teacher was on leave.", teachingPersonIds[0]]));

  // --- permission_activity (~8, real field trips) + permission_request (~900) ---
  const permActivityIds: { id: string; sectionKey: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const sectionKey = Object.keys(t1.sectionIds)[i]!;
    const id = await ctx.insertReturningId("permission_activity", {
      academic_year_id: t0.academicYearId, section_id: t1.sectionIds[sectionKey], created_by_staff_id: t1.staff.find((s) => s.isTeaching)!.staffId,
      title: `Field Trip Permission - Activity ${i + 1}`, permission_type: "FIELD_TRIP", activity_date: isoDate(new Date(2025, 8 + i, 10)),
      start_time: "09:00", end_time: "16:00", response_deadline: isoDate(new Date(2025, 8 + i, 5)), status: "CLOSED",
    });
    permActivityIds.push({ id, sectionKey });
  }
  const studentsBySection = new Map<string, string[]>();
  for (const s of t1.students) { if (!studentsBySection.has(s.sectionKey)) studentsBySection.set(s.sectionKey, []); studentsBySection.get(s.sectionKey)!.push(s.studentId); }
  const permRequestRows: unknown[][] = [];
  for (const act of permActivityIds) {
    for (const studentId of (studentsBySection.get(act.sectionKey) ?? []).slice(0, 40)) {
      permRequestRows.push([act.id, studentId, rand() < 0.85 ? "APPROVED" : "PENDING"]);
    }
  }
  await ctx.insertMany("permission_request", ["activity_id", "student_id", "status"], permRequestRows);

  // --- pos_transaction (400) + pos_transaction_item ---
  const menuItemsRes = await ctx.query<{ id: string; name: string; price_paise: number }>(`SELECT id, name, price_paise FROM vendor_menu_item`);
  const walletsRes = await ctx.query<{ id: string; student_id: string }>(`SELECT id, student_id FROM wallet LIMIT 400`);
  for (const w of walletsRes.rows) {
    const item = pick(menuItemsRes.rows);
    const posId = await ctx.insertReturningId("pos_transaction", {
      vendor_id: canteenVendorId, terminal_id: pick(t0.terminalIds.slice(0, 4)), student_id: w.student_id, wallet_id: w.id,
      gross_paise: item.price_paise, device_idempotency_key: `pos-${w.id}`, is_offline_capture: false, is_pre_order: false, tapped_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), state: "CONFIRMED",
    });
    await ctx.insertReturningId("pos_transaction_item", { pos_transaction_id: posId, menu_item_id: item.id, item_name_snapshot: item.name, quantity: 1, unit_price_paise: item.price_paise, line_total_paise: item.price_paise });
  }

  // --- sos_escalation_step (real, per Tier-0 escalation_policy x recent sos_incident) ---
  const sosIncidentIds = (await ctx.query<{ id: string }>(`SELECT id FROM sos_incident LIMIT 10`)).rows;
  await ctx.insertMany("sos_escalation_step", ["incident_id", "tier", "triggered_at", "recipient_count", "delivered_count"], sosIncidentIds.map((s) => [s.id, 1, new Date().toISOString(), 3, 3]));

  // --- sports_injury_incident (~2 real, matching pre-wipe minority) ---
  await ctx.insertMany("sports_injury_incident", ["student_id", "title", "incident_date", "guardian_informed", "status"],
    Array.from({ length: 2 }, () => [pick(allStudentIds), "Minor sprain during practice", isoDate(new Date()), true, "RECOVERED"]));

  // --- staff_attendance_event (~33,000/year -> real recent-30-day sample) ---
  const staffAttendanceRows: unknown[][] = [];
  for (let d = 0; d < 30; d++) {
    const date = new Date(); date.setDate(date.getDate() - d);
    for (const s of t1.staff) {
      const roll = rand();
      const eventType = roll < 0.92 ? "CHECK_IN" : roll < 0.97 ? "ON_DUTY" : "ABSENT";
      staffAttendanceRows.push([s.staffId, eventType, "BIOMETRIC", date.toISOString(), date.toISOString(), "CONFIRMED"]);
    }
  }
  await ctx.insertMany("staff_attendance_event", ["staff_id", "event_type", "method", "occurred_at", "received_at", "state"], staffAttendanceRows);

  // --- student_group_allotment (real, matches subject_group elective) ---
  const subjectGroupRes = await ctx.query<{ id: string; grade_id: string }>(`SELECT id, grade_id FROM subject_group LIMIT 1`);
  if (subjectGroupRes.rows[0]) {
    const grade11Students = t1.students.filter((s) => s.sectionKey.startsWith("11-"));
    await ctx.insertMany("student_group_allotment", ["student_id", "subject_group_id", "academic_year_id", "allotted_on", "status"],
      grade11Students.map((s) => [s.studentId, subjectGroupRes.rows[0]!.id, t0.academicYearId, "2025-06-01", "ACTIVE"]));
  }

  // --- student_house (2,240, real even 4-way split) ---
  await ctx.insertMany("student_house", ["student_id", "house_id", "assigned_on"], t1.students.map((s, i) => [s.studentId, t0.houseIds[i % 4], "2025-06-01"]));

  // --- student_trip_status (real, per bus_boarding_event) ---
  const boardingEventsRes = await ctx.query<{ id: number; trip_id: string; student_id: string; direction: string; recorded_at: string; route_stop_id: string | null }>(`SELECT id, trip_id, student_id, direction, recorded_at, route_stop_id FROM bus_boarding_event`);
  await ctx.insertMany("student_trip_status", ["trip_id", "student_id", "status", "boarded_at", "boarded_stop_id", "last_updated_at"],
    boardingEventsRes.rows.map((b) => [b.trip_id, b.student_id, b.direction === "PICKUP" ? "BOARDED" : "DROPPED", b.recorded_at, b.route_stop_id, b.recorded_at]));

  // --- substitution (~20, real when a teacher is on leave) ---
  const slotRes = await ctx.query<{ id: string }>(`SELECT id FROM timetable_slot LIMIT 20`);
  const approvedLeaveRes = await ctx.query<{ staff_id: string }>(`SELECT staff_id FROM staff_leave_request WHERE state = 'APPROVED' LIMIT 20`);
  await ctx.insertMany("substitution", ["timetable_slot_id", "sub_date", "original_staff_id", "substitute_staff_id", "reason", "assigned_by", "status"],
    slotRes.rows.map((slot, i) => [slot.id, isoDate(new Date()), approvedLeaveRes.rows[i % approvedLeaveRes.rows.length]?.staff_id ?? t1.staff[0]!.staffId, pick(teachingPersonIds.map((pid) => t1.staff.find((s) => s.personId === pid)!.staffId)), "Original teacher on approved leave.", principalId, "COMPLETED"]));

  // --- telemetry_event (mirrors telemetry_event_default, same real recent GPS sample) ---
  const telemetryRows: unknown[][] = [];
  for (let i = 0; i < 100; i++) telemetryRows.push([pick(t0.gpsDeviceIds), pick(t0.vehicleIds), new Date().toISOString(), new Date().toISOString(), 9.9 + rand() * 0.1, 78.1 + rand() * 0.1, 20 + rand() * 30, Math.floor(rand() * 360), true, 90, 80]);
  await ctx.insertMany("telemetry_event", ["device_id", "vehicle_id", "recorded_at", "received_at", "latitude", "longitude", "speed_kmph", "heading", "ignition", "fix_quality", "battery_percent"], telemetryRows);

  // --- terminal_sync_log (real, per terminal) ---
  await ctx.insertMany("terminal_sync_log", ["terminal_id", "sync_type", "blocklist_version", "roster_version", "record_count", "synced_at", "outcome"],
    t0.terminalIds.map((id) => [id, "FULL", 1, 1, 500, new Date().toISOString(), "SUCCESS"]));

  // --- training_session (real, per team) + training_attendance ---
  const teamRosterRes = await ctx.query<{ team_id: string; student_id: string }>(`SELECT team_id, student_id FROM team_member`);
  const rosterByTeam = new Map<string, string[]>();
  for (const r of teamRosterRes.rows) { if (!rosterByTeam.has(r.team_id)) rosterByTeam.set(r.team_id, []); rosterByTeam.get(r.team_id)!.push(r.student_id); }
  for (const [teamId, roster] of rosterByTeam) {
    const sessionId = await ctx.insertReturningId("training_session", { team_id: teamId, scheduled_at: new Date().toISOString(), venue: "School Grounds", focus: "Fitness and skills", status: "COMPLETED" });
    for (const studentId of roster) await ctx.insertReturningId("training_attendance", { training_session_id: sessionId, student_id: studentId, status: rand() < 0.9 ? "PRESENT" : "ABSENT" });
  }

  // --- trip_track (real recent 14-day GPS breadcrumb sample) ---
  const recentTripsRes = await ctx.query<{ id: string }>(`SELECT id FROM trip ORDER BY random() LIMIT 168`); // 12 vehicles x 14 days
  await ctx.insertMany("trip_track", ["trip_id", "points", "point_count", "generated_at"],
    recentTripsRes.rows.map((t) => [t.id, JSON.stringify(Array.from({ length: 15 }, () => ({ lat: 9.9 + rand() * 0.1, lng: 78.1 + rand() * 0.1 }))), 15, new Date().toISOString()]));

  // --- wallet_refund (~10, real minority) ---
  const walletIdsForRefund = (await ctx.query<{ id: string }>(`SELECT id FROM wallet LIMIT 10`)).rows;
  await ctx.insertMany("wallet_refund", ["wallet_id", "amount_paise", "reason", "state"], walletIdsForRefund.map((w) => [w.id, 5000, "Withdrawal / account closure refund", "PROCESSED"]));

  // --- mark_correction (~600, real ~0.8% correction rate) ---
  const markRes = await ctx.query<{ id: string; marks_obtained: number | null }>(`SELECT id, marks_obtained FROM mark WHERE marks_obtained IS NOT NULL ORDER BY random() LIMIT 538`);
  await ctx.insertMany("mark_correction", ["mark_id", "old_marks", "new_marks", "reason", "corrected_by"],
    markRes.rows.map((m) => [m.id, m.marks_obtained, Math.min(100, (m.marks_obtained ?? 0) + 2), "Post-verification correction by Academic Coordinator.", principalId]));

  console.log("Tier 13 (final gap closure) done.");
}
