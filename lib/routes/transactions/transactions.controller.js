const express = require("express");
const transactionController = express.Router();
const TransactionTable = require("./transactions");
const CustomerTable = require("../customers/customer");
const UserTable = require("../user/user");
const Weekly = require("../weekly/weekly");
var md5 = require("md5");
const {getUserByUserId} = require("../user/user.controller");
var momentTime = require("moment-timezone");
const moment = require("moment");
const PDFDocument = require("pdfkit-table");
const AWS = require("aws-sdk");
// const fs = require("fs");

const res = require("express/lib/response");
const s3 = new AWS.S3({
  // apiVersion: '2006-03-01',
  // signatureVersion: 'v2',
  region: "ap-south-1",
  accessKeyId: "AKIAXKR26MDHMWBO2352",
  secretAccessKey: "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",
});

const createNewTransaction = async (req, res, transactionMode) => {
  const parametersReceived = req.body;
  console.log("createTransaction parametersReceived", parametersReceived);
  const {customerId, type, amount} = parametersReceived;
  const transId = md5(Date.now());
  parametersReceived.id = transId;
  parametersReceived.createdAt = Date.now();
  parametersReceived.date = parseInt(parametersReceived?.date) || Date.now();
  console.log("Date.now()", Date.now());
  parametersReceived.isDeleted = false;
  if (transactionMode !== "OPENING_BAL") {
    if (!parametersReceived.userId) {
      const body = {
        error: "user id does not exist",
        status: 400,
      };
      res.status(400).send(body);
      return;
    }
    const ifOwner = await getUserByUserId(parametersReceived.userId);
    console.log("ifOwnerifOwner", ifOwner);
    if (!ifOwner) {
      const body = {
        error: "Owner not found",
        status: 400,
      };
      res.status(400).send(body);
      return;
    }
  }
  var response;
  const customerResult = await CustomerTable.findOne({id: customerId});
  console.log("customerResult", customerResult);
  if (customerResult) {
    const {balance, fullName} = customerResult;
    let updatedBal = parseInt(balance) || 0;
    console.log("updatedBalupdatedBal", updatedBal);
    if (transactionMode === "OPENING_BAL") {
      updatedBal = amount;
    } else {
      let transAmount = amount;
      if (type === "DEBIT") {
        transAmount = -amount;
      }

      updatedBal = updatedBal + transAmount;
    }
    console.log("updatedBal11", updatedBal);

    parametersReceived.updatedBal = parseInt(updatedBal);
    parametersReceived.customerName = fullName;
    const result = await TransactionTable.create(parametersReceived);
    console.log("resultresult", result);
    if (result) {
      updateWeeklyBal(result, amount, transId, customerId, parametersReceived.userId);
      return updateCustomerBal(res, customerId, transId, amount, updatedBal, transactionMode);
    } else {
      callback(new Error("Couldn't add customer details."));
    }
  } else {
    const body = {
      error: "Customer does not exist",
      status: 400,
    };
    res.status(400).send(body);
    return;
  }
};

transactionController.post("/createTransaction", async (req, res, next) => {
  createNewTransaction(req, res);
});
const updateWeeklyBal = async (transaction, amount, transId, customerId, userId) => {
  try {
    const {createdAt} = transaction;
    const transAt = createdAt;
    console.log("transAttransAt", transAt);
    const data = await Weekly.findOne({
      $and: [{customerId: customerId}, {userId: userId}, {weekDate: {$lte: transAt}}],
    }).sort({weekDate: 1});
    console.log("weekData99", data);
    const parametersReceived = {
      updatedBal: amount,
      lastTransId: transId,
      id: transAt.toString(),
      weekDate: transAt,
      customerId: customerId,
      userId: userId,
    };

    if (data) {
      let updatedBal = data.updatedBal || 0;
      if (transaction.mode === "OPENING_BAL") {
        updatedBal = amount;
      } else {
        let transAmount = amount;
        if (transaction.type === "DEBIT") {
          transAmount = -amount;
        }
        updatedBal = data.updatedBal + transAmount;
      }
      console.log("data?.weekDate", data?.weekDate);
      const lastAddedDate = moment(new Date(data?.weekDate), "DD-MM-YYYY");
      console.log("lastAddedDate", lastAddedDate);
      const nowDate = moment(new Date(), "DD-MM-YYYY");
      console.log("nowDatenowDate", nowDate);

      const diff = nowDate.diff(lastAddedDate, "days");
      console.log("diffdiff", diff);

      if (diff <= 7) {
        console.log("updatedData");

        const updatedData = await Weekly.updateOne({_id: data._id}, {updatedBal: updatedBal, lastTransId: transId}, {upsert: true});
        console.log("l2222", updatedData);
      } else {
        parametersReceived.updatedBal = updatedBal;
        const result = await Weekly.create(parametersReceived);
        console.log("result44", result);
      }
    } else {
      const result = await Weekly.create(parametersReceived);
      console.log("result99", result);
    }
  } catch (err) {
    console.log("updateWeeklyBal error", err);
  }
};

