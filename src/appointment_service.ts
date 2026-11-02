import { createServer } from "node:http";
import { z } from "zod";
import { appointmentRequest, deliveryClient, DeliveryError, resendForAppointment } from "./verification_resend.ts";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the lesson service");
const infrai = deliveryClient(key);

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  function reply(status: number, value: unknown) {
    res.writeHead(status);
    res.end(JSON.stringify(value));
  }
  if (req.method !== "POST" || req.url !== "/appointments/resend-verification") {
    reply(404, { error: "Route not found" });
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 8192) {
        reply(413, { error: "Request body exceeds 8 KiB" });
        return;
      }
    }
    const input = appointmentRequest.parse(JSON.parse(body));
    reply(200, await resendForAppointment(input, infrai));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      reply(400, { error: "Supply a valid appointment verification request" });
    } else if (error instanceof DeliveryError) {
      // Keep provider detail available to operators without putting it in patient notifications.
      reply(error.status >= 400 && error.status < 500 ? error.status : 502,
        { error: "Delivery request rejected", detail: error.detail });
    } else {
      reply(502, { error: "Delivery result could not be read" });
    }
  }
});

server.listen(3000, "127.0.0.1", () => {
  console.log("Appointment lesson listening at http://127.0.0.1:3000");
});
