const AWS = require("aws-sdk");

var ddb = new AWS.DynamoDB({apiVersion: "2012-08-10"});
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.getCustomersByUserId = (userId, options) => {
  return {
    KeyConditionExpression: "#userIdIdx = :userId",
    IndexName: "userIdIdx",
    ExpressionAttributeNames: {
      "#userIdIdx": "userId",
      // ":isDeleted": "isDeleted",
    },
    // FilterExpression: "isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":userId": userId,
      // ":isDeleted": false,
    },
    ScanIndexForward: false,

    TableName: process.env.CUSTOMERS_TABLE,
    ProjectionExpression: "fullName, last_trans_date,other_details,last_trans_amount,createdAt,address,email ,last_trans_id, balance, image, userId,id, phone, creditLimit, defaultTransactionAmt",

    // ProjectionExpression: ['last_trans_date', 'other_details', 'last_trans_amount', 'createdAt', 'address', 'email', 'name', 'last_trans_id', 'balance', 'image', 'userId', 'id', 'phone'],
  };
};

module.exports.getCustomerByCustomerId = (id, options) => {
  const getParams = {
    TableName: process.env.CUSTOMERS_TABLE,
    FilterExpression: "isDeleted = :isDeleted",
    Key: {
      id: id,
    },
    ExpressionAttributeValues: {
      ":isDeleted": false,
    },
    ScanIndexForward: false,
  };
  return getParams;
};

module.exports.getCustomersByIds = async (userIds) => {
  let idStr = "";
  userIds.forEach((id, index) => {
    if (index === userIds.length - 1) {
      idStr = idStr + "'" + id + "'";
    } else {
      idStr += "'" + id + "',";
    }
  });
  const tableName = process.env.CUSTOMERS_TABLE;
  const str = `SELECT id FROM "${tableName}" WHERE "userId" IN [${idStr}]`;
  console.log("pppppp", str);
  const {Items = []} = await ddb
    .executeStatement({
      Statement: str,
    })
    .promise();
  const userCustomers = Items.map(AWS.DynamoDB.Converter.unmarshall);
  console.log("userCustomersuserCustomers", userCustomers);
  return userCustomers;
};
function chunks(inputArray, perChunk) {
  return inputArray.reduce((all, one, i) => {
    const ch = Math.floor(i / perChunk);
    all[ch] = [].concat(all[ch] || [], one);
    return all;
  }, []);
}

module.exports.deleteCustomers = async (customerIds) => {
  console.log("customerIdscustomerIds", customerIds);
  try {
    const batchCalls = chunks(customerIds, 25).map(async (chunk) => {
      const deleteRequests = chunk.map((item, index) => {
        return {
          DeleteRequest: {
            Key: {
              id: item.id,
            },
          },
        };
      });

      const batchWriteParams = {
        RequestItems: {
          [process.env.CUSTOMERS_TABLE]: deleteRequests,
        },
      };
      await dynamoDb.batchWrite(batchWriteParams).promise();
    });
    console.log("deletecustomerIds", batchCalls);
    const result = await Promise.allSettled(batchCalls);
    console.log("customerIdsresultresult", result);
    const fulfilled = result.map((promise) => promise.status === "fulfilled");
    if (fulfilled.length === batchCalls.length) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.log("err", err);
  }
};
