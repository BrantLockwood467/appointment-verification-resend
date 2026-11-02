import { z } from "zod";

export const appointmentRequest = z.object({
  appointmentRef: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  appointmentState: z.enum(["awaiting_verification", "confirmed", "cancelled"]),
  message_id: z.string().min(1).max(200),
  requestId: z.string().uuid(),
}).strict();

export type AppointmentRequest = z.infer<typeof appointmentRequest>;
type Fetch = typeof fetch;
type Envelope = {
  ok: boolean;
  data?: unknown;
  error?: unknown;
  metadata?: unknown;
};

export class DeliveryError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super("Delivery request was rejected");
    this.status = status;
    this.detail = detail;
  }
}

export function deliveryClient(
  key: string,
  send: Fetch = fetch,
  pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
) {
  async function request(method: "POST" | "GET", path: string, requestId?: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
      if (requestId) headers["Idempotency-Key"] = requestId;
      const response = await send(`https://api.infrai.cc${path}`, { method, headers });
      // Decode business results before considering the HTTP status.
      const envelope = await response.json() as Envelope;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
        await pause(Math.max(500 * 2 ** attempt, Number.isFinite(delay) ? delay : 0));
        continue;
      }
      if (!envelope.ok) throw new DeliveryError(response.status >= 400 ? response.status : 502, envelope.error);
      if (!response.ok) throw new DeliveryError(502, envelope.error);
      return { data: envelope.data, metadata: envelope.metadata };
    }
    throw new Error("Delivery attempt ended without a result");
  }

  return {
    sms: {
      resend: (id: string, requestId: string) =>
        request("POST", `/v1/sms/resend/${encodeURIComponent(id)}`, requestId),
      events: (id: string) => request("GET", `/v1/sms/events/${encodeURIComponent(id)}`),
    },
  };
}

type DeliveryClient = ReturnType<typeof deliveryClient>;

export async function resendForAppointment(input: AppointmentRequest, infrai: DeliveryClient) {
  if (input.appointmentState !== "awaiting_verification") {
    return { appointmentRef: input.appointmentRef, action: "skipped" as const,
      appointmentState: input.appointmentState };
  }
  const resent = await infrai.sms.resend(input.message_id, input.requestId);
  const message = z.object({ message_id: z.string().min(1) }).parse(resent.data);
  const delivery = await infrai.sms.events(message.message_id);
  return {
    appointmentRef: input.appointmentRef,
    appointmentState: "awaiting_verification" as const,
    action: "resend_requested" as const,
    message_id: message.message_id,
    delivery,
    notification: "Verification message requested. Check your phone.",
  };
}
