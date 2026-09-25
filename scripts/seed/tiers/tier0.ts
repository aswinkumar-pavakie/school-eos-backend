import type { SeedContext } from "../lib/db";
import { pick, pickWeighted, rand, exactSplit } from "../lib/util";
import { DEPARTMENTS, LIBRARY_CATEGORIES, INVENTORY_CATEGORIES, VENDORS, SPORTS, HOUSES, EXPENSE_CATEGORIES } from "../data/org";
import { GRADES } from "../data/academics";

export interface Tier0Ids {
  schoolId: number;
  academicYearId: string;
  departmentIds: Record<string, string>;
  gradeIds: Record<string, string>;
  mediumIds: { english: string; tamil: string };
  subjectIds: Record<string, string>;
  libraryCategoryIds: Record<string, string>;
  inventoryCategoryIds: Record<string, string>;
  vendorIds: Record<string, string>;
  houseIds: string[];
  sportIds: Record<string, string>;
  expenseCategoryIds: Record<string, string>;
  campusId: string;
  feeHeadIds: Record<string, string>;
  gradeScaleId: string;
  hostelIds: { boys: string; girls: string };
  timetablePeriodIds: string[];
  vehicleIds: string[];
  routeIds: string[];
  gpsDeviceIds: string[];
  terminalIds: string[];
  equipmentIds: string[];
}

// Real 18-role catalogue (see PLAN.md §2). is_core_login true for every real
// base-login role, false for the 5 pure assignment-layer labels.
const ROLES: { code: string; name: string; core: boolean }[] = [
  { code: "PRINCIPAL", name: "Principal", core: true },
  { code: "VICE_PRINCIPAL", name: "Vice Principal", core: true },
  { code: "CORRESPONDENT", name: "Correspondent", core: true },
  { code: "FINANCE", name: "Finance", core: true },
  { code: "ADMIN", name: "Admin", core: true },
  { code: "FACULTY", name: "Faculty", core: true },
  { code: "ACADEMIC_COORDINATOR", name: "Academic Coordinator", core: false },
  { code: "CLASS_ADVISOR", name: "Class Advisor", core: false },
  { code: "COMMUNITY_INCHARGE", name: "Community Incharge", core: false },
  { code: "HEALTH_INCHARGE", name: "Health Incharge", core: false },
  { code: "SPORTS_FACULTY", name: "Sports Faculty", core: false },
  { code: "SPORTS_ADMIN", name: "Sports Admin", core: true },
  { code: "PARENT", name: "Parent", core: true },
  { code: "HOSTEL_WARDEN", name: "Hostel Warden", core: true },
  { code: "TRANSPORT_MANAGER", name: "Transport Manager", core: true },
  { code: "BUS_ATTENDANT", name: "Bus Attendant", core: true },
  { code: "CANTEEN_VENDOR", name: "Canteen Vendor", core: true },
  { code: "MEDIA_ROOM", name: "Media Room", core: true },
  { code: "LIBRARY", name: "Library", core: true },
  { code: "COMMUNITY", name: "Community", core: false },
  { code: "DRIVER", name: "Driver", core: true },
];

