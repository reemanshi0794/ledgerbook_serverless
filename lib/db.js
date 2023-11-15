// ./lib/db.js
const mongoose = require("mongoose");
const {MongoClient, ServerApiVersion} = require("mongodb");

// const MONGODB_URI = "mongodb+srv://dev:dev123456@cluster0.vpnjkij.mongodb.net/?retryWrites=true&w=majority";
const MONGODB_URI_DEV = "mongodb+srv://dev:dev123456@cluster0.vpnjkij.mongodb.net/ledgerbook-dev?retryWrites=true&w=majority";

// const MONGODB_URI_PROD = "mongodb+srv://dev:dev123456@cluster0.vpnjkij.mongodb.net/ledgerbook-prod?retryWrites=true&w=majority";

const MONGODB_URI_PROD = "mongodb+srv://dev:dev123456@cluster0.tsmjsoa.mongodb.net/?retryWrites=true&w=majority";

console.log("connect to mongo", process.env.CURRENTSTAGE);
let MONGODB_URI = MONGODB_URI_DEV;
if (process.env.CURRENTSTAGE === "prod") {
  MONGODB_URI = MONGODB_URI_PROD;
}
mongoose.connect(
  MONGODB_URI,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    socketTimeoutMS: 45000,
  },
  function (err) {
    if (err) throw err;
  }
);

mongoose.connection.on("error", (e) => {
  console.log("mongo connect error!");
});
mongoose.connection.on("connected", () => {
  console.log("connected to mongo");
});
