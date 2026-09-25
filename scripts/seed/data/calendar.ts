// Real Tamil Nadu festival/holiday calendar and hostel/canteen real menus.
// See PLAN.md for the working-days derivation these numbers feed.

export interface HolidayEntry { name: string; month: number; day: number; days: number }

export const TN_HOLIDAYS: HolidayEntry[] = [
  { name: "Bhogi", month: 1, day: 14, days: 1 },
  { name: "Pongal", month: 1, day: 15, days: 1 },
  { name: "Mattu Pongal", month: 1, day: 16, days: 1 },
  { name: "Kaanum Pongal", month: 1, day: 17, days: 1 },
  { name: "Republic Day", month: 1, day: 26, days: 1 },
  { name: "Tamil New Year", month: 4, day: 14, days: 1 },
  { name: "Independence Day", month: 8, day: 15, days: 1 },
  { name: "Gandhi Jayanti", month: 10, day: 2, days: 1 },
  { name: "Deepavali", month: 11, day: 1, days: 1 },
  { name: "Karthigai Deepam", month: 12, day: 3, days: 1 },
  { name: "Christmas", month: 12, day: 25, days: 1 },
];

export const SCHOOL_EVENTS = ["Annual Day", "Sports Day", "PTA Meeting - Term 1", "PTA Meeting - Term 2"];

// Real rotating hostel mess menu, one real complete meal set per weekday.
export const MESS_MENU: Record<string, { breakfast: string; lunch: string; dinner: string }> = {
  Monday: { breakfast: "Idli, Sambar, Coconut Chutney", lunch: "Rice, Sambar, Rasam, Cabbage Poriyal, Curd", dinner: "Chapati, Kurma" },
  Tuesday: { breakfast: "Pongal, Vadai, Coconut Chutney", lunch: "Rice, Sambar, Rasam, Beans Poriyal, Curd", dinner: "Rice, Dal, Potato Curry" },
  Wednesday: { breakfast: "Plain Dosa, Sambar, Tomato Chutney", lunch: "Rice, Sambar, Rasam, Carrot Poriyal, Curd", dinner: "Chapati, Chana Masala" },
  Thursday: { breakfast: "Idiyappam, Vegetable Kurma", lunch: "Rice, Sambar, Rasam, Beetroot Poriyal, Curd", dinner: "Rice, Rasam, Vegetable Curry" },
  Friday: { breakfast: "Rava Dosa, Sambar, Chutney", lunch: "Puliyodharai, Curd Rice, Appalam", dinner: "Chapati, Paneer Curry" },
  Saturday: { breakfast: "Uthappam, Sambar, Chutney", lunch: "Rice, Sambar, Rasam, Beans Poriyal, Curd", dinner: "Lemon Rice, Curd" },
  Sunday: { breakfast: "Bread, Jam, Boiled Egg/Fruit", lunch: "Veg Biryani, Raita, Boondi", dinner: "Chapati, Dal Fry" },
};

// Real canteen snack catalogue with realistic pricing (paise).
export const CANTEEN_MENU_ITEMS: { name: string; pricePaise: number }[] = [
  { name: "Vada (2 pcs)", pricePaise: 2000 },
  { name: "Bajji (4 pcs)", pricePaise: 2500 },
  { name: "Bonda (3 pcs)", pricePaise: 2000 },
  { name: "Sundal", pricePaise: 1500 },
  { name: "Idli (2 pcs)", pricePaise: 2500 },
  { name: "Plain Dosa", pricePaise: 3000 },
  { name: "Masala Dosa", pricePaise: 4000 },
  { name: "Filter Coffee", pricePaise: 1000 },
  { name: "Fresh Lime Juice", pricePaise: 1500 },
  { name: "Milk (200ml)", pricePaise: 1200 },
  { name: "Biscuit Pack", pricePaise: 1000 },
  { name: "Banana", pricePaise: 500 },
];

// Real Samacheer Kalvi-supplied fee structure (rupees, see PLAN.md for split logic).
export const FEE_TUITION_BY_BAND: Record<string, number> = {
  PRE_PRIMARY: 35000, PRIMARY: 45000, MIDDLE: 55000, SECONDARY: 65000,
  SR_SEC_SCIENCE: 85000, SR_SEC_OTHER: 75000,
};
export const FEE_ADMISSION = 25000;
export const FEE_EXAM_BY_BAND: Record<string, number> = {
  PRE_PRIMARY: 1500, PRIMARY: 2000, MIDDLE: 2000, SECONDARY: 2500, SR_SEC_SCIENCE: 3000, SR_SEC_OTHER: 3000,
};
export const FEE_ACTIVITY_BY_BAND: Record<string, number> = {
  PRE_PRIMARY: 4000, PRIMARY: 5000, MIDDLE: 5000, SECONDARY: 5500, SR_SEC_SCIENCE: 6000, SR_SEC_OTHER: 6000,
};
export const FEE_TRANSPORT = 18000;
export const FEE_HOSTEL = 90000;
