// ./lib/routes/notes/note.js
const mongoose = require("mongoose");
const WeeklySchema = new mongoose.Schema({
  weekDate: Number,
  name: String,
  lastTransId: String,
  customerId: String,
  userId: String,
  id: String,
  updatedBal: Number,

  // this is a bug in the markdown - should not have the quotes ""
});

module.exports = mongoose.model("Weekly", WeeklySchema);
