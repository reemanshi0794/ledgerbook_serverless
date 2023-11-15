// ./lib/routes/notes/note.js
const mongoose = require("mongoose");
const TransactionSchema = new mongoose.Schema(
  {
    id: String,
    customerId: String,
    amount: Number,
    images: Array,
    mode: String,
    type: String,
    other_details: String,
    userId: String,
    updatedBal: Number,
    createdAt: Number,
    customerName: String,
    date: Number,
  },
  {timestamps: {createdAt: false, updatedAt: true}}
);

module.exports = mongoose.model("Transaction", TransactionSchema);
