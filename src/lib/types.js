import { z } from "zod";

// === ENUMS ===
export const userRoleEnum = z.enum(["admin", "resident", "guard"]);
export const requestStatusEnum = z.enum(["pending", "approved", "rejected", "entered", "exited"]);

// === ZOD SCHEMAS (For Forms) ===

export const insertVisitorRequestSchema = z.object({
  visitorName: z.string().min(1, "Visitor name is required"),
  visitorPhone: z.string().min(10, "Valid phone number is required"),
  flatId: z.string().min(1, "Flat selection is required"),
  purpose: z.string().min(1, "Purpose is required"),
  vehicleNumber: z.string().optional(),
});

export const insertUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: userRoleEnum,
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
});

export const insertBlockSchema = z.object({
  name: z.string().min(1, "Block name is required"),
});

export const insertFlatSchema = z.object({
  number: z.string().min(1, "Flat number is required"),
  blockId: z.string(),
  floor: z.coerce.number().optional(),
});

export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
  residencyId: z.string().min(1, "Residency selection is required"),
});

export const registerResidencySchema = z.object({
  residencyName: z.string().min(3, "Residency name must be at least 3 characters"),
  adminUsername: z.string().min(3, "Username must be at least 3 characters"),
  adminPassword: z.string().min(6, "Password must be at least 6 characters"),
  adminPhone: z.string().optional(),
});
