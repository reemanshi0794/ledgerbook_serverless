const AWS = require("aws-sdk");
var md5 = require("md5");
const {getCustomersByUserId, getCustomerByCustomerId} = require("./customer.query");
const {sendSuccessResponse, sendFailureResponse, sendAlreadyExistSuccessResponse} = require("../utils");
const {checkIfOwnerExists} = require("./user");

const dynamoDb = new AWS.DynamoDB.DocumentClient();

// const checkIfCustomerAlreadyExist = async (customerId) => {
//   const customerParams = {
//     TableName: process.env.CUSTOMERS_TABLE,
//     key: {
//       id: customerId,
//     },
//   };
//   const userData = await dynamoDb.scan(userParams).promise();
//   return userData;
// };

module.exports.createCustomer = async (event) => {
  console.log("ppppppcreateCustomer");
  try {
    const parametersReceived = JSON.parse(event.body);
    const {fullName, phone, userId} = parametersReceived;
    // const customerId = md5(fullName);
    console.log("phonephone", phone + userId);
    const customerId = await md5(phone + userId);
    console.log("phonephcustomerIdcustomerIdone", customerId);

    const phoneNumber = `+91${phone.trim()}`;

    const customerParams = await getCustomerByCustomerId(customerId);
    const ifAlreadyCustomer = await dynamoDb.get(customerParams).promise();
    console.log("ifAlreadyCustomer", ifAlreadyCustomer);
    if (ifAlreadyCustomer && ifAlreadyCustomer?.Item) {
      const body = JSON.stringify({
        error: "Customer already exist",
        status: 201,
        customer: ifAlreadyCustomer.Item,
      });
      return sendAlreadyExistSuccessResponse(body);
    }
    const ifOwner = await checkIfOwnerExists(userId);
    console.log("ifOwner.Item", ifOwner);
    if (!ifOwner.Item) {
      const body = JSON.stringify({
        error: "Owner not found",
        status: 400,
      });
      return sendFailureResponse(body);
    }
    console.log("ifAlreadyCustomer", ifAlreadyCustomer);
    parametersReceived.fullName = fullName.toLowerCase();
    parametersReceived.phone = phoneNumber;
    parametersReceived.isDeleted = false;
    parametersReceived.id = customerId;
    parametersReceived.createdAt = Date.now();
    parametersReceived.balance = parametersReceived?.balance || 0;
    console.log("parametersReceived11", parametersReceived);
    if (!parametersReceived?.userId) {
      const body = JSON.stringify({
        error: "userId is mandatory to send",
        status: 400,
      });
      return sendFailureResponse(body);
    }
    const params = {
      TableName: process.env.CUSTOMERS_TABLE,
      Item: parametersReceived,
    };
    const result = await dynamoDb.put(params).promise();
    console.log("resultresult", result);
    const body = JSON.stringify({
      message: "Added successfully",
      status: 200,
      customerId: customerId,
    });
    if (result) {
      return sendSuccessResponse(body);
    } else {
      return sendFailureResponse("Couldn't add customer details.");
    }
  } catch (err) {
    console.log("errrr", err);
    const body = JSON.stringify({error: "Customer cannot be created", status: 400});
    return sendFailureResponse(body);
  }
};

module.exports.deleteCustomer = async (event, context, callback) => {
  const {id} = event.pathParameters;

  const deleteParams = {
    TableName: process.env.CUSTOMERS_TABLE,
    Key: {
      id: id,
    },
    UpdateExpression: "set isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":isDeleted": true,
    },
    ReturnValues: "UPDATED_NEW",
  };
  const result = await dynamoDb.update(deleteParams).promise();
  console.log("resultresult", result);
  if (result) {
    const body = JSON.stringify({message: "Customer deleted successfully", status: 200});
    return sendSuccessResponse(body);
  }
};

module.exports.updateCustomer = async (event, context, callback) => {
  const data = JSON.parse(event.body);
  console.log("datadata", data);
  const {id} = event.pathParameters;
  let attr = {};
  let nameobj = {};
  let exp = "SET ";
  let arr = Object.keys(data);
  let attrname = {};
  let err = false;
  arr.map((key) => {
    console.log("keykey", key);
    if (key === "phoneNo") {
      err = true;
    }
    attr[`:${key}`] = data[key];
  });
  attr[`:id`] = id;
  if (err) {
    const body = JSON.stringify({
      error: "Sorry, phone number cannot be updated",
      status: 400,
    });
    return sendFailureResponse(body);
  }
  arr.map((key) => {
    exp += `#${key} = :${key},`;
  });

  arr.map((key) => {
    nameobj[`#${key}`] = data[key];
  });
  arr.map((key) => {
    attrname[`#${key}`] = key;
  });
  attrname[`#id`] = "id";
  exp = exp.slice(0, -1);
  console.log("attrname", attrname, attr, exp);

  const params = {
    TableName: process.env.CUSTOMERS_TABLE,
    Key: {
      id: id,
    },
    ConditionExpression: "#id = :id",
    ExpressionAttributeNames: attrname,
    ExpressionAttributeValues: attr,
    UpdateExpression: exp,
    ReturnValues: "ALL_NEW",
  };
  console.log("paramsparams", params);
  // update the todo in the database
  try {
    const result = await dynamoDb.update(params).promise();
    console.log("resultresult", result);

    if (result) {
      const body = JSON.stringify({message: "Customer details updated successfully", status: 200});
      return sendSuccessResponse(body);
    } else {
      const body = JSON.stringify({
        error: "Something went wrong",
        status: 400,
      });
      return sendFailureResponse(body);
    }
  } catch (err) {
    const body = JSON.stringify({
      error: err,
      status: 400,
    });
    return sendFailureResponse(body);
  }
};

module.exports.getCustomer = async (event, context, callback) => {
  const {customerId} = event.pathParameters;
  const params = getCustomerByCustomerId(customerId);
  const data = await dynamoDb.get(params).promise();
  console.log("datadata", data);
  if (data?.Item) {
    console.log("datadatadatadata");
    const body = JSON.stringify({data: data.Item, status: 200});
    return sendSuccessResponse(body);
  } else {
    const body = JSON.stringify({
      status: 400,
      error: "No customer with this Id",
      data: [],
    });
    return sendFailureResponse(body);
  }
};

module.exports.getCustomers = async (event, context, callback) => {
  let response = {};
  console.log("event.pathParameters", event.pathParameters.id);
  const {id} = event.pathParameters;

  const params = getCustomersByUserId(id);
  if (event.queryStringParameters?.search && event.queryStringParameters?.search !== "") {
    params.ExpressionAttributeNames = {...params.ExpressionAttributeNames, "#fullName": "fullName"};
    params.FilterExpression = "contains(#fullName, :fullName)";
    params.ExpressionAttributeValues = {...params.ExpressionAttributeValues, ":fullName": event.queryStringParameters.search.toLowerCase()};
  }
  console.log(params, "fjdskfjd");

  const data = await dynamoDb.query(params).promise();
  console.log("datadata", data);
  if (data?.Items.length) {
    console.log("datadatadatadata");
    const body = JSON.stringify({data: data.Items, status: 200});
    response = sendSuccessResponse(body);
  } else {
    const body = JSON.stringify({
      status: 200,
      error: "No customer with this user Id",
      data: [],
    });
    response = sendSuccessResponse(body);
  }

  callback(null, response);
};
