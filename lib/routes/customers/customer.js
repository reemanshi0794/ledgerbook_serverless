const mongoose = require("mongoose");
const CustomerSchema = new mongoose.Schema({
  fullName: String,
  email: String,
  phone: String,
  address: String,
  image: String,
  password: String,
  other_details: String,
  userId: String,
  id: String,
  balance: Number,
  last_trans_date: Number,
  last_trans_id: String,
  last_trans_amount: Number,
  creditLimit: String,
  defaultTransactionAmt: Number,
  openingBal: Number,
  createdAt: Number,
});
module.exports = mongoose.model("Customer", CustomerSchema);