function generateHeader(doc, length) {
  doc.image("logo.png", 50, 45, {width: 50}).fillColor("#444444").fontSize(20).text("Ledgerbook Inc.", 110, 57).moveDown();
}
const updateCustomerBal = async (res, id, transId, amount, balance, transactionMode) => {
  console.log("updateCustomerBalupdateCustomerBal");
  const updatedCustomerData = await CustomerTable.updateOne({id: id}, {balance: balance, last_trans_date: Date.now(), last_trans_id: transId, last_trans_amount: amount}, {new: true, upsert: true, multi: true});
  console.log("updateCustomerBalAmt", updatedCustomerData);

  try {
    if (transactionMode !== "OPENING_BAL") {
      if (updatedCustomerData) {
        console.log("updatedCustomerData123", updatedCustomerData);
        const body = {
          message: "Added successfully",
          status: 200,
          transaction_id: transId,
        };
        console.log("sendsend");
        res.status(200).json(body);
        return;
      } else {
        const body = {
          error: "Unable to update customer balance",
          status: 400,
        };
        res.status(400).json(body);
        return;
      }
    } else {
      return;
    }
  } catch (error) {
    console.log("error", error);
    const body = {
      error: "Something went wrong",
      status: 400,
    };
    res.status(400).json(body);
    return;
  }
};
const getTransactionsByCustomerId = async (customerId, type) => {
  console.log("customerId", type, customerId);
  let transactions = [];
  if (type) {
    transactions = await TransactionTable.find({
      $and: [{customerId: customerId}, {type: type.toUpperCase()}],
    });
  } else {
    transactions = await TransactionTable.find({customerId}).sort({createdAt: 1});
  }
  console.log("transactions33transactions", transactions);

  return transactions;

  // let object = {
  //   KeyConditionExpression: "#customerIdIdx = :customerId",
  //   IndexName: "customerIdIdx",
  //   ExpressionAttributeNames: {
  //     "#customerIdIdx": "customerId",
  //   },
  //   FilterExpression: "isDeleted = :isDeleted",
  //   ExpressionAttributeValues: {
  //     ":customerId": customerId,
  //     ":isDeleted": false,
  //   },
  //   TableName: process.env.TRANSACTIONS_TABLE,
  //   // Limit: 1,
  //   ScanIndexForward: false, //DESC ORDER, Set 'true' if u want asc order
  // };

  // return {
  //   KeyConditionExpression: '#customerIdIdx = :customerId',
  //   IndexName: 'customerIdIdx',
  //   ExpressionAttributeNames: {
  //     '#customerIdIdx': 'customerId',
  //     '#type': 'type',
  //   },
  //   ExpressionAttributeValues: {
  //     ':customerId': customerId,
  //     ':type': type.toUpperCase(),
  //   },
  //   TableName: 'transactions-table',
  //   FilterExpression: '#type = :type',
  //   // Limit: 1,
  // };
};
const getTransactionsOfCustomer = async (customerId, req, res) => {
  console.log("customerId", customerId);
  const customer = await CustomerTable.findOne({id: customerId});
  console.log("customercustomer", customer);
  const data = await getTransactionsByCustomerId(customerId, req.query?.type);
  console.log(data, "fjdskfjd");
  // const data = await dynamoDb.query(params).promise();
  console.log("datadata", data);
  if (!customer) {
    res.status(400).send({status: 400, error: "Customer not found with this id"});
    return;
  }

  if (data && data.length) {
    const body = {data: data, status: 200, customerBalance: parseInt(customer.balance), message: "Transactions fetched successfully"};
    res.status(200).send(body);
    return;
  } else {
    const body = {
      status: 200,
      message: "No transactions found",
    };
    res.status(200).send(body);
  }
};

