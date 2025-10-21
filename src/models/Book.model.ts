// src/models/Book.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IBook extends Document {
  title: string;
  description?: string;
  pdfKey?: string;
  pdfUrl?: string;
  coverImageKey?: string;
  coverImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  type: "free" | "premium";
}

const BookSchema = new Schema<IBook>(
  {
    title: { type: String, required: true },
    description: { type: String },
    pdfKey: { type: String },
    pdfUrl: { type: String },
    coverImageKey: { type: String },
    coverImageUrl: { type: String },
    type: {
      type: String,
      enum: ["free", "premium"],
      required: true,
      default: "free", // ← default to free
    },
  },
  { timestamps: true }
);

export const Book = mongoose.model<IBook>("booknew", BookSchema);
