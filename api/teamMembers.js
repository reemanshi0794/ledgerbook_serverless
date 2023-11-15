const AWS = require("aws-sdk");
const {sendSuccessResponse, sendFailureResponse} = require("../utils");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const getTeamMembersByUserId = (ownerId, options) => {
  console.log("ownerIdownerId", ownerId);
  return {
    KeyConditionExpression: "#ownerIdIdx = :ownerId",
    IndexName: "ownerIdIdx",
    ExpressionAttributeNames: {
      "#ownerIdIdx": "ownerId",
    },
    FilterExpression: "isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":ownerId": ownerId,
      ":isDeleted": false,
    },
    ScanIndexForward: false, //DESC ORDER, Set 'true' if u want asc order

    TableName: process.env.USERS_TABLE,
  };
};

module.exports.getTeamMembers = async (event) => {
  const {id} = event.pathParameters;
  const params = getTeamMembersByUserId(id);
  if (event.queryStringParameters?.search && event.queryStringParameters?.search !== "") {
    params.ExpressionAttributeNames = {...params.ExpressionAttributeNames, "#name": "name"};
    params.FilterExpression = "isDeleted = :isDeleted and contains(#name, :name)";
    params.ExpressionAttributeValues = {...params.ExpressionAttributeValues, ":name": event.queryStringParameters.search.toLowerCase()};
  }
  console.log("paramsparams", params);
  const userData = await dynamoDb.query(params).promise();
  const body = JSON.stringify({
    status: 200,
    message: "Team members fetched successfully",
    data: userData?.Items || [],
  });
  response = sendSuccessResponse(body);
  return response;
};

module.exports.getTeamMembersByUserId = getTeamMembersByUserId;
