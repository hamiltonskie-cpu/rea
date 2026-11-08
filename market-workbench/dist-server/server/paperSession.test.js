import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaperSession } from "./paperSession.js";
test("creates a signed HttpOnly session cookie and resolves it on later requests", () => {
    const first = resolvePaperSession(undefined, "test-secret", true);
    assert.ok(first.setCookie?.includes("HttpOnly"));
    assert.ok(first.setCookie?.includes("Secure"));
    assert.ok(first.setCookie?.includes("SameSite=Lax"));
    const second = resolvePaperSession(first.setCookie?.split(";")[0], "test-secret", true);
    assert.equal(second.sessionId, first.sessionId);
    assert.equal(second.setCookie, undefined);
});
test("rotates malformed, tampered, and differently signed session cookies", () => {
    const first = resolvePaperSession(undefined, "test-secret", false);
    const cookie = first.setCookie?.split(";")[0] ?? "";
    const tampered = `${cookie.slice(0, -1)}x`;
    const next = resolvePaperSession(tampered, "test-secret", false);
    const rotated = resolvePaperSession(cookie, "different-secret", false);
    assert.notEqual(next.sessionId, first.sessionId);
    assert.notEqual(rotated.sessionId, first.sessionId);
    assert.ok(next.setCookie);
    assert.ok(rotated.setCookie);
});
