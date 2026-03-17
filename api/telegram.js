const { bot, sendMessageToUser } = require('../telegramBot');

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tempId, name, email, phone, address } = req.body;

    const msgToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email}
📞 Phone: ${phone}
🏠 Address: ${address}
🆔 Temp ID: ${tempId}`;

    // Send to admin
    await bot.sendMessage(adminId, msgToAdmin);

    // Notify user if linked
    try {
      await sendMessageToUser(
        tempId,
        `👋 Hi ${name}! We’ve received your delivery details.\n` +
        `Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).`
      );
    } catch {
      console.log(`User not linked yet for Temp ID: ${tempId}`);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    return res.status(500).json({ error: "Failed to send Telegram message" });
  }
};
