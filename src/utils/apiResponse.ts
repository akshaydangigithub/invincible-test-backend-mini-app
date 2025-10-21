import { Response } from "express";

interface Meta {
  [key: string]: any;
}

interface ResponsePayload<T> {
  status: string;
  message: string;
  data?: T;
  meta?: Meta;
  error?: any;
}

class AppResponse {
  static success<T = any>(
    res: Response,
    message = "Success",
    data?: T,
    statusCode = 200,
    meta?: Meta,
  ) {
    const response: ResponsePayload<T> = {
      status: "success",
      message,
      ...(data !== undefined && { data }),
      ...(meta && { meta }),
    };
    return res.status(statusCode).json(response);
  }

  static fail<T = any>(
    res: Response,
    message = "Failed",
    data?: T,
    statusCode = 400,
  ) {
    const response: ResponsePayload<T> = {
      status: "fail",
      message,
      ...(data !== undefined && { data }),
    };
    return res.status(statusCode).json(response);
  }

  static badRequest(res: Response, message = "Bad Request", error?: any) {
    const response: ResponsePayload<null> = {
      status: "fail",
      message,
      ...(error && { error }),
    };
    return res.status(400).json(response);
  }

  static unauthorized(res: Response, message = "Unauthorized", error?: any) {
    const response: ResponsePayload<null> = {
      status: "fail",
      message,
      ...(error && { error }),
    };
    return res.status(401).json(response);
  }

  static forbidden(res: Response, message = "Forbidden", error?: any) {
    const response: ResponsePayload<null> = {
      status: "fail",
      message,
      ...(error && {
        error:
          typeof error === "object"
            ? {
                message: error.message,
                ...(process.env.NODE_ENV === "development" && {
                  stack: error.stack,
                }),
              }
            : error,
      }),
    };
    return res.status(403).json(response);
  }

  static notFound(res: Response, message = "Not Found", error?: any) {
    const response: ResponsePayload<null> = {
      status: "fail",
      message,
      ...(error && { error }),
    };
    return res.status(404).json(response);
  }

  static internalError(
    res: Response,
    message = "Internal Server Error",
    error?: any,
  ) {
    const response: ResponsePayload<null> = {
      status: "error",
      message,
      ...(process.env.NODE_ENV === "development" && error ? { error } : {}),
    };
    return res.status(500).json(response);
  }
}

export default AppResponse;