const getTeamMembersByOwnerId = async (ownerId, options) => {
  console.log("ownerIdownerId", ownerId);
  const teamMembers = await UserTable.find({ownerId: ownerId});
  console.log("teamMembersteamMembers", teamMembers);
  return teamMembers;
};

const getAllTransactionwithBal = async (userIds, transactionsReturned, teamMemberIdWithName) => {
  const transactions = JSON.parse(JSON.stringify(transactionsReturned));

  // const firstTrans = transactions[transactions.length - 1].createdAt;
  // const weekData = await getWeeklyBal(userIds, firstTrans);
  // console.log("weekDataweekData", weekData);
  // const updatedBal = weekData.updatedBal;
  // let latestBal = updatedBal;
  // const transactionsArr = transactions.map((trans) => {
  //   if (trans.type === "CREDIT" || trans.type === "OPENING_BALANCE") {
  //     trans.updatedBal = latestBal + trans.amount;
  //     latestBal = trans.updatedBal;
  //     console.log("updatedBal + trans.amount", latestBal + trans.amount);
  //   } else {
  //     console.log("updatedBal + trans.amount", latestBal - trans.amount);
  //     trans.updatedBal = latestBal - trans.amount;
  //     latestBal = trans.updatedBal;
  //   }
  const transactionsArr = transactions.map((trans) => {
    const user = teamMemberIdWithName.find((member) => member.id === trans.userId);

    return {...trans, userName: user.name};
  });
  console.log("kktransactionsArr", transactionsArr);
  return transactionsArr;
};

const getTransactionsByUserIds = async (userIds, queryStringParameters, teamMemberIdWithName, res, obj) => {
  try {
    console.log("idssidss", userIds, teamMemberIdWithName);

    let transactions = [];
    console.log("queryStringParameters", queryStringParameters);
    if (queryStringParameters?.fromDate && queryStringParameters?.toDate) {
      const {fromDate, toDate} = queryStringParameters;
      const fromDateVal = parseInt(fromDate);
      const toDateVal = parseInt(toDate);
      const tableName = process.env.TRANSACTIONS_TABLE;
      const alltransactions = await TransactionTable.find({
        $and: [{userId: {$in: userIds}}, {createdAt: {$gte: queryStringParameters.fromDate, $lt: queryStringParameters.toDate}}],
      })
        .sort({createdAt: -1})
        .lean();
      console.log("alltransactions00", alltransactions);

      if (alltransactions.length) {
        console.log("objobj", alltransactions);
        const transactionsArr = getAllTransactionwithBal(userIds, alltransactions, teamMemberIdWithName);
        transactions = transactionsArr;
      } else {
        transactions = alltransactions;
      }

      // const firstTrans = alltransactions[alltransactions.length - 1].createdAt;
      // console.log("firstTransfirstTrans", firstTrans);

      // const weekData = await getWeeklyBal(userIds, firstTrans);
      // console.log("kkkkweekData", weekData);

      // const updatedBal = weekData.updatedBal;
      // console.log("updatedBalupdatedBal", updatedBal);
      // const transactionsArr = alltransactions.map((trans) => {
      //   if (trans.type === "CREDIT" || trans.type === "OPENING_BALANCE") {
      //     trans.updatedBal = updatedBal + trans.amount;
      //   } else {
      //     trans.updatedBal = updatedBal - trans.amount;
      //   }
      //   const user = teamMemberIdWithName.find((member) => member.id === trans.userId);

      //   return {...trans, userName: user.name};
      // });
      // console.log("llllltransactionsArr", transactionsArr);
      // const actualTransactions = transactionsArr.filter((trans)=> trans)

      // str = `SELECT userId, createdAt,type, customerName, amount,updatedBal  FROM "${tableName}" WHERE "userId" IN [${idStr}] and createdAt BETWEEN ${fromDateVal} and ${toDateVal} `;
    } else {
      const allTransactions = await TransactionTable.find({userId: {$in: userIds}}).sort({createdAt: -1});
      console.log("user all trans", allTransactions);

      const transactionsArr = await getAllTransactionwithBal(userIds, allTransactions, teamMemberIdWithName);
      transactions = transactionsArr;

      console.log("rannnnn", transactions);
    }

    const userTransactions = transactions;

    return userTransactions;
  } catch (err) {
    const body = {
      status: 400,
      error: err,
    };
    console.log("errrror", err);
    res.status(400).send(body);
    // return sendFailureResponse(body);
  }
};

