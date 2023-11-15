// bb = JSON.stringify({
//   message: 'Added successfully',
//   status: 200,
//   customerId: customerId,
// });

module.exports.sendSuccessResponse = (body) => {
  return {
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
    },
    statusCode: body?.status || 200,
    body: body,
  };
};

module.exports.sendFailureResponse = (body) => {
  return {
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
    },
    statusCode: body?.status || 400,
    body: body,
  };
};

module.exports.sendAlreadyExistSuccessResponse = (body) => {
  return {
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
    },
    statusCode: body?.status || 201,
    body: body,
  };
};

module.exports.sendSuccessMessageResponse = (res, body) => {
  res.status(body.status).send(body);
  return;
};

module.exports.sendFailureResponseMessage = (res, body) => {
  res.status(body.status).send(body);
  return;
};
