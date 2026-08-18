import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = (m = "Sign-in required") => new ApiError(401, m);
export const forbidden = (m = "You do not have access to this") => new ApiError(403, m);
export const notFound = (m = "Not found") => new ApiError(404, m);
export const badRequest = (m: string, detail?: unknown) => new ApiError(400, m, detail);
export const conflict = (m: string) => new ApiError(409, m);

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Wraps a route handler so thrown ApiErrors become clean JSON and anything
 * unexpected becomes a 500 without leaking internals to the browser.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message, detail: error.detail },
          { status: error.status },
        );
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid request", detail: error.flatten() },
          { status: 400 },
        );
      }
      console.error("Unhandled route error", error);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
