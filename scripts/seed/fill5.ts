// Assigns the bus riders that have no transport allocation to routes with free seats (cap 60/direction), then their boarding history.
import { withSeedTransaction } from "./lib/db";
async function main() {
  await withSeedTransaction(true, async (ctx) => {
    const missing = (await ctx.query<{ id: string }>(`SELECT s.id FROM student s WHERE s.uses_school_transport AND NOT EXISTS (SELECT 1 FROM student_transport_allocation a WHERE a.student_id = s.id) ORDER BY s.admission_no`)).rows.map((r) => r.id);
    const ay = (await ctx.query<{ id: string }>(`SELECT id FROM academic_year LIMIT 1`)).rows[0]!.id;
    const load = async () => (await ctx.query<{ route_id: string; direction: string; n: string }>(`SELECT rs.route_id, a.direction, count(*) n FROM student_transport_allocation a JOIN route_stop rs ON rs.id = a.route_stop_id WHERE a.status='ACTIVE' GROUP BY 1,2`)).rows;
    const routes = (await ctx.query<{ id: string }>(`SELECT id FROM route ORDER BY id`)).rows.map((r) => r.id);
    let done = 0;
    for (const sid of missing) {
      const l = await load();
      const n = (r: string, d: string) => Number(l.find((x) => x.route_id === r && x.direction === d)?.n ?? 0);
      const best = routes.filter((r) => n(r, "PICKUP") < 60).sort((a, b) => n(a, "PICKUP") - n(b, "PICKUP"))[0];
      if (!best) continue;
      const stops = (await ctx.query<{ id: string }>(`SELECT id FROM route_stop WHERE route_id=$1 ORDER BY sequence_no`, [best])).rows;
      const stop = stops[done % stops.length]!.id;
      await ctx.query(`INSERT INTO student_transport_allocation (student_id, route_stop_id, academic_year_id, direction, fee_slab, valid_from, status) VALUES ($1,$2,$3,'PICKUP','STANDARD','2025-06-01','ACTIVE')`, [sid, stop, ay]);
      if (n(best, "DROP") < 60) await ctx.query(`INSERT INTO student_transport_allocation (student_id, route_stop_id, academic_year_id, direction, fee_slab, valid_from, status) VALUES ($1,$2,$3,'DROP','STANDARD','2025-06-01','ACTIVE')`, [sid, stop, ay]);
      done++;
    }
    console.log(`allocated ${done} of ${missing.length} riders`);
    const ids = `(SELECT s.id FROM student s WHERE s.uses_school_transport AND NOT EXISTS (SELECT 1 FROM bus_boarding_event b WHERE b.student_id = s.id))`;
    const r1: any = await ctx.query(`INSERT INTO bus_boarding_event (trip_id, student_id, route_stop_id, direction, source, is_wrong_bus, attendant_person_id, recorded_at)
      SELECT tr.id, sta.student_id, sta.route_stop_id, 'BOARD', 'CARD_TAP', false, att.person_id, tr.started_at + ((abs(hashtext(sta.student_id::text)) % 40) * interval '1 minute')
        FROM trip tr JOIN vehicle_route_assignment vra ON vra.id = tr.assignment_id JOIN route_stop rs ON rs.route_id = vra.route_id
        JOIN student_transport_allocation sta ON sta.route_stop_id = rs.id AND sta.status='ACTIVE' AND sta.direction IN (tr.direction,'BOTH')
        LEFT JOIN attendant att ON att.id = vra.attendant_id
       WHERE sta.student_id IN ${ids} AND abs(hashtext(sta.student_id::text || tr.id::text)) % 100 < 93`);
    const r2: any = await ctx.query(`INSERT INTO bus_boarding_event (trip_id, student_id, route_stop_id, direction, source, is_wrong_bus, attendant_person_id, recorded_at)
      SELECT b.trip_id, b.student_id, b.route_stop_id, 'ALIGHT', 'CARD_TAP', false, b.attendant_person_id, tr.completed_at - ((abs(hashtext(b.student_id::text)) % 5) * interval '1 minute')
        FROM bus_boarding_event b JOIN trip tr ON tr.id = b.trip_id WHERE b.direction='BOARD' AND NOT EXISTS (SELECT 1 FROM bus_boarding_event a WHERE a.trip_id=b.trip_id AND a.student_id=b.student_id AND a.direction='ALIGHT')`);
    const r3: any = await ctx.query(`INSERT INTO student_trip_status (trip_id, student_id, status, boarded_at, dropped_at, boarded_stop_id, dropped_stop_id, parent_notified_at, last_updated_at)
      SELECT b.trip_id, b.student_id, CASE WHEN tr.direction='PICKUP' THEN 'BOARDED' ELSE 'DROPPED' END, b.recorded_at, a.recorded_at, b.route_stop_id, a.route_stop_id, a.recorded_at, a.recorded_at
        FROM bus_boarding_event b JOIN bus_boarding_event a ON a.trip_id=b.trip_id AND a.student_id=b.student_id AND a.direction='ALIGHT' JOIN trip tr ON tr.id=b.trip_id
       WHERE b.direction='BOARD' AND NOT EXISTS (SELECT 1 FROM student_trip_status s WHERE s.trip_id=b.trip_id AND s.student_id=b.student_id)`);
    console.log(`boarding: ${r1?.rowCount} board, ${r2?.rowCount} alight, ${r3?.rowCount} trip-status rows`);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
