// ./lib/routes/index.js
const express = require("express");
const router = express.Router();
// const notes = require("./notes/notes.controller");
const user = require("./user/user.controller");
const customer = require("./customers/customers.controller");
const transaction = require("./transactions/transactions.controller");

// router.use("/notes", notes);
router.use("/user", user);
router.use("/customer", customer);
router.use("/transaction", transaction);

// Add more routes here if you want!
module.exports = router;
