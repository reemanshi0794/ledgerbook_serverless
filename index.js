const mongoose = require("mongoose");
const MongoClient = require("mongodb").MongoClient;

mongoose.Promise = global.Promise;
let isConnected;
const MONGODB_URI = "mongodb+srv://dev:dev123456@cluster0.vpnjkij.mongodb.net/?retryWrites=true&w=majority";
console.log("ppisConnected", isConnected);
let cachedDb = null;

// async function connectToDatabase() {
//   if (cachedDb) {
//     return cachedDb;
//   }

//   // Connect to our MongoDB database hosted on MongoDB Atlas
//   const client = await MongoClient.connect(MONGODB_URI);
//   console.log("clientclient", client);

//   // Specify which database we want to use
//   const db = await client.db("ledgerbook");

//   cachedDb = db;
//   console.log("dbdb", db);
//   return db;
// }

// module.exports.connectionToDatabase = async (event, context) => {
//   const db = await connectToDatabase();
//   console.log("dbdbdb", db);
// };

module.exports.connectToDatabase = () => {
  console.log("isConnectedisConnected", isConnected);
  if (isConnected) {
    return Promise.resolve();
  }

  return mongoose.connect(MONGODB_URI).then((db) => {
    isConnected = db.connections[0].readyState;
    console.log("isConnectedis99", isConnected);
  });
};
