require('dotenv').config();
const express = require('express');
const router = express.Router();
const { bot, sendMessageToUser } = require('../telegramBot');

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// Notify admin + start chat with user
router.post('/telegram', async (req, res) => {
  try {
    const { tempId, name, email, phone, address } = req.body;

    const msgToAdmin = `
    📦 *New Receiver Submission*
    ━━━━━━━━━━━━━━━
    👤 *Name:* ${name}
    📧 *Email:* ${email}
    📞 *Phone:* ${phone}
    🏠 *Address:* ${address}
    🆔 *Temp ID:* ${tempId}
    `;
    await bot.sendMessage(adminId, msgToAdmin, { parse_mode: "Markdown" });


    // Optional: send message to user if already linked
    try {
      await sendMessageToUser(
        tempId,
        `👋 Hi ${name}! We’ve received your delivery details.\n` +
        `Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).`
      );
    } catch {
      console.log(`User not linked yet for Temp ID: ${tempId}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});


module.exports = router;
