const express = require("express");
const app = express();
const bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

require("./db");
console.log("dbdb");
const routes = require("./routes/index.js");
app.use("/", routes);

module.exports = app;
