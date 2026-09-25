// Real Tamil Nadu first-name and surname/community-name banks, used to generate
// every person row (students, staff, guardians, drivers, etc.) — never
// "Test User N". Surnames double as a real proxy for the community_category
// distribution already fixed in PLAN.md (a real seed script draws from the
// surname list matching the community bucket it's currently filling).

export const MALE_FIRST_NAMES = [
  "Aravind", "Karthik", "Vignesh", "Suriya", "Dinesh", "Prakash", "Saravanan",
  "Bala", "Senthil", "Rajesh", "Aravindan", "Naveen", "Pradeep", "Gokul",
  "Arun", "Hari", "Mani", "Ganesh", "Vetri", "Sathish", "Ashok", "Murugan",
  "Ramesh", "Venkat", "Kishore", "Aditya", "Prithvi", "Vikram", "Deepak",
  "Selva", "Rajkumar", "Muthu", "Kannan", "Sivakumar", "Balamurugan",
];

export const FEMALE_FIRST_NAMES = [
  "Priya", "Divya", "Kavya", "Meena", "Lakshmi", "Anitha", "Sangeetha",
  "Revathi", "Kalpana", "Bhavani", "Charumathi", "Nithya", "Ramya", "Sujatha",
  "Deepa", "Vidya", "Swathi", "Oviya", "Nivetha", "Jayanthi", "Vanitha",
  "Malini", "Radhika", "Gomathi", "Chellam", "Abinaya", "Esther", "Indhu",
  "Suja", "Pavithra", "Kokila", "Dharani", "Selvi", "Uma", "Aishwarya",
];

// General/OC + BC/MBC surnames (Iyer/Iyengar are Brahmin-OC; Chettiar/Mudaliar/
// Gounder/Nadar/Pillai/Naidu are real, common Tamil Nadu BC/MBC community names;
// Rajan/Krishnan/Venkatesh/Palaniappan/Perumal/Shanmugam are common across
// several TN communities and used as neutral OC/BC filler).
export const SURNAMES_OC = ["Iyer", "Iyengar", "Sharma"];
export const SURNAMES_BC = ["Mudaliar", "Naidu", "Chettiar", "Pillai", "Yadav"];
export const SURNAMES_MBC = ["Nadar", "Gounder", "Vanniyar"];
export const SURNAMES_SC = ["Paraiyar", "Pallar", "Devendrar"];
export const SURNAMES_SCA = ["Arunthathiyar"];
export const SURNAMES_ST = ["Malayali", "Irular"];
// Neutral, community-agnostic surnames used as the last-name field itself
// (Tamil naming convention: father's-name-as-initial + given name is also
// real and common — a real script alternates both real patterns).
export const NEUTRAL_SURNAMES = [
  "Rajan", "Krishnan", "Venkatesh", "Palaniappan", "Perumal", "Shanmugam",
  "Ramanathan", "Balasubramaniam", "Subramaniam", "Natarajan", "Kandasamy",
  "Alagappan", "Sivakumar", "Muthusamy", "Selvam", "Ramaswamy",
];

export function surnamesForCommunity(cat: "OC" | "BC" | "MBC" | "SC" | "SC(A)" | "ST"): string[] {
  switch (cat) {
    case "OC": return SURNAMES_OC.concat(NEUTRAL_SURNAMES);
    case "BC": return SURNAMES_BC.concat(NEUTRAL_SURNAMES);
    case "MBC": return SURNAMES_MBC;
    case "SC": return SURNAMES_SC;
    case "SC(A)": return SURNAMES_SCA;
    case "ST": return SURNAMES_ST;
  }
}

// Real Chennai/Coimbatore/Madurai-style localities + real TN pincode prefixes
// (Tamil Nadu pincodes genuinely start with 6) for person.address fields.
export const TN_LOCALITIES = [
  { area: "Anna Nagar", city: "Chennai", pincode: "600040" },
  { area: "T. Nagar", city: "Chennai", pincode: "600017" },
  { area: "Velachery", city: "Chennai", pincode: "600042" },
  { area: "Adyar", city: "Chennai", pincode: "600020" },
  { area: "RS Puram", city: "Coimbatore", pincode: "641002" },
  { area: "Saibaba Colony", city: "Coimbatore", pincode: "641011" },
  { area: "Anna Nagar", city: "Madurai", pincode: "625020" },
  { area: "K.K. Nagar", city: "Madurai", pincode: "625020" },
  { area: "Thillai Nagar", city: "Trichy", pincode: "620018" },
];