const uploadToS3 = async (type, doc, path, resp) => {
  try {
    var s3params = {
      Bucket: "ledgerbook-transaction-assets",
      Key: path,
      Body: doc,
      CacheControl: "public, max-age=86400",
    };
    console.log("uploadToS3");
    const stored = await s3.upload(s3params).promise();
    // resolve(res);
    console.log("responseee", stored);
    if (stored?.Location) {
      const body = {
        message: `${type} returned successfully`,
        status: 200,
        link: stored.Location,
      };
      resp.status(200).send(body);
    } else {
      resp.status(400).send({error: "Error in uploading file"});
    }

    return;
  } catch (err) {
    resp.status(400).send(err);
    console.log("errrr", err);
  }
};
const convertToCsv = (data) => {
  console.log("datadata", data);
  //   const csvRows = [];
  //   const headers = Object.keys(data[0]);
  const headers = ["createdAt", "userName", "customerName", "debit", "credit"];
  //   csvRows.push(headers.join(','));
  //   console.log('csvRowscsvRows', csvRows);
  const csvRows = ["Date,User Name, Customer Name,Debit,Credit"];
  for (const row of data) {
    const values = headers.map((header) => {
      let val = row[header] || "";

      if (header === "createdAt") {
        const date = moment(row[header]).format("DD/MM/YYYY");
        val = date;
      }
      if (header === "debit") {
        if (row["type"] === "DEBIT") {
          val = row["amount"];
        } else {
          val = 0;
        }
      }
      if (header === "credit") {
        if (row["type"] === "CREDIT") {
          val = row["amount"];
        } else {
          val = 0;
        }
      }
      // if (header === "balance") {
      //   val = row["updatedBal"];
      // }

      return `"${val}"`;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
};
const createPdf = async (items, type, res) => {
  console.log("createPdfitemsitems", items);
  try {
    // const customersArr = items.map((item) => item.customerId);

    const newArr = [];

    const columns = [
      {label: "Sr No.", property: "srno", headerColor: "#2C53D6", headerOpacity: 0.5},
      {label: "Date", property: "date", headerColor: "#FF0000", headerOpacity: 0.5},
      {label: "User name", property: "userName", headerColor: "#2C53D6", headerOpacity: 0.5},
      {label: "Customer Name", property: "name", headerColor: "#FF0000", headerOpacity: 0.5},
      {label: "Debit", property: "debit", headerColor: "#2C53D6", headerOpacity: 0.5},
      {label: "Credit", property: "credit", headerColor: "#FF0000", headerOpacity: 0.5},
      // {label: "Balance", property: "balance", headerColor: "#2C53D6", headerOpacity: 0.5},
    ];
    let debitAmount = 0;
    let creditAmount = 0;
    items.map((item, index) => {
      console.log("itemitemitem", item);
      const arr = [];
      const createdAt = item["createdAt"];
      arr.push(index + 1);

      // var date1 = moment.unix(createdAt).format("MM/DD/YYYY");

      // const date = moment(createdAt).format("DD-MM-YYYY hh:mm:ss");
      const date = momentTime.tz(moment.unix(createdAt / 1000), "Asia/Calcutta").format("ddd MMMM D YYYY HH:mm:ss");

      console.log("datedate", date);
      arr.push(date);
      arr.push(item.userName);

      arr.push(item["customerName"]);

      console.log("pppp", item["amount"], item["updatedBal"]);
      const amount = item["amount"].toLocaleString();
      const updatedBalance = item["updatedBal"].toLocaleString();

      if (item.type === "DEBIT") {
        arr.push(amount);
        debitAmount = debitAmount + item["amount"];
      } else {
        arr.push(0);
      }
      if (item.type === "CREDIT") {
        arr.push(amount);
        creditAmount = creditAmount + item["amount"];
      } else {
        arr.push(0);
      }
      // arr.push(updatedBalance);

      console.log("arrarrarr", creditAmount, debitAmount, arr);
      newArr.push(arr);
    });
    let totalBal = 0;
    totalBal = -debitAmount + creditAmount;
    if (totalBal < 0) {
      totalBal = totalBal + " (DEBIT)";
    }

    let doc = new PDFDocument({margin: 20, size: "A4"});
    generateHeader(doc, newArr.length); // Invoke `generateHeader` function.

    // doc.pipe(fs.createWriteStream("./document.pdf"));

    const table = {
      title: {label: "Transactions", fontSize: 20, color: "#2C53D6"},
      subtitle: {label: `Total Transactions: ${newArr.length}                                    Total Amount: ${totalBal} `, fontSize: 10},

      headers: columns,
      divider: {
        header: {disabled: true},
        horizontal: {disabled: false, width: 1, opacity: 1},
        padding: 15,
        columnSpacing: 10,
      },
      options: {
        width: 300,
      },

      rows: newArr,
    };
    await doc.table(table, {
      width: 100,
      columnsSize: [40, 100, 60, 60, 60, 60],
    });

    doc.end();
    let path = `${Date.now()}.pdf`;

    uploadToS3(type, doc, path, res);
  } catch (err) {
    console.log("errrrr", err);
  }
};
const getDocOfTransactions = (docType, transData, res) => {
  console.log("transData", transData);
  if (transData && transData?.length) {
    if (docType === "csv") {
      let path = `${Date.now()}.csv`;
      const file = convertToCsv(transData);
      uploadToS3(docType, file, path, res);
    } else {
      let path = `${Date.now()}.pdf`;
      createPdf(transData, docType, res);
    }
  } else {
    const body = {
      message: "Transactions not found",
      status: 200,
    };
    res.status(200).send(body);
  }
};

const getandSendTransactions = async (ids, queryStringParameters, docType, teamMemberIdWithName, res) => {
  console.log("ppteamMemberIdWithName", ids, teamMemberIdWithName);
  const allTransactions = await getTransactionsByUserIds(ids, queryStringParameters, teamMemberIdWithName, res);
  console.log("allTransactions111", allTransactions, Array.isArray(allTransactions));
  if (allTransactions.length) {
    getDocOfTransactions(docType, allTransactions, res);
  } else {
    const body = {
      status: 200,
      message: "No transactions found",
    };
    res.status(400).send(body);
  }
};
const getWeeklyBal = async (ids, firstTrans) => {
  console.log("getWeeklyBal66", ids);
  const data = await Weekly.findOne({$and: [{userId: {$in: ids}, weekDate: {$lte: firstTrans}}]}).sort({createdAt: -1});
  console.log("datttta", data);
  if (data) {
    return data;
    console.log("ppppp,", data.updatedBal);
  }
};

const getAllOwnerTransactions = async (req, docType, res) => {
  try {
    console.log("pppp", docType);
    const ownerId = req.query?.ownerId;
    console.log("ownerIdownerId11", ownerId);

    const ownerResult = await getUserByUserId(ownerId);
    console.log("ownerResult1144", ownerResult);
    if (ownerResult) {
      console.log("ownerResult99", ownerResult);

      const allTeamMembersOfOwner = await getTeamMembersByOwnerId(ownerId);
      console.log("llteamMembers", allTeamMembersOfOwner);
      //   const allTeamMembersOfOwner = await dynamoDb.query(params).promise();
      //   console.log("allTeamMembersOfOwner", allTeamMembersOfOwner);
      if (allTeamMembersOfOwner?.length) {
        const teamMemberIds = allTeamMembersOfOwner.map((item) => item.id);
        const teamMemberIdWithName = allTeamMembersOfOwner.map((item) => ({
          id: item.id,
          name: item.name,
        }));
        console.log("teamMemberIdWithName", teamMemberIdWithName);
        teamMemberIds.push(ownerId);
        teamMemberIdWithName.push({name: ownerResult.name, id: ownerResult.id});
        console.log("teamMemberIdWithNameteamMemberIdWithName", teamMemberIdWithName);

        return getandSendTransactions(teamMemberIds, req.query, docType, teamMemberIdWithName, res);
      } else {
        let teamMemberIdWithName = [{name: ownerResult.name, id: ownerResult.id}];
        // const weekData = await getWeeklyBal([ownerId], req.query);
        // const obj = {
        //   fromDate: weekData.weekDate,
        //   toDate: req.query.toDate,
        //   weekData,
        // };
        return getandSendTransactions([ownerId], req.query, docType, teamMemberIdWithName, res);
      }
    } else {
      const body = {
        error: "Owner not found",
        status: 400,
      };
      res.status(400).send(body);
    }
  } catch (err) {
    console.log("eeeeee", err);
  }
};

const modifyCustomerBalance = async (transaction, params) => {
  const customer = await CustomerTable.findOne({id: transaction.customerId});
  console.log("modifyCustomerBalance", customer, transaction);
  let customerToUpdate = {};
  let newBal = parseInt(customer.balance);

  if (params) {
    if (params.amount) {
      if (transaction.type === "DEBIT") {
        newBal = parseInt(customer.balance) + transaction.amount - params.amount;
      } else {
        newBal = parseInt(customer.balance) - transaction.amount + params.amount;
      }
    }
    if (params.type && transaction.type !== params.type) {
      let amt = params.amount || transaction.amount;
      console.log("amtamt", amt);

      if (transaction.type === "DEBIT") {
        newBal = parseInt(customer.balance) + transaction.amount + amt;
      } else {
        newBal = parseInt(customer.balance) - transaction.amount - amt;
      }
    }

    console.log("modifyCustomerBalance22", params.amount);

    console.log("newBalnewBal", newBal);
    let customerObj = {
      ...params,
      balance: newBal,
      last_trans_amount: params.amount,
    };
    if (transaction.mode === "OPENING_BALANCE") {
      customerObj.openingBal = params.amount || 0;
    }
    if (customer.last_trans_id === transaction.id) {
      customerToUpdate = await CustomerTable.updateOne({id: transaction.customerId}, customerObj, {upsert: true});
    } else {
      customerObj = {
        ...params,
        last_trans_amount: params.amount,
        balance: newBal,
      };
      if (transaction.mode === "OPENING_BALANCE") {
        customerObj.openingBal = params.amount;
      }
      customerToUpdate = await CustomerTable.updateOne({id: transaction.customerId}, customerObj, {upsert: true, multi: true});
      console.log("if id not equal", customerToUpdate);
    }
    console.log("ppcustomerToUpdate", customerToUpdate);
  } else {
    console.log("CustomerTable8787", customer.balance, transaction.amount);
    let customerBal = parseInt(customer.balance) - transaction.amount;
    let transAmt = transaction.amount;
    if (parseInt(customer.balance) === 0) {
      customerBal = 0;
    } else {
      if (transaction.type === "DEBIT") {
        transAmt = -transAmt;
      }
      customerBal = parseInt(customer.balance) - transAmt;
    }

    customerToUpdate = await CustomerTable.updateOne({id: transaction.customerId}, {balance: customerBal}, {upsert: true});
    console.log("customerToUpdate", customerToUpdate);
  }

  return customerToUpdate;
  console.log("customerToUpdate", customerToUpdate);
};

const modifyTransaction = async (transaction, newTransactionData) => {
  console.log("modifyTransaction", transaction, newTransactionData);
  const newBal = transaction.updatedBal - transaction.amount + newTransactionData.amount;
  console.log("newBalnewBal", newBal);

  const data = {...newTransactionData, updatedBal: newBal};
  console.log("dataa", data);
  const updatedTransaction = await TransactionTable.updateOne({id: transaction.id}, data, {upsert: true});
  console.log("updatedTransaction", updatedTransaction);
  return updatedTransaction;
};

const getTransactionDateDiff = async (transactionToUpdate) => {
  const transactionDate = transactionToUpdate.createdAt;
  console.log("transactionDate", transactionDate);
  const transDate = moment(new Date(transactionDate), "DD-MM-YYYY");
  console.log("lastAddedDate", transDate);
  const nowDate = moment(new Date(), "DD-MM-YYYY");
  console.log("nowDatenowDate", nowDate);

  const diff = nowDate.diff(transDate, "days");

  console.log("diffdiff", diff);
  return diff;
};
transactionController.post("/deleteTransaction/:transactionId", async (req, res, next) => {
  const {transactionId} = req.params;
  const transactionToUpdate = await TransactionTable.findOne({id: transactionId});
  console.log("kktransactionToUpdate", transactionToUpdate);
  if (transactionToUpdate) {
    const diff = await getTransactionDateDiff(transactionToUpdate);
    console.log("transactionToUpdate22", transactionToUpdate, diff);
    if (diff <= 7) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      console.log("sevenDaysAgosevenDaysAgo", sevenDaysAgo);

      console.log("diff less than 7");
      const weekData = await Weekly.findOne({customerId: transactionToUpdate.customerId, userId: transactionToUpdate.userId, $and: [{weekDate: {$lte: transactionToUpdate.createdAt}}, {weekDate: {$gte: sevenDaysAgo}}]}).sort({weekDate: 1});

      const nextweekData = await Weekly.findOne({customerId: transactionToUpdate.customerId, userId: transactionToUpdate.userId, weekDate: {$gt: transactionToUpdate.createdAt}}).sort({weekDate: 1});
      console.log("weekDataweekData", weekData, nextweekData);
      if (weekData) {
        const balToUpdate = weekData.updatedBal - transactionToUpdate.amount;
        const updateweekData = await Weekly.updateOne({id: weekData.id}, {updatedBal: balToUpdate}, {new: true, upsert: true});
        console.log("updateweekData", updateweekData);

        if (nextweekData) {
          const balToUpdate = nextweekData.updatedBal - transactionToUpdate.amount;
          const updateNextweekData = await Weekly.updateOne({id: nextweekData.id}, {updatedBal: balToUpdate}, {new: true, upsert: true});
          console.log("updateNextweekData", updateNextweekData);
        }
        const updatedcustomer = await modifyCustomerBalance(transactionToUpdate);

        const deletedTransactionResult = await TransactionTable.deleteOne({id: transactionId});
        console.log("deletedTransactionResult", deletedTransactionResult);

        console.log("updatedcustomer2323", updatedcustomer);
        if (deletedTransactionResult && updatedcustomer.modifiedCount) {
          const body = {
            error: "Transaction deleted successfully",
            status: 200,
          };
          res.status(200).send(body);
        }
      }
    } else {
      const body = {
        error: "Cannot update transaction which is more than 1 week before",
        status: 400,
      };
      res.status(400).send(body);
    }
  } else {
    const body = {
      error: "Transaction not found",
      status: 400,
    };
    res.status(400).send(body);
  }
});
transactionController.post("/updateTransaction/:transactionId", async (req, res, next) => {
  const {transactionId} = req.params;
  const transactionToUpdate = await TransactionTable.findOne({id: transactionId});
  if (transactionToUpdate) {
    console.log("kktransactionToUpdate", transactionToUpdate);
    const diff = await getTransactionDateDiff(transactionToUpdate);
    console.log("pppdiff", diff);
    if (diff <= 7) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      console.log("sevenDaysAgo22", sevenDaysAgo, typeof sevenDaysAgo);

      if (req.body?.amount) {
        console.log("amountamount", req.body?.amount);
        const weekData = await Weekly.findOne({customerId: transactionToUpdate.customerId, userId: transactionToUpdate.userId, $and: [{weekDate: {$lte: transactionToUpdate.createdAt}}, {weekDate: {$gte: sevenDaysAgo}}]}).sort({weekDate: 1});

        // next week data
        const nextweekData = await Weekly.findOne({customerId: transactionToUpdate.customerId, userId: transactionToUpdate.userId, weekDate: {$gt: transactionToUpdate.createdAt}}).sort({weekDate: 1});

        console.log("weekDataweekData", weekData, nextweekData);

        if (weekData) {
          const balToUpdate = weekData.updatedBal - transactionToUpdate.amount + req.body.amount;
          const updateweekData = await Weekly.updateOne({id: weekData.id}, {updatedBal: balToUpdate}, {new: true, upsert: true});
          console.log("updateweekData", updateweekData);

          if (nextweekData) {
            const balToUpdate = nextweekData.updatedBal - transactionToUpdate.amount + req.body.amount;
            const updateNextweekData = await Weekly.updateOne({id: nextweekData.id}, {updatedBal: balToUpdate}, {new: true, upsert: true});
            console.log("updateNextweekData", updateNextweekData);
          }
        }
        const updatedtrans = await modifyTransaction(transactionToUpdate, req.body);
        const updatedcustomer = await modifyCustomerBalance(transactionToUpdate, req.body);
        console.log("llupdatedcustomer", updatedcustomer);
        if (updatedtrans.matchedCount && updatedcustomer.matchedCount) {
          const body = {
            status: 200,
            message: "Transaction updated successfully",
          };
          res.status(200).send(body);
        } else {
          const body = {
            error: "Error in updating transaction",
            status: 400,
          };
          res.status(400).send(body);
        }
      } else {
        const data = req.body;
        console.log("KKdata", data, req.params.transactionId);
        const result = await TransactionTable.updateOne({id: req.params.transactionId}, data, {new: true, upsert: true});
        console.log("result331", result);
        const updatedcustomer = await modifyCustomerBalance(transactionToUpdate, data);

        const body = {
          status: 200,
          message: "Transaction updated successfully",
        };
        res.status(200).send(body);
        return;
      }
    } else {
      const body = {
        error: "Cannot update transaction which is more than 1 week before",
        status: 400,
      };
      res.status(400).send(body);
    }
  } else {
    const body = {
      error: "Transaction not found",
      status: 400,
    };
    res.status(400).send(body);
  }
});

transactionController.get("/getTransactions/:customerId", async (req, res, next) => {
  try {
    console.log("llllllll");
    console.log("event.pathParameters", req.params.customerId);
    const {customerId} = req.params;
    return getTransactionsOfCustomer(customerId, req, res);
  } catch (err) {
    console.log("err", err);
    const body = {
      error: "Something went wrong",
      status: 400,
    };
    res.status(400).send(body);
  }
});
transactionController.get("/getTransactionsReport", async (req, res, next) => {
  const {docType = "csv", type} = req.query;
  try {
    var response;

    if (type === "all") {
      if (!req.query?.ownerId) {
        const body = {
          message: "owner id not found",
          status: 400,
        };
        res.status(200).send(body);
      } else {
        console.log("getAllOwnerTransactions");
        return getAllOwnerTransactions(req, docType, res);
      }
    } else {
      const userId = req.query?.type;
      console.log("userIduserId", userId);
      const userResult = await getUserByUserId(userId);
      if (userResult) {
        const userIdWithName = [{id: userId, name: userResult.name}];
        return getandSendTransactions(userId, req.query, docType, userIdWithName, res);
      } else {
        const body = {
          message: "user id not found",
          status: 400,
        };
        res.status(400).send(body);
        // return sendFailureResponse(body);
      }
    }
  } catch (err) {
    console.log("errerr", err);
    const body = JSON.stringify({
      status: 400,
      error: err,
    });
    return sendFailureResponse(body);
  }
});

module.exports = transactionController;
module.exports.createNewTransaction = createNewTransaction;
