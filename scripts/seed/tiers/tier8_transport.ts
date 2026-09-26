import type { SeedContext } from "../lib/db";
import { pick, rand, isoDate } from "../lib/util";
import { MALE_FIRST_NAMES, NEUTRAL_SURNAMES } from "../data/names";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";
import { roleEmail, createLoginAndCredential } from "../lib/identity";

export async function seedTier8Transport(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids) {
  // --- coach: 8, real, NOT linked to person (no login — see PLAN.md) ---
  const coachIds: string[] = [];
  for (const name of ["Cricket", "Kabaddi", "Football", "Volleyball", "Kho-Kho", "Athletics", "Silambam", "Chess"]) {
    coachIds.push(await ctx.insertReturningId("coach", {
      full_name: `Coach ${pick(NEUTRAL_SURNAMES)}`, is_external: true, contact_phone: `9${Math.floor(rand() * 900000000 + 100000000)}`,
      qualification: `Certified ${name} Coach`, status: "ACTIVE",
    }));
  }

  // --- driver: 12, real person each ---
  const driverIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const firstName = pick(MALE_FIRST_NAMES); const lastName = pick(NEUTRAL_SURNAMES);
    const driverEmail = roleEmail("driver", `${firstName}${lastName}`);
    const personId = await ctx.insertReturningId("person", {
      first_name: firstName, last_name: lastName, gender: "MALE",
      mobile: `9${Math.floor(rand() * 900000000 + 100000000)}`, email: driverEmail, status: "ACTIVE",
    });
    await createLoginAndCredential(ctx, personId, driverEmail);
    await ctx.insertReturningId("role_assignment", { person_id: personId, role_code: "DRIVER", scope_type: "SCHOOL", academic_year_id: t0.academicYearId, valid_from: "2025-06-01", status: "ACTIVE" });
    driverIds.push(await ctx.insertReturningId("driver", {
      person_id: personId, full_name: `${firstName} ${lastName}`, phone: `9${Math.floor(rand() * 900000000 + 100000000)}`,
      licence_no: `TN${10 + i}${20200000 + i}`, licence_expiry: i < 1 ? "2027-01-15" : "2027-06-30",
      experience_years: 5 + Math.floor(rand() * 15), status: "ACTIVE",
    }));
  }

  // --- attendant: 6, real person each (gate/POS) ---
  const attendantIds: string[] = [];
  for (let i = 0; i < 6; i++) {
    const firstName = pick(MALE_FIRST_NAMES); const lastName = pick(NEUTRAL_SURNAMES);
    const personId = await ctx.insertReturningId("person", {
      first_name: firstName, last_name: lastName, gender: "MALE",
      mobile: `9${Math.floor(rand() * 900000000 + 100000000)}`, email: roleEmail("attendant", `${firstName}${lastName}`), status: "ACTIVE",
    });
    attendantIds.push(await ctx.insertReturningId("attendant", {
      person_id: personId, full_name: `${firstName} ${lastName}`, phone: `9${Math.floor(rand() * 900000000 + 100000000)}`, status: "ACTIVE",
    }));
  }

  // --- Correspondent (1) + Canteen Vendor reps (3): real separate persons with logins + roles ---
  for (const [roleWord, roleCode, count] of [["correspondent", "CORRESPONDENT", 1], ["canteenvendor", "CANTEEN_VENDOR", 3]] as const) {
    for (let i = 0; i < count; i++) {
      const firstName = pick(MALE_FIRST_NAMES); const lastName = pick(NEUTRAL_SURNAMES);
      const email = roleEmail(roleWord, `${firstName}${lastName}`);
      const personId = await ctx.insertReturningId("person", {
        first_name: firstName, last_name: lastName, gender: "MALE",
        mobile: `9${Math.floor(rand() * 900000000 + 100000000)}`, email, status: "ACTIVE",
      });
      await createLoginAndCredential(ctx, personId, email);
      await ctx.insertReturningId("role_assignment", { person_id: personId, role_code: roleCode, scope_type: "SCHOOL", academic_year_id: t0.academicYearId, valid_from: "2025-06-01", status: "ACTIVE" });
    }
  }

  // --- vehicle_document (24) + driver_document (24): real 3 expiring / 2 overdue across the 48 ---
  const complianceRows: { table: string; entityId: string; docType: string; dayOffset: number }[] = [];
  for (let i = 0; i < t0.vehicleIds.length; i++) {
    complianceRows.push({ table: "vehicle_document", entityId: t0.vehicleIds[i]!, docType: "FITNESS", dayOffset: 400 });
    complianceRows.push({ table: "vehicle_document", entityId: t0.vehicleIds[i]!, docType: "INSURANCE", dayOffset: 400 });
  }
  for (const driverId of driverIds) {
    complianceRows.push({ table: "driver_document", entityId: driverId, docType: "LICENCE", dayOffset: 400 });
    complianceRows.push({ table: "driver_document", entityId: driverId, docType: "MEDICAL_CERTIFICATE", dayOffset: 400 });
  }
  // real 3 expiring (<30d) / 2 overdue (already past) / rest valid — matches
  // the live-observed complianceExpiringCount:3 / complianceOverdueCount:2.
  complianceRows[0]!.dayOffset = 15; complianceRows[1]!.dayOffset = 22; complianceRows[2]!.dayOffset = 28;
  complianceRows[3]!.dayOffset = -10; complianceRows[4]!.dayOffset = -3;
  const today = new Date();
  for (const row of complianceRows) {
    const validTo = new Date(today.getTime() + row.dayOffset * 86400000);
    await ctx.insertReturningId(row.table, {
      [row.table === "vehicle_document" ? "vehicle_id" : "driver_id"]: row.entityId,
      doc_type: row.docType, doc_no: `${row.docType}-${Math.floor(rand() * 900000 + 100000)}`,
      valid_from: isoDate(new Date(today.getFullYear() - 1, 0, 1)), valid_to: isoDate(validTo),
    });
  }

  // --- vehicle_maintenance (24) + vehicle_fuel_log (528) ---
  for (const vehicleId of t0.vehicleIds) {
    for (let i = 0; i < 2; i++) {
      await ctx.insertReturningId("vehicle_maintenance", {
        vehicle_id: vehicleId, maintenance_type: pick(["SERVICE", "TYRE", "REPAIR"]),
        performed_on: isoDate(new Date(2025, 6 + i * 5, 10)), odometer_km: 40000 + i * 5000, cost_paise: 800000 + Math.floor(rand() * 500000),
      });
    }
  }
  const fuelRows: unknown[][] = [];
  for (const vehicleId of t0.vehicleIds) {
    let odometer = 40000;
    for (let week = 0; week < 44; week++) {
      odometer += 300 + Math.floor(rand() * 100);
      fuelRows.push([vehicleId, isoDate(new Date(2025, 5, 7 + week * 7)), 40 + Math.floor(rand() * 20), 400000 + Math.floor(rand() * 100000), odometer]);
    }
  }
  await ctx.insertMany("vehicle_fuel_log", ["vehicle_id", "filled_on", "litres", "cost_paise", "odometer_km"], fuelRows);

  // --- vehicle_route_assignment (12) ---
  for (let i = 0; i < t0.vehicleIds.length; i++) {
    await ctx.insertReturningId("vehicle_route_assignment", {
      vehicle_id: t0.vehicleIds[i], route_id: t0.routeIds[i], driver_id: driverIds[i],
      attendant_id: attendantIds[i % attendantIds.length], effective_from: "2025-06-01",
    });
  }

  // --- route_stop (~60, 5/route) ---
  const routeStopIds: string[] = [];
  const routeStopByRoute: Record<string, string[]> = {};
  for (const routeId of t0.routeIds) {
    routeStopByRoute[routeId] = [];
    for (let s = 0; s < 5; s++) {
      const id = await ctx.insertReturningId("route_stop", {
        route_id: routeId, stop_name: `Stop ${s + 1}`, sequence_no: s + 1,
        scheduled_time: `0${7 + Math.floor(s / 2)}:${s % 2 === 0 ? "00" : "30"}`, geofence_radius_m: 100,
      });
      routeStopIds.push(id);
      routeStopByRoute[routeId]!.push(id);
    }
  }

  // --- student_transport_allocation: 672 real bus riders, 95% both directions ---
  const busRiders = t1.students.filter((s) => s.usesTransport);
  const allStops = Object.values(routeStopByRoute).flat();
  const allocationRows: unknown[][] = [];
  busRiders.forEach((s, i) => {
    const stop = pick(allStops);
    const bothDirections = i < busRiders.length * 0.95;
    allocationRows.push([s.studentId, stop, t0.academicYearId, "PICKUP", "STANDARD", "2025-06-01", "ACTIVE"]);
    if (bothDirections) allocationRows.push([s.studentId, stop, t0.academicYearId, "DROP", "STANDARD", "2025-06-01", "ACTIVE"]);
  });
  await ctx.insertMany("student_transport_allocation", ["student_id", "route_stop_id", "academic_year_id", "direction", "fee_slab", "valid_from", "status"], allocationRows);

  // --- vehicle_route_assignment already has ids; trip: 12 vehicles x 2/day x ~220 days (capped to a real recent 30-day sample for volume sanity) ---
  const assignmentRes = await ctx.query<{ id: string }>(`SELECT id FROM vehicle_route_assignment`);
  const tripRows: unknown[][] = [];
  const recentDays = 30;
  for (const assignment of assignmentRes.rows) {
    for (let d = 0; d < recentDays; d++) {
      const date = new Date(); date.setDate(date.getDate() - d);
      for (const direction of ["PICKUP", "DROP"]) {
        tripRows.push([assignment.id, isoDate(date), direction, "COMPLETED", 12 + Math.floor(rand() * 8)]);
      }
    }
  }
  await ctx.insertMany("trip", ["assignment_id", "trip_date", "direction", "state", "distance_km"], tripRows);

  console.log(`Tier 8 (transport) done. Trips (recent ${recentDays}-day sample): ${tripRows.length}`);
  return { coachIds, driverIds, attendantIds, routeStopByRoute };
}
