const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUser, updateUser } = require('../controllers/users');

router.get('/:uid', requireAuth, getUser);
router.patch('/:uid', requireAuth, updateUser);

module.exports = router;
