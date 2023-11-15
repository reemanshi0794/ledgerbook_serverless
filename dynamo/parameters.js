const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient();

// const TableName = process.env.PARAMS_TABLE;

const parameters = {
  getRecord: async (tableName, name) => {
    const params = {
      TableName: tableName,
      Key: {
        parameter_set: name,
      },
    };

    const result = await dynamoDb.get(params).promise();

    return result ? result.Item : {};
  },
};

module.exports = parameters;
