// ./lib/routes/notes/note.js
const mongoose = require("mongoose");
const UserSchema = new mongoose.Schema({
  id: String,
  name: String,
  email: String,
  businessName: String,
  phoneNo: String,
  address: String,
  image: String,
  password: String,
  ownerId: String,
  creditLimit: String,
  createdAt: Number,

  // this is a bug in the markdown - should not have the quotes ""
});

module.exports = mongoose.model("User", UserSchema);
