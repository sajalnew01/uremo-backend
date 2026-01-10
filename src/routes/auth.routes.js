const express = require("express");
const { signup, login, makeAdmin } = require("../controllers/auth.controller");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/make-admin", makeAdmin);

module.exports = router;
