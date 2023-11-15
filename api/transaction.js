const AWS = require("aws-sdk");
var md5 = require("md5");
const {getCustomersByUserId, getCustomerByCustomerId} = require("./customer.query");
const {checkIfOwnerExists} = require("./user");
const Papa = require("papaparse");
var fs = require("fs");
const moment = require("moment");

var ddb = new AWS.DynamoDB({apiVersion: "2012-08-10"});
const s3 = new AWS.S3({
  // apiVersion: '2006-03-01',
  // signatureVersion: 'v2',
  region: "ap-south-1",
  accessKeyId: "AKIAXKR26MDHMWBO2352",
  secretAccessKey: "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",
});
// ...

const {sendSuccessResponse, sendFailureResponse} = require("../utils");
const PDFDocument = require("pdfkit");
const {file} = require("pdfkit");
const {Console} = require("console");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const updateCustomerBal = async (id, transId, amount, balance) => {
  const updateCustomerTableParams = {
    TableName: process.env.CUSTOMERS_TABLE,
    Key: {
      id: id,
    },
    UpdateExpression: "set balance = :balance, last_trans_amount = :last_trans_amount,last_trans_date = :last_trans_date, last_trans_id = :last_trans_id",
    ExpressionAttributeValues: {
      ":balance": balance,
      ":last_trans_amount": amount,
      ":last_trans_date": Date.now(),
      ":last_trans_id": transId,
    },
    ReturnValues: "UPDATED_NEW",
  };
  try {
    let updatedCustomerData = await dynamoDb.update(updateCustomerTableParams).promise();
    if (updatedCustomerData) {
      console.log("updatedCustomerData", updatedCustomerData);
      const body = JSON.stringify({
        message: "Added successfully",
        status: 200,
        transaction_id: transId,
      });

      return sendSuccessResponse(body);
    } else {
      const body = JSON.stringify({
        error: "Unable to update customer balance",
        status: 400,
      });
      return sendFailureResponse(body);
    }
  } catch (error) {
    console.log(error);
    const body = JSON.stringify({
      error: "Something went wrong",
      status: 400,
    });
    return sendFailureResponse(body);
  }
};

module.exports.createTransaction = async (event) => {
  const parametersReceived = JSON.parse(event.body);
  console.log("createTransaction parametersReceived", parametersReceived);
  const {customerId, type, amount} = parametersReceived;
  const transId = md5(Date.now());
  parametersReceived.id = transId;
  parametersReceived.createdAt = Date.now();
  parametersReceived.date = parseInt(parametersReceived?.date) || Date.now();
  console.log("Date.now()", Date.now());
  parametersReceived.isDeleted = false;
  const ifOwner = await checkIfOwnerExists(parametersReceived.userId);
  console.log("ifOwnerifOwner", ifOwner);
  if (!ifOwner.Item) {
    const body = JSON.stringify({
      error: "Owner not found",
      status: 400,
    });
    return sendFailureResponse(body);
  }
  const customerParams = {
    TableName: process.env.CUSTOMERS_TABLE,
    Key: {
      id: customerId,
    },
  };

  var response;
  const customerResult = await dynamoDb.get(customerParams).promise();
  console.log("customerResult", customerResult);
  if (customerResult && customerResult?.Item) {
    const {Item} = customerResult;
    console.log("ItemItem", Item);
    let updatedBal = Item?.balance || 0;
    if (type === "CREDIT") {
      updatedBal = updatedBal + amount;
    } else {
      updatedBal = updatedBal - amount;
    }
    parametersReceived.updatedBal = updatedBal;
    parametersReceived.customerName = Item.fullName;

    console.log("parametersReceived11", updatedBal, parametersReceived);

    const params = {
      TableName: process.env.TRANSACTIONS_TABLE,
      Item: parametersReceived,
    };
    const result = await dynamoDb.put(params).promise();

    if (result) {
      // updateWeeklyBal(amount, transId, customerId, userId);

      return updateCustomerBal(customerId, transId, amount, updatedBal);
    } else {
      callback(new Error("Couldn't add customer details."));
    }
  } else {
    const body = JSON.stringify({
      error: "Customer does not exist",
      status: 400,
    });
    return sendFailureResponse(body);
  }
};

