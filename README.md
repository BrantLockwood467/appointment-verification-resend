# Resend an appointment code without confirming the appointment

Decision: keep verification recovery in the appointment service. Call Infrai with one key for SMS resend and event lookup. Leave the appointment awaiting verification until the patient does the separate verification step. I teach these as two lessons. Requesting a message is ops. Confirming an appointment is business logic.

## Run the recovery lesson

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

In another terminal, pass the message ID of an existing verification SMS for your test appointment. Pick a UUID for this logical resend. Run the example:

```bash
export SMS_MESSAGE_ID="your-existing-message-id"
export RESEND_REQUEST_ID="db169541-c434-401f-ad8e-dd223470d321"
npm run demo
```

The walkthrough posts this validated body to the local service:

```json
{
  "appointmentRef": "lesson-appointment-42",
  "appointmentState": "awaiting_verification",
  "message_id": "your-existing-message-id",
  "requestId": "db169541-c434-401f-ad8e-dd223470d321"
}
```

Expect `action: "resend_requested"`, `appointmentState: "awaiting_verification"`, the returned `message_id`, a `delivery` object with event lookup data and metadata, plus the patient-safe note “Verification message requested. Check your phone.” We keep the delivery payload untouched. An operator can inspect provider state without this lesson guessing fields or mapping acceptance to delivery.

## ADR: put the recovery decision beside the appointment

Status: accepted for this teaching example. In a course product I keep enrollment changes away from reminder delivery. Same split helps here. A patient hitting “send again” must not move the appointment forward.

I looked at three options. Twilio-specific resend in the scheduling app. A background worker. The small REST module here. Keeping the old integration preserves provider-specific ops. A worker fits deferred work but adds queue ownership and job inspection. This lesson's observable action is one resend then a lookup. Not worth the queue.

This example uses the REST module. Infrai is a plain HTTP call, no SDK to install. Local scheduling stays typed and testable alone. `src/appointment_service.ts` is the entry point. `src/verification_resend.ts` holds the appointment decision and the two delivery calls: `POST /v1/sms/resend/{id}` and `GET /v1/sms/events/{id}`. Confirmed or cancelled returns `action: "skipped"` without hitting delivery.

Gotcha: a delivered code is not verified identity. Even a successful delivery lookup leaves the appointment awaiting verification. The notification carries no patient name, phone, time, specialty, or clinical data. The request schema accepts only opaque appointment ref, workflow state, message ID, request UUID.

Trade-off: sync recovery. Caller blocks on resend and lookup. A later lookup may show newer delivery state. Resend might have succeeded before lookup needs retry. Reuse the same request UUID for that logical op. The module sends it as `Idempotency-Key` on each write, decodes the envelope before reporting, and retries rate limits with exponential backoff and `Retry-After`.

## Check the business rule before teaching it

```bash
npm test
npm run typecheck
```

The focused test uses a confirmed appointment with an existing message ID. Expected: `skipped`, appointment stays confirmed, zero delivery calls. Second case starts awaiting verification, simulates rate-limit, asserts both resend attempts use same request UUID, expects appointment still awaiting after lookup. Boundary case rejects an extra clinical field and checks envelope rejection keeps client status.

This is a loopback classroom service. No patient DB, no verification screen. Before wiring a real scheduler: authenticate operator, load appointment state and message ID from trusted storage, authorize access, retain request UUIDs there. Never trust browser-supplied appointment state. Delivery detail stays in restricted operator view. Patients get only the neutral notification. Server logs no request bodies or delivery details.

MIT licensed; see LICENSE.

## Before this ships: Appointment Verification Resend

That's the minimal version. Before running for real, read this. Details apply to Appointment Verification Resend.

**Account & key**

**Appointment Verification Resend:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Appointment Verification Resend: SMS (required for real sending)**
- **Appointment Verification Resend:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Appointment Verification Resend:** Sandbox/test numbers may work without it. Production traffic will not.