export type Role = "student" | "staff" | "bar" | "school_admin";
export type StaffCategory =
  | "docente"
  | "segreteria"
  | "dirigente"
  | "vicepreside"
  | "collaboratore"
  | "ata";
export interface Profile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  requestedRole: "student" | "staff";
  staffCategory: StaffCategory | "";
  className: string;
  approved: boolean;
  disabled: boolean;
  createdAt: string;
  budgetCents: number;
}
export interface Ingredient {
  id: string;
  name: string;
  unit: "g" | "ml" | "pz";
  stock: number;
  minStock: number;
  packSize: number;
  allergens: string[];
  vegan: boolean;
}
export interface RecipeLine {
  ingredientId: string;
  quantity: number;
}
export interface Product {
  id: string;
  name: string;
  category: "Panini" | "Focacce" | "Dolci" | "Bevande";
  description: string;
  priceCents: number;
  dailyLimit: number;
  active: boolean;
  vegan: boolean;
  ingredientNames?: string[];
  allergens: string[];
  traces: string[];
  recipe: RecipeLine[];
  image: string;
}
export interface Catalog {
  products: Product[];
  ingredients: Ingredient[];
  version: number;
  updatedAt: string;
}
export type SlotId = "prima" | "seconda";
export interface Settings {
  bookingDays: number;
  weekdays: number[];
  closedDates: string[];
  capacity: Record<SlotId, number>;
  cutoff: Record<SlotId, string>;
  accepting: boolean;
  notice: string;
  schoolName: string;
  termsVersion: string;
}
export interface CartLine {
  productId: string;
  quantity: number;
}
export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  priceCents: number;
  ingredientNames?: string[];
  allergens: string[];
  traces: string[];
  vegan: boolean;
  recipe: RecipeLine[];
}
export type OrderStatus =
  "confirmed" | "preparing" | "ready" | "collected" | "cancelled";
export type PaymentStatus =
  "due" | "pending" | "paid" | "refund_required" | "refunded";
export interface Order {
  id: string;
  uid: string;
  customerName: string;
  className: string;
  customerRole: Role;
  date: string;
  slot: SlotId;
  queueNumber: number;
  pickupCode: string;
  lines: OrderLine[];
  totalCents: number;
  status: OrderStatus;
  paymentMethod: "counter" | "nexi";
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  catalogVersion: number;
  termsVersion: string;
}
export interface DayLedger {
  counts: Record<string, number>;
  slots: Record<SlotId, number>;
  sequence: Record<SlotId, number>;
}
export interface Audit {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
}
export interface Snapshot {
  profile: Profile | null;
  products: Product[];
  ingredients: Ingredient[];
  catalogVersion: number;
  settings: Settings;
  orders: Order[];
  users: Profile[];
  audit: Audit[];
  nexiEnabled: boolean;
}
export interface Registration {
  name: string;
  email: string;
  password: string;
  requestedRole: "student" | "staff";
  className: string;
  staffCategory: StaffCategory | "";
  accepted: boolean;
}
export const STAFF_LABELS: Record<StaffCategory, string> = {
  docente: "Docente",
  segreteria: "Segreteria",
  dirigente: "Dirigente scolastico",
  vicepreside: "Vicepresidenza",
  collaboratore: "Collaboratore scolastico",
  ata: "Altro personale ATA",
};
export const ROLE_LABELS: Record<Role, string> = {
  student: "Studente",
  staff: "Personale scolastico",
  bar: "Gestione bar",
  school_admin: "Amministrazione scuola",
};