// const updateWeeklyBal = async (amount, transId) => {
//   const table = process.env.WEEKLYBAL_TABLE;
//   // const str = `SELECT *  FROM "${table}" WHERE "weekDate" <= ${Date.now()} AND ORDER BY weekDate ASC`;
//   var params1 = {
//     TableName: table,
//     FilterExpression: "#weekDate <= :weekDate",
//     ExpressionAttributeNames: {
//       "#weekDate": "weekDate",
//     },
//     // Limit: 1,
//     ExpressionAttributeValues: {":weekDate": Date.now()},
//     ScanIndexForward: false,
//   };
//   // const params1 = {
//   //   // KeyConditionExpression: "#ownerIdIdx = :ownerId",
//   //   // IndexName: "ownerIdIdx",
//   //   // ExpressionAttributeNames: {
//   //   //   "#dateadded": "ownerId",
//   //   // },
//   //   ExpressionAttributeNames: {
//   //     "#weekDate": "weekDate",
//   //   },
//   //   FilterExpression: "#weekDate <= :weekDate",
//   //   ExpressionAttributeValues: {
//   //     ":weekDate": Date.now(),
//   //   },
//   //   ScanIndexForward: false, //DESC ORDER, Set 'true' if u want asc order

//   //   TableName: process.env.WEEKLYBAL_TABLE,
//   // };
//   const data = await dynamoDb.scan(params1).promise();
//   console.log("datadata", data, new Date());
//   if (data?.Items && data.Items.length) {
//     console.log("lllll", data?.Items?.[0]?.weekDate);
//     const subscriptionDate = moment(new Date(data?.Items[0].weekDate), "DD-MM-YYYY");
//     console.log("subscriptionDate", subscriptionDate);
//     const nowDate = moment(new Date(), "DD-MM-YYYY");
//     console.log("nowDatenowDate", nowDate);

//     const diff = nowDate.diff(subscriptionDate, "days");
//     console.log("diffdiff", diff);
//   }

//   // console.log("strstr11222", str);

//   // const {Items = []} = await ddb
//   //   .executeStatement({
//   //     Statement: str,
//   //   })
//   //   .promise();
//   // console.log("strstr", str);
//   // const balItems = Items.map(AWS.DynamoDB.Converter.unmarshall);
//   // console.log("balItemsbalItems", balItems);

//   const parametersReceived = {
//     updatedBal: amount,
//     lastTransId: transId,
//     id: Date.now().toString(),
//     weekDate: Date.now(),
//     customerId: customerId,
//     userId: userId,
//   };
//   const params = {
//     TableName: table,
//     Item: parametersReceived,
//   };
//   const result = await dynamoDb.put(params).promise();
//   console.log("updateWeeklyBalresultresult", result);
// };

const updateDeletedTransactionInCustomer = async (id, customerId) => {
  let object = {
    KeyConditionExpression: "#customerIdIdx = :customerId",
    IndexName: "customerIdIdx",
    ExpressionAttributeNames: {
      "#customerIdIdx": "customerId",
    },
    FilterExpression: "isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":customerId": customerId,
      ":isDeleted": false,
    },
    TableName: process.env.TRANSACTIONS_TABLE,
    Limit: 5,
    ScanIndexForward: false, //DESC ORDER, Set 'true' if u want asc order
    TableName: process.env.TRANSACTIONS_TABLE,
  };

  const data = await dynamoDb.scan(object).promise();
  console.log("datadata", data);
  const getParams = {
    TableName: process.env.TRANSACTIONS_TABLE,
    FilterExpression: "isDeleted = :isDeleted",
    Key: {
      id: id,
    },
    ExpressionAttributeValues: {
      ":isDeleted": true,
    },
  };
};

module.exports.deleteTransaction = async (event, context, callback) => {
  const {id} = event.pathParameters;

  const deleteParams = {
    TableName: process.env.TRANSACTIONS_TABLE,
    Key: {
      id: id,
    },
    UpdateExpression: "set isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":isDeleted": true,
    },
    ReturnValues: "ALL_NEW",
  };
  const result = await dynamoDb.update(deleteParams).promise();
  console.log("resultresult", result);
  if (result) {
    const {customerId, amount, type} = result.Attributes;
    updateDeletedTransactionInCustomer(id, customerId, amount, type);
    const body = JSON.stringify({message: "Transaction deleted successfully", status: 200});
    return sendSuccessResponse(body);
  }
};

