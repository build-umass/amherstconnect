const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendEduCode, confirmEduCode } = require('../controllers/verification');

router.post('/send-edu-code', requireAuth, sendEduCode);
router.post('/confirm-edu', requireAuth, confirmEduCode);

module.exports = router;
