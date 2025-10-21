import { z } from "zod";
import { KTPriority } from "./enum";

export const assistantResValidation = z.object({
  prompt: z
    .string({
      required_error: "Prompt is required",
      invalid_type_error: "Prompt must be a string",
    })
    .min(1, "Prompt cannot be empty"),
});

export const userRegisterValidation = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(2).optional(),
});

export const updateTokenValidation = z.object({
  token: z.number().min(1, "Token is required"),
});

// Book validations
export const createBookValidation = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .min(1, "Title cannot be empty"),
  description: z.string().optional(),
  pdfKey: z.string().optional(),
  pdfUrl: z.string().url().optional(),
  coverImageKey: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  type: z.enum(["free", "premium"]).optional(),
});