const getTransactionsByCustomerId = (customerId, type) => {
  console.log("customerId", customerId);

  let object = {
    KeyConditionExpression: "#customerIdIdx = :customerId",
    IndexName: "customerIdIdx",
    ExpressionAttributeNames: {
      "#customerIdIdx": "customerId",
    },
    FilterExpression: "isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":customerId": customerId,
      ":isDeleted": false,
    },
    TableName: process.env.TRANSACTIONS_TABLE,
    // Limit: 1,
    ScanIndexForward: false, //DESC ORDER, Set 'true' if u want asc order
  };
  if (type) {
    object.ExpressionAttributeValues = {...object.ExpressionAttributeValues, ":type": type.toUpperCase()};
    object.ExpressionAttributeNames = {...object.ExpressionAttributeNames, "#type": "type", "#isDeleted": "isDeleted"};
    object.FilterExpression = "#type = :type AND #isDeleted = :isDeleted";
  }
  console.log("objectobject", object);
  return object;
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

const getTransactionsOfCustomer = async (customerId, event) => {
  const customerParams = getCustomerByCustomerId(customerId);
  const result = await dynamoDb.get(customerParams).promise();
  console.log("resultresult", result);
  const params = getTransactionsByCustomerId(customerId, event.queryStringParameters?.type);
  console.log(params, "fjdskfjd");
  const data = await dynamoDb.query(params).promise();
  console.log("datadata", data);
  let response = {};

  if (data && data?.Items.length) {
    const body = JSON.stringify({data: data.Items, status: 200, customerBalance: result?.Item?.balance, message: "Transactions fetched successfully"});
    return sendSuccessResponse(body);
  } else {
    const body = JSON.stringify({
      status: 200,
      error: "No transactions found",
    });
    return sendSuccessResponse(body);
  }
};

module.exports.getTransactions = async (event, context, callback) => {
  try {
    console.log("llllllll");
    console.log("event.pathParameters", event.pathParameters.customerId);
    const {customerId} = event.pathParameters;
    return getTransactionsOfCustomer(customerId, event);
  } catch (err) {
    const body = JSON.stringify({
      error: "Something went wrong",
      status: 400,
    });
    return sendFailureResponse(body);
  }
};
module.exports.getPreSignedUrl = async () => {
  const fileName = Date.now().toString();
  const s3Params = {
    Bucket: "ledgerbook-transaction-assets",
    Key: fileName,
    Expires: 60 * 60,
    ContentType: "application/octet-stream",
  };
  // const url = await getPresignUrlPromiseFunction(s3, s3Params);
  // function getPresignUrlPromiseFunction(s3, s3Params): Promise<string>{
  try {
    const url = await new Promise((resolve, reject) => {
      s3.getSignedUrl("putObject", s3Params, (err, url) => {
        err ? reject(err) : resolve(url);
      });
    });
    const body = JSON.stringify({
      message: "Presigned url fetched successfully",
      status: 200,
      url: url,
      fileUrl: `https://ledgerbook-transaction-assets.s3.ap-south-1.amazonaws.com/${fileName}`,
    });
    return sendSuccessResponse(body);
  } catch (err) {
    const body = JSON.stringify({
      status: 400,
      error: err,
    });
    return sendFailureResponse(body);
  }
};

const getTransactionsByUserIds = async (userIds) => {
  console.log("userIduserId", userIds);
  let idStr = "";
  userIds.forEach((id, index) => {
    if (index === userIds.length - 1) {
      idStr = idStr + "'" + id + "'";
    } else {
      idStr += "'" + id + "',";
    }
  });
  console.log("idStridStridStr", idStr);
  const str = 'SELECT * FROM "transactions-table" WHERE "userId" IN [' + idStr + "]";
  console.log("str: ", str);
  const {Items = []} = await ddb
    .executeStatement({
      Statement: str,
    })
    .promise();
  const userTransactions = Items.map(AWS.DynamoDB.Converter.unmarshall);
  console.log("userTransactionsuserTransactions", userTransactions);
  return userTransactions;
};
