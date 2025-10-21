import { Response, Request } from "express";
import { Book } from "../models/Book.model";
import ResponseHandler from "../utils/apiResponse";
import axios from "axios";
import { createBookValidation } from "../utils/validation";

class BookService {
  // Create a new book
  async createBook(req: Request, res: Response) {
    try {
      const parsed = createBookValidation.safeParse(req.body);
      if (!parsed.success) {
        const issues = parsed.error.flatten();
        return ResponseHandler.badRequest(res, "Validation failed", issues);
      }

      const payload = parsed.data;

      const existing = await Book.findOne({ title: payload.title.trim() });
      if (existing) {
        return ResponseHandler.fail(res, "A book with this title already exists", null, 409);
      }

      const created = await Book.create({
        title: payload.title.trim(),
        description: payload.description,
        pdfKey: payload.pdfKey,
        pdfUrl: payload.pdfUrl,
        coverImageKey: payload.coverImageKey,
        coverImageUrl: payload.coverImageUrl,
        type: payload.type ?? "free",
      });

      return ResponseHandler.success(res, "Book created successfully", created, 201);
    } catch (error: any) {
      console.error("❌ Create Book Error:", error);
      return ResponseHandler.internalError(res, "Failed to create book", error);
    }
  }
  // Get all books with pagination
  async getAllBooks(req: Request, res: Response) {
    try {
      // --- parse pagination ---
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      // --- parse & validate type filter ---
      const type = req.query.type as string | undefined;
      const filter: Record<string, any> = {};

      if (type) {
        if (!["free", "premium"].includes(type)) {
          return ResponseHandler.badRequest(
            res,
            "Invalid type. Allowed values are 'free' or 'premium'."
          );
        }
        filter.type = type;
      }

      // --- fetch & count ---
      const [books, total] = await Promise.all([
        Book.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Book.countDocuments(filter),
      ]);

      return ResponseHandler.success(res, "Books fetched successfully", {
        total,
        page,
        limit,
        books,
      });
    } catch (error: any) {
      console.error("❌ Get Books Error:", error);
      return ResponseHandler.internalError(res, "Failed to fetch books", error);
    }
  }

  // Get a single book by ID
  async getBookById(bookId: string, res: Response) {
    try {
      const book = await Book.findById(bookId);

      if (!book) {
        return ResponseHandler.notFound(res, "Book not found");
      }

      const pdfUrl = book.pdfUrl || "";
      const pdfFilename = pdfUrl.split("/").pop(); // e.g., 1751657647900_103.pdf

      // Fetch PDF from S3 as buffer
      let pdfBufferBase64 = null;
      if (pdfUrl) {
        const pdfResponse = await axios.get(pdfUrl, {
          responseType: "arraybuffer",
        });
        const buffer = Buffer.from(pdfResponse.data, "binary");
        pdfBufferBase64 = buffer.toString("base64"); // Convert to base64
      }

      const responseData = {
        ...book.toObject(),
        pdfFilename,
        pdfBase64: pdfBufferBase64, // Include base64 string
      };

      return ResponseHandler.success(
        res,
        "Book fetched successfully",
        responseData,
        200
      );
    } catch (error: any) {
      console.error("❌ Get Book By ID Error:", error);
      return ResponseHandler.internalError(res, "Failed to fetch book", error);
    }
  }
}

export default new BookService();
