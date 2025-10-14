// server/routes/notifyRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();


// --- Google Cloud Translate Setup ---
const { Translate } = require("@google-cloud/translate").v2;
const translate = new Translate({ key: process.env.GOOGLE_API_KEY });

async function translateText(text, targetLang) {
  if (!targetLang || targetLang === "en") return text; // no translation needed
  try {
    const [translation] = await translate.translate(text, targetLang);
    return translation;
  } catch (err) {
    console.error("Translation error:", err);
    return text; // fallback to original
  }
}

// ---------------- POST /email ----------------
router.post("/email", async (req, res) => {
  try {
    const { email, tempId, name, language } = req.body;
    if (!email || !tempId || !name)
      return res.status(400).json({ error: "Missing required fields" });

    const BREVO_KEY = process.env.BREVO_KEY;
    const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "support@rapidroute.com";
    const SENDER_NAME = process.env.BREVO_SENDER_NAME || "Rapid Route Logistics";
    const LOGO_URL = process.env.BREVO_LOGO_URL;

    // ---------------- Prepare email content ----------------
    let htmlContent = `
      <div style="font-family:Arial,sans-serif;background:#f6f8fa;padding:20px;">
        <div style="max-width:600px;margin:auto;background:white;border-radius:10px;overflow:hidden;">
          <div style="background:#007bff;padding:15px;text-align:center;">
            <img src="${LOGO_URL}" alt="Rapid Route Logo" style="height:50px;" />
          </div>
          <div style="padding:25px;">
            <h2 style="color:#007bff;">Receiver Details Received</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>We’ve successfully received your details linked to the shipment below:</p>
            <h3 style="color:#007bff;text-align:center;">${tempId}</h3>

            <p>
              To complete your shipment process, please ensure that the required payment has been made. 
              Once payment is confirmed, your parcel will be processed and scheduled for dispatch.
            </p>

            <p>
              <strong>Kindly reply directly to this email</strong> to confirm your payment or to request payment instructions.
              Our support team will respond promptly to guide you through the process.
            </p>

            <p>If you’ve already made payment, kindly ignore this message.</p>

            <hr style="margin:25px 0;border:none;border-top:1px solid #eee;">
            <p style="font-size:13px;color:#666;text-align:center;">
              Need help? Contact us at 
              <a href="mailto:${SENDER_EMAIL}" style="color:#007bff;text-decoration:none;">
                ${SENDER_EMAIL}
              </a>
            </p>
          </div>
          <div style="background:#f1f1f1;text-align:center;padding:10px;font-size:12px;color:#555;">
            © ${new Date().getFullYear()} ${SENDER_NAME}. All rights reserved.
          </div>
        </div>
      </div>
    `;

    let subject = "Action Required: Complete Your Shipment Payment";

    // ---------------- Translate if needed ----------------
    htmlContent = await translateText(htmlContent, language);
    subject = await translateText(subject, language);

    // ---------------- Send via Brevo ----------------
    const msg = {
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email }],
      subject,
      htmlContent,
    };

    await axios.post("https://api.brevo.com/v3/smtp/email", msg, {
      headers: {
        "api-key": BREVO_KEY,
        "Content-Type": "application/json",
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Brevo email error:", err.message);
    res.status(500).json({ error: "Failed to send email" });
  }
});

module.exports = router;
