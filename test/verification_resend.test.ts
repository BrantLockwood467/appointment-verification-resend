import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentRequest, deliveryClient, DeliveryError, resendForAppointment } from "../src/verification_resend.ts";

const input = {
  appointmentRef: "lesson-42",
  appointmentState: "awaiting_verification" as const,
  message_id: "original-message",
  requestId: "db169541-c434-401f-ad8e-dd223470d321",
};

test("a confirmed appointment does not send another verification message", async () => {
  const client = deliveryClient("test-key", async () => {
    assert.fail("Confirmed appointments must not call delivery");
  });
  const result = await resendForAppointment({ ...input, appointmentState: "confirmed" }, client);
  assert.equal(result.action, "skipped");
  assert.equal(result.appointmentState, "confirmed");
});

test("resend retries keep their identity and delivery does not confirm the appointment", async () => {
  const calls: { url: string; method: string | undefined; key: string | null }[] = [];
  const delays: number[] = [];
  const client = deliveryClient("test-key", async (url, init) => {
    calls.push({ url: String(url), method: init?.method,
      key: new Headers(init?.headers).get("Idempotency-Key") });
    if (calls.length === 1) return Response.json({ ok: false, error: { message: "Retry later" } },
      { status: 429, headers: { "Retry-After": "1" } });
    return Response.json({ ok: true, data: calls.length === 2 ? { message_id: "resent-message" } : [] });
  }, async ms => { delays.push(ms); });
  const result = await resendForAppointment(input, client);
  assert.deepEqual(calls.map(call => call.method), ["POST", "POST", "GET"]);
  assert.deepEqual(calls.slice(0, 2).map(call => call.key), [input.requestId, input.requestId]);
  assert.ok(calls[2].url.endsWith("/v1/sms/events/resent-message"));
  assert.deepEqual(delays, [1000]);
  assert.equal(result.action, "resend_requested");
  assert.equal(result.appointmentState, "awaiting_verification");
  assert.ok(!JSON.stringify(result).includes("original-message"));
});

test("request boundary rejects clinical details and preserves business rejections", async () => {
  assert.equal(appointmentRequest.safeParse({ ...input, diagnosis: "private" }).success, false);
  const detail = { message: "Request rejected" };
  const client = deliveryClient("test-key", async () => Response.json({ ok: false, error: detail }, { status: 400 }));
  await assert.rejects(client.sms.resend(input.message_id, input.requestId), error =>
    error instanceof DeliveryError && error.status === 400 && JSON.stringify(error.detail) === JSON.stringify(detail));
});
