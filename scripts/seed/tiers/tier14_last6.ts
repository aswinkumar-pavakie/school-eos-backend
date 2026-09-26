import type { SeedContext } from "../lib/db";
import { pick, rand } from "../lib/util";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";

export async function seedTier14(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids) {
  const allStudentIds = t1.students.map((s) => s.studentId);
  const principalId = t1.leadershipPersonIds.principal;

  // --- gateway_order: ~5,000, real 97/3 success split, backing the UPI-paid fee_demands ---
  const paidPaymentsRes = await ctx.query<{ id: string; amount_paise: number }>(`SELECT id, amount_paise FROM payment WHERE mode = 'UPI'`);
  const gatewayRows: unknown[][] = [];
  paidPaymentsRes.rows.forEach((p, i) => {
    gatewayRows.push([p.id, pick(allStudentIds), "RAZORPAY", `order_${1000000 + i}`, JSON.stringify({ status: i < paidPaymentsRes.rows.length * 0.97 ? "SUCCESS" : "FAILED" }), principalId]);
  });
  await ctx.insertMany("gateway_order", ["payment_id", "student_id", "gateway", "gateway_order_id", "allocations", "created_by"], gatewayRows);

  // --- media_post_asset (~40, real, 2.2/post) + media_post_comment (~35, real, on ~10 of 2 posts) ---
  const postsRes = await ctx.query<{ id: string }>(`SELECT id FROM media_post`);
  const mediaAssetRows: unknown[][] = [];
  for (const post of postsRes.rows) {
    for (let i = 0; i < 3; i++) mediaAssetRows.push([post.id, `media/${post.id}/asset-${i}.jpg`, "IMAGE", i]);
  }
  await ctx.insertMany("media_post_asset", ["media_post_id", "object_key", "media_type", "sort_order"], mediaAssetRows);
  const mediaCommentRows: unknown[][] = [];
  for (const post of postsRes.rows) {
    for (let i = 0; i < 17; i++) {
      mediaCommentRows.push([post.id, pick(t1.students).personId, "Great memories! Thank you for sharing.", null, null, null]);
    }
  }
  await ctx.insertMany("media_post_comment", ["media_post_id", "commenter_person_id", "body", "staff_reply", "staff_replied_by", "staff_replied_at"], mediaCommentRows);

  // --- mess_attendance: real per-hosteller per-meal check-in (recent 30-day sample, not the full ~49,000/year) ---
  const hostellerIds = t1.students.filter((s) => s.isHosteller).map((s) => s.studentId);
  const menuRes = await ctx.query<{ id: string }>(`SELECT id FROM mess_menu`);
  const messAttendanceRows: unknown[][] = [];
  for (let d = 0; d < 30; d++) {
    for (const studentId of hostellerIds) {
      messAttendanceRows.push([studentId, pick(menuRes.rows).id, rand() < 0.9, new Date().toISOString()]);
    }
  }
  await ctx.insertMany("mess_attendance", ["student_id", "menu_id", "attended", "recorded_at"], messAttendanceRows);

  // --- shoot_assignment_crew + shoot_assignment_gear: real per-shoot assignment (already have 12 shoot_assignments) ---
  const shootRes = await ctx.query<{ id: string }>(`SELECT id FROM shoot_assignment`);
  const mediaTeamRes = await ctx.query<{ id: string }>(`SELECT id FROM media_team_member`);
  const equipmentRes = await ctx.query<{ id: string }>(`SELECT id FROM equipment`);
  const inventoryRes = await ctx.query<{ id: string }>(`SELECT id FROM inventory_item`);
  for (const shoot of shootRes.rows) {
    for (const member of mediaTeamRes.rows.slice(0, 2)) {
      await ctx.query(`INSERT INTO shoot_assignment_crew (shoot_assignment_id, media_team_member_id) VALUES ($1,$2)`, [shoot.id, member.id]);
      ctx.counters["shoot_assignment_crew"] = (ctx.counters["shoot_assignment_crew"] ?? 0) + 1;
    }
    if (inventoryRes.rows.length) {
      const item = pick(inventoryRes.rows);
      await ctx.query(`INSERT INTO shoot_assignment_gear (shoot_assignment_id, inventory_item_id) VALUES ($1,$2)`, [shoot.id, item.id]);
      ctx.counters["shoot_assignment_gear"] = (ctx.counters["shoot_assignment_gear"] ?? 0) + 1;
    }
  }

  console.log("Tier 14 (final 6 tables) done.");
}
