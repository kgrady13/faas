import { NextResponse } from "next/server";

/**
 * Standard headers for Server-Sent Events (SSE) responses
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

/**
 * Standard headers for JSON responses
 */
export const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

/**
 * Create a successful JSON response using NextResponse
 */
export function jsonSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, ...data },
    { status }
  );
}

/**
 * Create an error JSON response using NextResponse
 */
export function jsonError(error: string, status = 400): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status }
  );
}

/**
 * Create an error response for SSE endpoints (returns JSON error before stream starts)
 */
export function sseError(error: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    { status, headers: JSON_HEADERS }
  );
}

/**
 * Create a successful JSON response using standard Response
 * (useful when NextResponse is not needed)
 */
export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status, headers: JSON_HEADERS }
  );
}

/**
 * Create an error response using standard Response
 */
export function errorResponse(error: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    { status, headers: JSON_HEADERS }
  );
}

/**
 * Create an SSE stream response
 */
export function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * Encode an SSE message
 */
export function encodeSSEMessage(type: string, data: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`);
}