export async function seedTier0(ctx: SeedContext): Promise<Tier0Ids> {
  // `school.id` is a real singleton (CHECK id=1, DEFAULT 1) — after the full
  // wipe this table is empty, so a plain insert recreates the one real row.
  // school_type is a real, checked enum (GOVERNMENT/AIDED/PARTIALLY_AIDED/
  // PRIVATE_UNAIDED) — verified live; PRIVATE_UNAIDED is correct for this
  // school. Name/board/address match the real institution already on file
  // before the wipe ("Pavakie School", Madurai — real recognition_no and
  // state_school_code kept identical so nothing about the school's own real
  // identity changes, only its downstream data).
  await ctx.query(
    `INSERT INTO school (name, code, board, school_type, recognition_no, state_school_code, address_line1, address_line2, city, district, state, pincode, contact_phone, contact_email, timezone, default_locale, settings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      "Pavakie School", "SMS", "Tamil Nadu State Board of Matriculation Schools", "PRIVATE_UNAIDED",
      "TN/MAT/2003/00417", "33081900417", "14, Bypass Road", "Near Anna Nagar", "Madurai", "Madurai",
      "Tamil Nadu", "625020", "9843012345", "office@sms.in", "Asia/Kolkata", "en-IN", JSON.stringify({}),
    ],
  );
  ctx.counters["school"] = 1;
  const schoolId = 1;

  const academicYearId = await ctx.insertReturningId("academic_year", {
    name: "2025-2026", start_date: "2025-06-01", end_date: "2026-04-30",
    status: "ACTIVE", is_current: true, min_attendance_percent: 75,
  });

  const departmentIds: Record<string, string> = {};
  for (const name of DEPARTMENTS) {
    departmentIds[name] = await ctx.insertReturningId("department", {
      name, code: name.replace(/Senior Secondary - /, "SRSEC-").replace(/[^A-Za-z-]/g, "").toUpperCase().slice(0, 12), status: "ACTIVE",
    });
  }

  const gradeStage = (g: string) => (g === "LKG" || g === "UKG" ? "PRE_PRIMARY" : Number(g) <= 5 ? "PRIMARY" : Number(g) <= 8 ? "MIDDLE" : Number(g) <= 10 ? "SECONDARY" : "HIGHER_SECONDARY");
  const gradeIds: Record<string, string> = {};
  for (let i = 0; i < GRADES.length; i++) {
    const g = GRADES[i]!;
    gradeIds[g] = await ctx.insertReturningId("grade", {
      name: g, level_no: i - 2, stage: gradeStage(g), status: "ACTIVE",
    });
  }

  const mediumIds = {
    english: await ctx.insertReturningId("medium", { name: "English Medium", code: "ENG", status: "ACTIVE" }),
    tamil: await ctx.insertReturningId("medium", { name: "Tamil Medium", code: "TAM", status: "ACTIVE" }),
  };

  const ALL_SUBJECTS = [
    "Rhymes & Stories", "Numbers & Shapes", "Art & Craft", "Language Basics", "Physical Activity",
    "English", "Tamil", "Mathematics", "EVS", "Art Education", "Science", "Social Science",
    "Physics", "Chemistry", "Computer Science", "Accountancy", "Business Studies", "Economics",
    "History", "Political Science", "Psychology", "Informatics Practices",
    "Physical Education", "Club Activity",
  ];
  const subjectIds: Record<string, string> = {};
  for (const name of ALL_SUBJECTS) {
    subjectIds[name] = await ctx.insertReturningId("subject", {
      name, code: `${name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase()}${String(Object.keys(subjectIds).length + 1).padStart(2, "0")}`,
      subject_type: ["Physical Education", "Club Activity"].includes(name) ? "CO_SCHOLASTIC" : ["English", "Tamil"].includes(name) ? "LANGUAGE" : "CORE",
      status: "ACTIVE",
    });
  }

  const libraryCategoryIds: Record<string, string> = {};
  for (const name of LIBRARY_CATEGORIES) {
    libraryCategoryIds[name] = await ctx.insertReturningId("library_category", { name, status: "ACTIVE" });
  }

  const inventoryCategoryIds: Record<string, string> = {};
  for (const name of INVENTORY_CATEGORIES) {
    inventoryCategoryIds[name] = await ctx.insertReturningId("inventory_category", { name, status: "ACTIVE" });
  }

  const vendorIds: Record<string, string> = {};
  for (const v of VENDORS) {
    vendorIds[v.name] = await ctx.insertReturningId("vendor", {
      name: v.name, vendor_type: v.type, is_concessionaire: v.type === "CANTEEN",
      commission_percent: v.type === "CANTEEN" ? 8 : 0, settlement_cycle: "MONTHLY", status: "ACTIVE",
    });
  }

  const campusId = await ctx.insertReturningId("campus", {
    name: "Main Campus", code: "MAIN", address: "No. 45, Anna Salai, Coimbatore - 641002", is_primary: true, status: "ACTIVE",
  });

  const HOUSE_COLOURS: Record<string, string> = { Bharathiyar: "#D32F2F", Kamarajar: "#1976D2", Anna: "#388E3C", Periyar: "#F9A825" };
  const houseIds: string[] = [];
  for (const name of HOUSES) {
    houseIds.push(await ctx.insertReturningId("house", { name, colour_hex: HOUSE_COLOURS[name], status: "ACTIVE" }));
  }

  const SPORT_TYPES: Record<string, string> = {
    Cricket: "TEAM", Kabaddi: "TEAM", Football: "TEAM", Volleyball: "TEAM",
    "Kho-Kho": "TEAM", Athletics: "INDIVIDUAL", Silambam: "INDIVIDUAL", Chess: "INDIVIDUAL",
  };
  const sportIds: Record<string, string> = {};
  for (const name of SPORTS) {
    sportIds[name] = await ctx.insertReturningId("sport", {
      name, sport_type: SPORT_TYPES[name], result_type: SPORT_TYPES[name] === "TEAM" ? "POINTS" : "PLACEMENT",
      scoring_template: JSON.stringify({}), status: "ACTIVE",
    });
  }

  const expenseCategoryIds: Record<string, string> = {};
  for (const name of EXPENSE_CATEGORIES) {
    expenseCategoryIds[name] = await ctx.insertReturningId("expense_category", {
      name, code: name.slice(0, 4).toUpperCase(), petty_limit_paise: 500000,
    });
  }

  for (const r of ROLES) {
    await ctx.query(`INSERT INTO role (code, name, is_core_login, description) VALUES ($1,$2,$3,$4)`, [r.code, r.name, r.core, `${r.name} role`]);
    ctx.counters["role"] = (ctx.counters["role"] ?? 0) + 1;
  }

  // Real fee heads, grade scale, and the small policy/catalogue tables that
  // have no hard FK to anything (true Tier-0 roots, semantically too, not
  // just by the FK-nullability computation).
  const feeHeadIds: Record<string, string> = {};
  for (const [name, code, headType, refundable] of [
    ["Admission Fee", "ADM", "SPECIAL", false],
    ["Tuition Fee", "TUI", "TUITION", false],
    ["Transport Fee", "TRN", "TRANSPORT", true],
    ["Hostel Fee", "HOS", "HOSTEL", true],
    ["Exam Fee", "EXM", "EXAM", false],
    ["Activity Fee", "ACT", "OTHER", false],
  ] as const) {
    feeHeadIds[name] = await ctx.insertReturningId("fee_head", { name, code, head_type: headType, is_refundable: refundable, status: "ACTIVE" });
  }

  const gradeScaleId = await ctx.insertReturningId("grade_scale", {
    name: "Tamil Nadu / CBSE 8-Band Scale", scale_type: "GRADE", is_default: true, status: "ACTIVE",
  });

  for (const [category, description, years, anchor, permanent] of [
    ["ADMISSION", "Admission file & transfer certificate", 7, "LEAVING_DATE", false],
    ["FEE_RECEIPT", "Fee payment receipts", 3, "CREATED_DATE", false],
    ["MEDICAL_RECORD", "Student health/medical records", null, "CREATED_DATE", true],
    ["EXAM_RECORD", "Mark sheets & exam records", 10, "CREATED_DATE", false],
  ] as const) {
    await ctx.query(
      `INSERT INTO document_retention_policy (category, description, retention_years, anchor, is_permanent, is_restricted, grace_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [category, description, years, anchor, permanent, category === "MEDICAL_RECORD", 30],
    );
    ctx.counters["document_retention_policy"] = (ctx.counters["document_retention_policy"] ?? 0) + 1;
  }

  for (const [domain, tier, delay] of [
    ["SCHOOL", 1, 3600], ["HEALTH", 1, 60], ["TRANSPORT", 1, 30], ["HOSTEL", 1, 86400],
  ] as const) {
    await ctx.insertReturningId("escalation_policy", {
      source_domain: domain, tier, delay_seconds: delay,
      recipient_role_codes: "{PRINCIPAL,VICE_PRINCIPAL}", include_parents: domain !== "SCHOOL",
      channels: "{PUSH,SMS}",
    });
  }

  const hostelIds = {
    boys: await ctx.insertReturningId("hostel", { name: "Boys Hostel", gender: "MALE", capacity: 160, status: "ACTIVE" }),
    girls: await ctx.insertReturningId("hostel", { name: "Girls Hostel", gender: "FEMALE", capacity: 128, status: "ACTIVE" }),
  };

  const PERIODS = [
    ["1", "08:30", "09:15"], ["2", "09:15", "10:00"], ["3", "10:00", "10:45"],
    ["RECESS", "10:45", "11:05"], ["4", "11:05", "11:50"], ["5", "11:50", "12:35"],
    ["LUNCH", "12:35", "13:05"], ["6", "13:05", "13:50"], ["7", "13:50", "14:35"], ["8", "14:35", "15:20"],
  ] as const;
  const timetablePeriodIds: string[] = [];
  for (let i = 0; i < PERIODS.length; i++) {
    const [label, start, end] = PERIODS[i]!;
    timetablePeriodIds.push(await ctx.insertReturningId("timetable_period", {
      period_no: i + 1, label, start_time: start, end_time: end, is_break: label === "RECESS" || label === "LUNCH",
    }));
  }

  const vehicleIds: string[] = [];
  const routeIds: string[] = [];
  const gpsDeviceIds: string[] = [];
  const terminalIds: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const reg = `TN37 AB ${1000 + i}`;
    const vId = await ctx.insertReturningId("vehicle", {
      registration_no: reg, model: "Tata Starbus", capacity: 60, ownership: "OWNED",
      operational_status: "ACTIVE", current_odometer_km: 40000 + i * 1500, next_service_due_km: 45000 + i * 1500,
      year_of_manufacture: 2019 + (i % 4), body_type: "BUS", fuel_tank_litres: 120,
    });
    vehicleIds.push(vId);
    routeIds.push(await ctx.insertReturningId("route", {
      name: `Route ${i} - ${["Gandhipuram", "RS Puram", "Saibaba Colony", "Peelamedu", "Ganapathy", "Singanallur", "Ukkadam", "Podanur", "Vadavalli", "Thudiyalur", "Kalapatti", "Sulur"][i - 1]}`,
      code: `R${i}`, direction: "BOTH", distance_km: 12 + i,
    }));
    gpsDeviceIds.push(await ctx.insertReturningId("gps_device", {
      device_uid: `GPS-${1000 + i}`, vendor: "Trackwel", protocol: "TCP", auth_secret_ref: `secret-gps-${1000 + i}`, status: "ACTIVE",
    }));
  }
  for (let i = 1; i <= 4; i++) {
    terminalIds.push(await ctx.insertReturningId("terminal", {
      terminal_uid: `TERM-${100 + i}`, terminal_type: "CANTEEN", vendor_id: vendorIds["Sri Kaveri Catering Services"], label: `Canteen POS ${i}`,
      auth_secret_ref: `secret-term-${100 + i}`, offline_floor_paise: 20000, blocklist_version: 1, roster_version: 1, status: "ACTIVE",
    }));
  }
  terminalIds.push(await ctx.insertReturningId("terminal", { terminal_uid: "TERM-201", terminal_type: "GATE", label: "Boys Hostel Gate", auth_secret_ref: "secret-term-201", offline_floor_paise: 0, blocklist_version: 1, roster_version: 1, status: "ACTIVE" }));
  terminalIds.push(await ctx.insertReturningId("terminal", { terminal_uid: "TERM-202", terminal_type: "GATE", label: "Girls Hostel Gate", auth_secret_ref: "secret-term-202", offline_floor_paise: 0, blocklist_version: 1, roster_version: 1, status: "ACTIVE" }));

  const equipmentIds: string[] = [];
  const EQUIP_BY_SPORT: [string, number][] = [
    ["Cricket Kit", 8], ["Kabaddi Mat", 3], ["Football", 15], ["Volleyball", 12],
    ["Kho-Kho Poles Set", 6], ["Athletics Hurdles", 10], ["Silambam Sticks", 30], ["Chess Board Set", 20],
  ];
  for (const [name, qty] of EQUIP_BY_SPORT) {
    equipmentIds.push(await ctx.insertReturningId("equipment", {
      name, quantity_total: qty, quantity_available: Math.max(0, qty - 2), condition: "GOOD", status: "ACTIVE",
    }));
  }

  // Real library book catalogue, 5,500 rows: English 60% / Tamil 35% / Hindi 5%.
  const langSplit = exactSplit(5500, { English: 60, Tamil: 35, Hindi: 5 } as const);
  const bookRows: unknown[][] = [];
  const catList = Object.values(libraryCategoryIds);
  let bookCounter = 0;
  const TITLE_STEMS = ["Chronicles of", "Journey to", "The Story of", "Tales from", "Understanding", "Introduction to", "Guide to", "History of"];
  const TITLE_TOPICS = ["Tamil Nadu", "the Himalayas", "Mathematics", "the Freedom Struggle", "Science", "Ancient India", "the Ocean", "Modern India", "Chess", "the Solar System"];
  for (const [lang, count] of Object.entries(langSplit)) {
    for (let i = 0; i < count; i++) {
      bookCounter++;
      bookRows.push([
        `${pick(TITLE_STEMS)} ${pick(TITLE_TOPICS)} ${bookCounter}`, "Various Authors", `978-93-${String(10000 + bookCounter).padStart(5, "0")}-${String(bookCounter % 10)}`,
        "Tamil Nadu Textbook and Educational Services Corporation", "1st", lang, "ACTIVE",
        2000 + Math.floor(rand() * 24), pick(catList),
      ]);
    }
  }
  await ctx.insertMany("library_book", ["title", "author", "isbn", "publisher", "edition", "language", "status", "publication_year", "category_id"], bookRows);

  const libraryEbookRows: unknown[][] = [];
  for (let i = 1; i <= 300; i++) {
    libraryEbookRows.push([`E-Resource ${i}: ${pick(TITLE_TOPICS)}`, "Various Authors", "TN Textbook Corp", "1st", pick(["English", "Tamil"]), "ACTIVE", `https://ebooks.sis.in/res-${i}`, pick(catList)]);
  }
  await ctx.insertMany("library_ebook", ["title", "author", "publisher", "edition", "language", "status", "resource_url", "category_id"], libraryEbookRows);

  await ctx.insertReturningId("library_config", {
    loan_period_days: 14, max_renewals: 2, fine_per_day_paise: 500, max_books_per_member: 3, reservation_hold_days: 3,
  });

  for (let m = 6; m <= 12; m++) await ctx.insertReturningId("payroll_period", { month: m, year: 2025, state: "DRAFT" });
  for (let m = 1; m <= 4; m++) await ctx.insertReturningId("payroll_period", { month: m, year: 2026, state: "DRAFT" });

  return {
    schoolId, academicYearId, departmentIds, gradeIds, mediumIds, subjectIds,
    libraryCategoryIds, inventoryCategoryIds, vendorIds, houseIds, sportIds,
    expenseCategoryIds, campusId, feeHeadIds, gradeScaleId, hostelIds,
    timetablePeriodIds, vehicleIds, routeIds, gpsDeviceIds, terminalIds, equipmentIds,
  };
}
