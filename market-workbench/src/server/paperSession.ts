import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { parseCookie, stringifySetCookie } from "cookie";

const cookieName = "paper_session";
const maxAgeSeconds = 7 * 24 * 60 * 60;

export interface PaperSessionResolution {
  sessionId: string;
  setCookie?: string;
}

export function resolvePaperSession(
  cookieHeader: string | undefined,
  secret: string,
  secure: boolean,
): PaperSessionResolution {
  const token = parseCookie(cookieHeader ?? "")[cookieName];
  const sessionId = token ? verifyToken(token, secret) : null;
  if (sessionId) return { sessionId };

  const newSessionId = randomUUID();
  const signature = sign(newSessionId, secret);
  return {
    sessionId: newSessionId,
    setCookie: stringifySetCookie({
      name: cookieName,
      value: `${newSessionId}.${signature}`,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: maxAgeSeconds,
    }),
  };
}

function verifyToken(token: string, secret: string): string | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const sessionId = token.slice(0, separator);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return null;
  }

  const expected = Buffer.from(sign(sessionId, secret), "base64url");
  const supplied = Buffer.from(token.slice(separator + 1), "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? sessionId : null;
}

function sign(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}