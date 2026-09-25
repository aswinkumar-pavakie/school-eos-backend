// Real organizational catalogues — sports, houses, library, inventory, vendors.
// See PLAN.md for the row counts these feed.

export const SPORTS = ["Cricket", "Kabaddi", "Football", "Volleyball", "Kho-Kho", "Athletics", "Silambam", "Chess"];
export const HOUSES = ["Bharathiyar", "Kamarajar", "Anna", "Periyar"];

export const DEPARTMENTS = [
  "Primary", "Middle", "Secondary", "Senior Secondary - Science", "Senior Secondary - Commerce",
  "Senior Secondary - Humanities", "Administration", "Transport", "Hostel", "Sports",
];

export const LIBRARY_CATEGORIES = [
  "Fiction", "Reference", "Science", "Mathematics", "Social Science", "Tamil Literature",
  "English Literature", "Biography", "Competitive Exam Prep", "Children's Picture Books",
  "Periodicals/Magazines", "General Knowledge",
];

export const INVENTORY_CATEGORIES = [
  "Sports Equipment", "Lab Apparatus", "AV/Media Equipment", "Furniture",
  "Computers & IT", "Stationery Stock", "Cleaning Supplies", "Kitchen/Mess Equipment",
];

export const VENDORS = [
  { name: "Sri Kaveri Catering Services", type: "CANTEEN" },
  { name: "Amman Uniforms & Textiles", type: "OTHER" },
  { name: "Tamil Nadu Textbook and Educational Services Corporation", type: "STATIONERY" },
  { name: "Sakthi Fuel Station", type: "OTHER" },
];

export const EXPENSE_CATEGORIES = [
  "Utilities", "Maintenance", "Stationery", "Transport Fuel", "Events",
  "Sports Equipment", "Lab Consumables", "Miscellaneous",
];

export const COMMUNITY_CATEGORIES = ["OC", "BC", "MBC", "SC", "SC(A)", "ST"] as const;
export const COMMUNITY_WEIGHTS: Record<(typeof COMMUNITY_CATEGORIES)[number], number> = {
  OC: 54, BC: 20, MBC: 7, SC: 17, "SC(A)": 1, ST: 1,
};

export const BLOOD_GROUP_WEIGHTS: Record<string, number> = {
  "O+": 840, "B+": 660, "A+": 470, "AB+": 160, "O-": 45, "B-": 35, "A-": 20, "AB-": 10,
};
