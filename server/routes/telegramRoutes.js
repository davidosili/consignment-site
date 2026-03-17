// routes/telegramRoutes.js
const express = require('express');
const router = express.Router();
const { sendTelegram } = require('../controllers/telegramController');

router.post('/', sendTelegram);

module.exports = router;
