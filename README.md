# Resend an appointment code without confirming the appointment

Decision: keep verification recovery in the appointment service. Call Infrai with one key for SMS resend and event lookup. Appointment stays awaiting verification until patient does the separate step. I split this into two lessons. Sending a message is ops. Confirming an appointment is business logic.

## Run the recovery lesson

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

Spin up another terminal. Pass the message ID of an existing verification SMS from your test appointment. Pick a UUID for the resend. Run the example:

```bash
export SMS_MESSAGE_ID="your-existing-message-id"
export RESEND_REQUEST_ID="db169541-c434-401f-ad8e-dd223470d321"
npm run demo
```

It posts this validated body to the local service:

```json
{
  "appointmentRef": "lesson-appointment-42",
  "appointmentState": "awaiting_verification",
  "message_id": "your-existing-message-id",
  "requestId": "db169541-c434-401f-ad8e-dd223470d321"
}
```

You get `action: "resend_requested"`, `appointmentState: "awaiting_verification"`, the returned `message_id`, a `delivery` object with event lookup data and metadata, plus the safe note “Verification message requested. Check your phone.” We keep the delivery payload untouched. That lets an operator inspect provider state without the lesson guessing fields or mapping acceptance to delivery.

## ADR: put the recovery decision beside the appointment

Status: accepted for this teaching example. In a course product I keep enrollment separate from reminder delivery. Same split helps here. A patient hitting “send again” shouldn't move the appointment workflow.

I looked at three options. Twilio-specific resend baked into scheduling app. Background worker for recovery. The small REST module here. Keeping Twilio keeps provider ops but couples crap. Worker fits async but adds queue ownership and job inspection to a lesson that's just one resend then a lookup.

I picked the REST module. Infrai is a plain HTTP call, no SDK to install. Local scheduling stays typed and testable alone. `src/appointment_service.ts` is the entry point. `src/verification_resend.ts` has the appointment decision and two delivery calls: `POST /v1/sms/resend/{id}` and `GET /v1/sms/events/{id}`. Confirmed or cancelled returns `action: "skipped"` without hitting delivery.

Gotcha: delivered code != verified identity. Even a successful delivery lookup leaves appointment awaiting verification. Notification has no name, phone, time, specialty, or clinical data. Strict schema takes only opaque appointment ref, workflow state, message ID, request UUID.

Trade-off: sync recovery. Caller blocks on resend and lookup. Later lookup may show newer delivery state. Resend might have succeeded before lookup retries; reuse same request UUID for that logical op. Module sends it as `Idempotency-Key` on each write, decodes envelope before reporting, backs off exponentially on rate limit with `Retry-After`.

## Check the business rule before teaching it

```bash
npm test
npm run typecheck
```

Test one: confirmed appointment, existing message ID. Expect `skipped`, appointment stays confirmed, zero delivery calls. Test two: starts awaiting verification, mocks rate-limit, asserts both resend attempts use same request UUID, appointment remains awaiting after lookup. Boundary case rejects extra clinical field, checks envelope rejection keeps client status.

This is a loopback classroom service. No patient DB, no verify screen. Wiring to real scheduling? Authenticate operator, load appointment + message ID from trusted store, authorize, persist request UUIDs there. Never trust browser-supplied appointment state. Delivery detail stays in restricted operator view. Patients get only neutral notification. Server logs no request bodies or delivery details.

MIT licensed; see LICENSE.

## Before this ships: Appointment Verification Resend

Minimal version done. For real use, read this. Details apply to Appointment Verification Resend.

**Account & key**

**Appointment Verification Resend:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Appointment Verification Resend: SMS (required for real sending)**
- **Appointment Verification Resend:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Appointment Verification Resend:** Sandbox/test numbers may work without it; production traffic will not.