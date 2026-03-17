// server/routes/notifyRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();

// ---------------- POST /email ----------------
router.post("/email", async (req, res) => {
  try {
    const { email, tempId, name } = req.body;

    if (!email || !tempId || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const BREVO_KEY = process.env.BREVO_KEY;

    if (!BREVO_KEY) {
      console.error("BREVO_KEY is missing from environment variables");
      return res.status(500).json({ error: "Email service not configured" });
    }

    const SENDER_EMAIL =
      process.env.BREVO_SENDER_EMAIL || "support@rapidroute.com";

    const SENDER_NAME =
      process.env.BREVO_SENDER_NAME || "Rapid Route Logistics";

    const LOGO_URL = process.env.BREVO_LOGO_URL || "";

    // ---------------- Email HTML ----------------
    const htmlContent = `
      <div style="font-family:Arial,sans-serif;background:#f6f8fa;padding:20px;">
        <div style="max-width:600px;margin:auto;background:white;border-radius:10px;overflow:hidden;">
          
          <div style="background:#007bff;padding:15px;text-align:center;">
            ${
              LOGO_URL
                ? `<img src="${LOGO_URL}" alt="Rapid Route Logo" style="height:50px;" />`
                : ""
            }
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
              <strong>Kindly reply directly to this email</strong> to confirm your payment
              or request payment instructions.
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

    const msg = {
      sender: {
        email: SENDER_EMAIL,
        name: SENDER_NAME,
      },
      to: [{ email }],
      subject: "Action Required: Complete Your Shipment Payment",
      htmlContent,
    };

    // ---------------- Send Email ----------------
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      msg,
      {
        headers: {
          accept: "application/json",
          "api-key": BREVO_KEY,
          "content-type": "application/json",
        },
      }
    );

    console.log("Brevo response:", response.data);

    res.json({
      success: true,
      message: "Email sent successfully",
    });

  } catch (err) {

    // Better debugging
    console.error(
      "Brevo email error:",
      err.response?.data || err.message
    );

    res.status(500).json({
      error: "Failed to send email",
    });
  }
});

module.exports = router;
