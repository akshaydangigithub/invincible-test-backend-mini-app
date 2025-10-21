import { Request, Response, NextFunction } from "express";
import catchAsync from "../utils/catchAsync";
import BookService from "../services/Book.service";

class BookController {
  // Get paginated list of books
  getAllBooks = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      await BookService.getAllBooks(req, res);
    }
  );

  // Get book by ID
  getBookById = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const bookId = req.params.id;
      await BookService.getBookById(bookId, res);
    }
  );

  // Create book
  createBook = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      await BookService.createBook(req, res);
    }
  );
}

export default new BookController();
