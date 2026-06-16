import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function validationErrorResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: "Invalid request payload",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    },
    { status: 400 }
  );
}

export function isValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
