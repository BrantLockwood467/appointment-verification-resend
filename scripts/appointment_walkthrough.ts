import { randomUUID } from "node:crypto";

const message_id = process.env.SMS_MESSAGE_ID;
if (!message_id) throw new Error("Set SMS_MESSAGE_ID to an existing verification message ID");
// Reuse this request ID when repeating the same logical resend.
const requestId = process.env.RESEND_REQUEST_ID ?? randomUUID();
console.log("Resend request ID:", requestId);
const response = await fetch("http://127.0.0.1:3000/appointments/resend-verification", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentRef: "lesson-appointment-42",
    appointmentState: "awaiting_verification", message_id, requestId }),
});
const result: unknown = await response.json();
if (!response.ok) throw new Error(`Appointment request returned HTTP ${response.status}`);
console.log(JSON.stringify(result, null, 2));
