import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, STATUS_FOR_CODE, type ApiResult } from "@/lib/api-error";

/**
 * The single wrapper every route handler goes through.
 *
 * Two guarantees come from putting this in one place:
 *   1. No route can throw an unhandled rejection — every failure becomes a typed
 *      JSON body the client already knows how to render.
 *   2. No internal detail (stack, SQL, vendor payload) ever crosses the wire;
 *      unknown throws collapse to a generic `internal` with a real sentence.
 */
export function handler<T>(fn: () => Promise<T>): Promise<NextResponse<ApiResult<T>>> {
  return fn()
    .then((data) => NextResponse.json<ApiResult<T>>({ ok: true, data }))
    .catch((error: unknown) => {
      if (error instanceof AppError) {
        return NextResponse.json<ApiResult<T>>(
          { ok: false, error: error.toApiError() },
          { status: STATUS_FOR_CODE[error.code] },
        );
      }

      if (error instanceof z.ZodError) {
        return NextResponse.json<ApiResult<T>>(
          { ok: false, error: zodToApiError(error) },
          { status: STATUS_FOR_CODE.invalid_input },
        );
      }

      console.error("[api] unhandled error:", error);
      return NextResponse.json<ApiResult<T>>(
        { ok: false, error: new AppError("internal").toApiError() },
        { status: 500 },
      );
    });
}

function zodToApiError(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!fields[path]) fields[path] = issue.message;
  }
  return new AppError("invalid_input", "Some of that input isn't valid yet.", {
    fields,
    retryable: false,
  }).toApiError();
}

/**
 * Parses and validates a JSON request body. A malformed body is a 422 with a
 * readable message, never a 500 from `JSON.parse`.
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError("invalid_input", "That request body wasn't valid JSON.", {
      retryable: false,
    });
  }

  const result = schema.safeParse(json);
  if (!result.success) throw result.error;
  return result.data;
}
