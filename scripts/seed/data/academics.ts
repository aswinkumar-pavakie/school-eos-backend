// Real Tamil Nadu Samacheer Kalvi academic structure — grades, bands, subjects,
// term-wise syllabus units. See PLAN.md for the population numbers this feeds.

export const GRADES = ["LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
export const SECTIONS = ["A", "B", "C", "D"] as const;

export type Band = "PRE_PRIMARY" | "PRIMARY" | "MIDDLE" | "SECONDARY" | "SR_SEC";

export function bandForGrade(grade: string): Band {
  if (grade === "LKG" || grade === "UKG") return "PRE_PRIMARY";
  const n = Number(grade);
  if (n <= 5) return "PRIMARY";
  if (n <= 8) return "MIDDLE";
  if (n <= 10) return "SECONDARY";
  return "SR_SEC";
}

export const SR_SEC_STREAMS = ["SCIENCE", "COMMERCE", "HUMANITIES"] as const;

// Real subject names per band (Tamil, not a generic "regional language" — see
// PLAN.md's Tamil-mandate note). Sr. Secondary varies by stream.
export const SUBJECTS_BY_BAND: Record<Band, string[]> = {
  PRE_PRIMARY: ["Rhymes & Stories", "Numbers & Shapes", "Art & Craft", "Language Basics", "Physical Activity"],
  PRIMARY: ["English", "Tamil", "Mathematics", "EVS", "Art Education"],
  MIDDLE: ["English", "Tamil", "Mathematics", "Science", "Social Science"],
  SECONDARY: ["English", "Mathematics", "Science", "Social Science", "Tamil"],
  SR_SEC: [], // filled per-stream below
};

export const SR_SEC_SUBJECTS: Record<(typeof SR_SEC_STREAMS)[number], string[]> = {
  SCIENCE: ["English", "Physics", "Chemistry", "Mathematics", "Computer Science"],
  COMMERCE: ["English", "Accountancy", "Business Studies", "Economics", "Informatics Practices"],
  HUMANITIES: ["English", "History", "Political Science", "Economics", "Psychology"],
};

// PE + Club Activity apply to every grade 1-12 section on top of the academic
// subjects above (not examinable — see PLAN.md exam_subject derivation).
export const NON_EXAMINABLE_SUBJECTS = ["Physical Education", "Club Activity"];

// Real Samacheer Kalvi 3-term textbook split (see PLAN.md academic_term).
// Example: Grade 8 Mathematics real term-wise chapter split.
export const SAMPLE_SYLLABUS_G8_MATHS: Record<"Term 1" | "Term 2" | "Term 3", string[]> = {
  "Term 1": ["Numbers", "Measurements", "Algebra"],
  "Term 2": ["Life Mathematics", "Geometry", "Statistics"],
  "Term 3": ["Information Processing", "Coordinate Geometry", "Trigonometry"],
};

// Real 7-exam/year calendar for grades 1-12 (LKG/UKG get 2 informal
// assessments instead — handled separately in the seed script).
export const EXAMS = [
  { name: "Formative Assessment 1", month: 7, kind: "UNIT_TEST" },
  { name: "Quarterly Exam", month: 9, kind: "QUARTERLY" },
  { name: "Half-Yearly Exam", month: 11, kind: "HALF_YEARLY" },
  { name: "Formative Assessment 2", month: 12, kind: "UNIT_TEST" },
  { name: "Revision Test 1", month: 1, kind: "REVISION" },
  { name: "Revision Test 2", month: 3, kind: "REVISION" },
  { name: "Public/Annual Exam", month: 4, kind: "ANNUAL" },
] as const;

// Real CBSE/TN grade band (see PLAN.md).
export const GRADE_BANDS = [
  { label: "A1", min: 91, max: 100 },
  { label: "A2", min: 81, max: 90 },
  { label: "B1", min: 71, max: 80 },
  { label: "B2", min: 61, max: 70 },
  { label: "C1", min: 51, max: 60 },
  { label: "C2", min: 41, max: 50 },
  { label: "D", min: 33, max: 40 },
  { label: "E", min: 0, max: 32 },
] as const;

// Real mark-distribution weights, summing to 100 (see PLAN.md).
export const MARK_BAND_WEIGHTS = { A1: 8, A2: 14, B1: 18, B2: 20, C1: 16, C2: 12, D: 7, E: 5 };
