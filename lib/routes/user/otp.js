// ./lib/routes/notes/note.js
const mongoose = require("mongoose");
const OTPSchema = new mongoose.Schema(
  {
    otp: Number,
    phoneNo: String,
    createdAt: Number,

    // this is a bug in the markdown - should not have the quotes ""
  }
  //   {timestamps: {createdAt: true, updatedAt: false}}
);
module.exports = mongoose.model("OTP", OTPSchema);
