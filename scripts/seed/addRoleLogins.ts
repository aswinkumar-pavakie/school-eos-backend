// Adds dedicated (non-shared) logins for roles that previously had none of their own. Additive only.
import { withSeedTransaction } from "./lib/db";
import { roleEmail, createLoginAndCredential } from "./lib/identity";

const ADMIN_PERSON = `(SELECT person_id FROM role_assignment WHERE role_code='ADMIN' AND status='ACTIVE' ORDER BY person_id LIMIT 1)`;

const NEW: { role: string; word: string; designation: string; first: string; last: string; gender: "MALE" | "FEMALE" }[] = [
  { role: "SPORTS_ADMIN", word: "sportsadmin", designation: "Sports Administrator", first: "Vignesh", last: "Sundaram", gender: "MALE" },
  { role: "SPORTS_ADMIN", word: "sportsadmin", designation: "Sports Administrator", first: "Kavitha", last: "Rajendran", gender: "FEMALE" },
  { role: "SPORTS_FACULTY", word: "sportsfaculty", designation: "Physical Education Teacher", first: "Manikandan", last: "Pillai", gender: "MALE" },
  { role: "SPORTS_FACULTY", word: "sportsfaculty", designation: "Physical Education Teacher", first: "Saranya", last: "Devi", gender: "FEMALE" },
  { role: "SPORTS_FACULTY", word: "sportsfaculty", designation: "Physical Education Teacher", first: "Ganesan", last: "Murugesan", gender: "MALE" },
  { role: "COMMUNITY_INCHARGE", word: "communityincharge", designation: "Community Coordinator", first: "Meenakshi", last: "Iyer", gender: "FEMALE" },
];

async function main() {
  await withSeedTransaction(true, async (ctx) => {
    const ay = (await ctx.query<{ id: string }>(`SELECT id FROM academic_year LIMIT 1`)).rows[0]!.id;
    const campus = (await ctx.query<{ id: string }>(`SELECT id FROM campus LIMIT 1`)).rows[0]!.id;
    const dept = (await ctx.query<{ id: string }>(`SELECT id FROM department ORDER BY id LIMIT 1`)).rows[0]!.id;
    const admin = (await ctx.query<{ p: string }>(`SELECT ${ADMIN_PERSON} p`)).rows[0]!.p;
    let empNo = Number((await ctx.query<{ m: string }>(`SELECT max(substring(employee_no from '[0-9]+$')::int) m FROM staff WHERE employee_no LIKE 'EMP%'`)).rows[0]!.m);
    let n = 0;
    for (const s of NEW) {
      n++;
      const email = roleEmail(s.word, `${s.first} ${s.last}`);
      const personId = await ctx.insertReturningId("person", {
        first_name: s.first, last_name: s.last, date_of_birth: `${1980 + (n * 3) % 12}-0${1 + (n % 9)}-1${n % 10}`, gender: s.gender,
        mobile: `98${String(40000000 + n * 1373).padStart(8, "0")}`, email, preferred_locale: "en-IN", status: "ACTIVE",
        address_line1: `No. ${10 + n * 7}, Anna Nagar`, address_line2: "Anna Nagar", city: "Madurai", district: "Madurai", state: "Tamil Nadu", pincode: "625020",
        photo_object_key: `photos/person/${email}.jpg`, created_by: admin, updated_by: admin,
      });
      await ctx.insertReturningId("staff", {
        person_id: personId, employee_no: `EMP${++empNo}`, designation: s.designation, is_teaching: false, date_of_joining: "2020-06-01", status: "ACTIVE",
        experience_years: 8, department_id: dept, campus_id: campus, blood_group: "O+", employment_type: "PERMANENT",
        highest_qualification: "Bachelor's Degree", specialization: s.designation, tet_net_cleared: false, is_hosteller: false, uses_school_transport: false,
        teacher_category: "NON_TEACHING", post_type: "MANAGEMENT", staff_room: "Staff Room B", university: "Madurai Kamaraj University", year_of_graduation: 2010 + (n % 8),
        areas_of_expertise: s.designation, certifications: "Role-specific certification programmes", workshops_training: "NEP 2020 orientation",
        achievements_awards: "Recognised for consistent contribution", emergency_contact_name: "Family member", emergency_contact_phone: `97${String(50000000 + n * 911).padStart(8, "0")}`,
        created_by: admin, updated_by: admin,
      });
      await createLoginAndCredential(ctx, personId, email);
      await ctx.insertReturningId("role_assignment", { person_id: personId, role_code: s.role, scope_type: "SCHOOL", academic_year_id: ay, valid_from: "2025-06-01", status: "ACTIVE", assigned_by: admin });
      console.log(`${s.role}: ${email}`);
    }
    await ctx.checkpoint();
    // sports admin now has its own accounts: release the role from the principal / vice principal
    const r: any = await ctx.query(
      `UPDATE role_assignment SET status='REVOKED', revoked_at=now(), revoked_by=${ADMIN_PERSON}
        WHERE role_code='SPORTS_ADMIN' AND status='ACTIVE' AND person_id IN (SELECT person_id FROM role_assignment WHERE role_code IN ('PRINCIPAL','VICE_PRINCIPAL') AND status='ACTIVE')`);
    console.log(`SPORTS_ADMIN removed from principal/vice principal: ${r?.rowCount} role rows`);
  });
}
main().catch((e) => { console.error("ADD LOGINS FAILED:", e); process.exit(1); });
