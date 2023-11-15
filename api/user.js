const AWS = require("aws-sdk");
var md5 = require("md5");
require("dotenv").config();
const {getTeamMembersByUserId} = require("./teamMembers");

const {getCustomersByIds, deleteCustomers} = require("./customer.query");

const {sendSuccessResponse, sendFailureResponse} = require("../utils");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
var ddb = new AWS.DynamoDB({apiVersion: "2012-08-10"});

const parameters = require("../dynamo/parameters");
var sns = new AWS.SNS({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const hashPassword = async (password) => {
  console.log("passwordpassword", password);
  const hash = await md5(password);

  if (hash) return hash;
};
const updateOtpTable = async (OTP, phoneNumber) => {
  console.log("update otp table");
  const params = {
    TableName: process.env.OTP_TABLE,

    // TableName: "otp-table",
    Key: {
      phoneNo: phoneNumber,
    },
  };
  const result = await dynamoDb.get(params).promise();
  if (result) {
    const params = {
      TableName: process.env.OTP_TABLE,
      Key: {
        phoneNo: phoneNumber,
      },
      UpdateExpression: "SET otp = :otp, createdAt = :createdAt",
      ExpressionAttributeValues: {
        ":otp": OTP,
        ":createdAt": Date.now(),
      },
    };

    let updatedOtpTableData = await dynamoDb.update(params).promise();
    console.log("updatedOtpTableDataresponse", updatedOtpTableData);
  } else {
    const params = {
      TableName: process.env.OTP_TABLE,
      Item: {mobileNo: phoneNumber, createdAt: Date.now()},
      otp: OTP,
    };

    await dynamoDb.put(params).promise();
  }
  let body = JSON.stringify({message: "OTP send successfully", status: 200});

  if (process.env.CURRENTSTAGE !== "prod") {
    body = JSON.stringify({message: "OTP send successfully", status: 200, OTP: OTP});
  }
  console.log("ppppresponseresponse", result);
  return sendSuccessResponse(body);
};

module.exports.checkContent = (event) => {
  const parametersReceived = JSON.parse(event.body);
  console.log("checkContentcheckContent", parametersReceived, "queryStringParameters", event.queryStringParameters, "pathParameters", event.pathParameters);
  const body = JSON.stringify({message: "check checked", status: 200});
  return sendSuccessResponse(body);
};

const checkIfOwnerExists = async (id) => {
  console.log("idddd", id);
  const params = {
    TableName: process.env.USERS_TABLE,
    Key: {
      id: id,
    },
  };
  const owner = await dynamoDb.get(params).promise();
  console.log("ownerowner", owner);
  return owner;
};

module.exports.createUser = async (event) => {
  try {
    const parametersReceived = JSON.parse(event.body);
    if (!parametersReceived?.phoneNo) {
      const body = JSON.stringify({
        error: "Phone no is mandatory to send",
        status: 400,
      });
      return sendFailureResponse(body);
    }
    const idHash = await hashPassword(parametersReceived.phoneNo);
    const passwordHash = await hashPassword(parametersReceived.password);
    parametersReceived.id = idHash;
    parametersReceived.name = parametersReceived.name.toLowerCase();
    parametersReceived.createdAt = Date.now();
    parametersReceived.isDeleted = false;
    const {phoneNo} = parametersReceived;
    console.log("parametersReceived11", parametersReceived);
    const phoneNumber = `+91${phoneNo}`;
    console.log("phoneNumber", phoneNumber);

    parametersReceived.password = passwordHash;
    parametersReceived.phoneNo = phoneNumber;
    if (parametersReceived?.ownerId) {
      const ifOwner = await checkIfOwnerExists(parametersReceived.ownerId);
      console.log("ifOwnerifOwner", ifOwner);
      if (!ifOwner.Item) {
        const body = JSON.stringify({
          error: "Owner not found",
          status: 400,
        });
        return sendFailureResponse(body);
      }
    }
    parametersReceived.ownerId = parametersReceived?.ownerId || "null";

    const ifUser = await checkIfUserAlreadyExist(phoneNumber);
    console.log("ifUserifUser", ifUser);
    if (ifUser && ifUser?.Items.length) {
      if (ifUser?.isDeleted) {
        const body = JSON.stringify({
          error: "User is deleted already",
          status: 400,
        });
        return sendFailureResponse(body);
      } else {
        const body = JSON.stringify({
          error: "User already exist",
          status: 400,
          // user: ifUser.Items[0],
        });
        return sendFailureResponse(body);
      }
    }
    console.log("parametersReceived", parametersReceived);
    const params = {
      TableName: process.env.USERS_TABLE,
      Item: parametersReceived,
    };
    const result = await dynamoDb.put(params).promise();
    console.log("resultresult", result);
    // Call DynamoDB to add the item to the table
    const getUserParams = {
      TableName: process.env.USERS_TABLE,
      Key: {
        id: idHash,
      },
      // AttributesToGet: ['id'],
    };
    const userData = await dynamoDb.get(getUserParams).promise();
    console.log("userData", userData);
    if (userData) {
      delete userData.Item["password"];
    }
    body = JSON.stringify({
      message: "Added successfully",
      status: 200,
      user: userData.Item,
    });
    if (result) {
      console.log("Body==>", body);
      return sendSuccessResponse(body);
    } else {
      sendFailureResponse("Couldn't add user details.");
      // callback(new Error("Couldn't add user details."));
    }
  } catch (err) {
    const body = JSON.stringify({error: "User cannot be created", status: 400});
    response = sendFailureResponse(body);
  }
};

function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

const sendOtpMessage = async (response, phoneNumber) => {
  let OTP = generateRandomNumber(1000, 9999);
  if (phoneNumber === "+919780433809") {
    OTP = 0000;
  }
  var snsParams = {
    Message: `Ledgerbook verification code: ${OTP}`,
    PhoneNumber: phoneNumber,
    MessageAttributes: {"AWS.SNS.SMS.SMSType": {DataType: "String", StringValue: "Transactional"}},
  };
  console.log("responseresponse", response);

  // if sns service active
  if (process.env.CURRENTSTAGE === "prod") {
    console.log("sns service available in prod env");
    const res = await new Promise((resolve, reject) => {
      sns.publish(snsParams, async (err, data) => {
        if (err) {
          console.log("error-> " + err + "-" + phoneNumber + "-" + JSON.stringify(snsParams.params));
          response = {
            headers: {
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
            },
            statusCode: 400,
            body: JSON.stringify({error: "Something went wrong", status: 400}),
          };
          resolve(response);
        } else {
          console.log("sns service sent");
          const res = updateOtpTable(OTP, phoneNumber);
          resolve(res);
        }
      });
    });
    return res;
  } else {
    console.log("dev environment");
    const res = updateOtpTable(OTP, phoneNumber);
    return res;
  }
};

const checkIfUserAlreadyExist = async (phoneNumber) => {
  const userParams = {
    TableName: process.env.USERS_TABLE,
    FilterExpression: "phoneNo = :phoneNo",
    ExpressionAttributeValues: {
      ":phoneNo": phoneNumber,
    },
  };
  const userData = await dynamoDb.scan(userParams).promise();
  return userData;
};

// module.exports.getUser = async (event, context) => {
//   const {phoneNo} = event.queryStringParameters;
//   const phoneNumber = `+91${phoneNo.trim()}`;
//   let response = {};
//   let body = JSON.stringify({message: "User not found", user: {}, status: 400});
//   const userData = checkIfUserAlreadyExist(phoneNumber);
//   if (userData && userData?.Items.length) {
//     console.log("userData8", userData);
//     if (userData?.isDeleted) {
//       response = sendFailureResponse(body);
//     } else {
//       body = JSON.stringify({message: "user found successfully", user: userData.Items[0], status: 200});
//       response = sendSuccessResponse(body);
//     }
//   } else {
//     response = sendFailureResponse(body);
//   }
//   return response;
// };

module.exports.sendOtp = async (event, context) => {
  let response = {};

  if (!event.queryStringParameters) {
    const body = JSON.stringify({error: "please send phone number to login", status: 400});
    response = sendFailureResponse(body);
  } else {
    const {phoneNo} = event.queryStringParameters;
    console.log("phoneNophoneNo", phoneNo);
    if (phoneNo && phoneNo.length === 10) {
      const phoneNumber = `+91${phoneNo.trim()}`;
      console.log("process.env.AWS_DEFAULT_REGION", process.env.ACCESS_KEY_ID, process.env.REGION);
      const snsResponse = await sendOtpMessage(response, phoneNumber);
      response = snsResponse;
    } else {
      body = JSON.stringify({error: "Phone no not correct", status: 400});
      response = sendFailureResponse(body);
    }
    return response;
  }
};

module.exports.validateUser = async (event, context, callback) => {
  try {
    const parametersReceived = JSON.parse(event.body);
    const {otp, phoneNo} = parametersReceived;
    console.log("parametersReceived11", otp);
    const phoneNumber = `+91${phoneNo.trim()}`;

    const otpParams = {
      TableName: process.env.OTP_TABLE,
      FilterExpression: "phoneNo = :phoneNo",
      ExpressionAttributeValues: {
        ":phoneNo": phoneNumber,
      },
    };
    console.log("otpData", otpParams);

    var usersResult;
    // Do scan
    otpResult = await dynamoDb.scan(otpParams).promise();
    console.log("otpResult", otpResult);

    if (otpResult?.Items.length) {
      if (otpResult.Items[0].otp === otp) {
        var currentTime = new Date(Date.now());
        var otpTime = new Date(otpResult?.Items[0].createdAt);
        console.log("otpTime", otpTime, currentTime);
        var difference = currentTime.getTime() - otpTime.getTime();
        var minutesDifference = Math.floor(difference / 1000 / 60);
        difference -= minutesDifference * 1000 * 60;
        console.log("otpTime", otpTime, difference, minutesDifference);

        if (minutesDifference >= 10) {
          body = JSON.stringify({
            error: "OTP expired",
            status: 401,
            user: {},
          });
          return sendFailureResponse(body);
          // return {
          //   headers: {
          //     'Access-Control-Allow-Headers': 'Content-Type',
          //     'Access-Control-Allow-Origin': '*',
          //     'Access-Control-Allow-Methods': 'OPTIONS,POST, GET',
          //   },
          //   statusCode: 401,
          //   body: JSON.stringify({
          //     error: 'OTP expired',
          //     status: 401,
          //     user: {},
          //   }),
          // };
        }

        const userParams = {
          TableName: process.env.USERS_TABLE,
          FilterExpression: "phoneNo = :phoneNo",
          ExpressionAttributeValues: {
            ":phoneNo": phoneNumber,
          },
        };

        usersResult = await dynamoDb.scan(userParams).promise();

        //use getuser here
        console.log("usersResultusersResult", usersResult);
        if (usersResult?.Items.length) {
          delete usersResult.Items[0]["password"];
          const body = JSON.stringify({
            message: "Validated successfully",
            status: 200,
            user: usersResult?.Items[0],
          });
          return sendSuccessResponse(body);
        } else {
          const body = JSON.stringify({
            message: "Validated successfully",
            status: 200,
            user: {},
          });
          return sendSuccessResponse(body);
        }
      } else {
        const body = JSON.stringify({
          error: "OTP not correct",
          status: 400,
        });
        return sendFailureResponse(body);
      }
    } else {
      const body = JSON.stringify({
        error: "Either phone no or otp not correct",
        status: 400,
        user: {},
      });
      return sendSuccessResponse(body);
    }
  } catch (err) {
    console.error("Fetch error:", err);
    body = JSON.stringify({
      error: "Couldnt retrieve user details.",
      status: 400,
    });
    return sendFailureResponse(body);
    // callback(new Error("Couldn't retrieve user details."));
  }
};
// module.exports.getUser = async (event, context, callback) => {
//   console.log('event.pathParameters', event.queryStringParameters);
//   const {email, password} = event.queryStringParameters;
//   const idHash = await hashPassword(email);

//   const params = {
//     TableName: 'users-table',
//     Key: {
//       id: idHash,
//     },
//   };
//   console.log('paramsparams', params);

//   var response;
//   try {
//     const result = await dynamoDb.get(params).promise();
//     const passwordHash = await hashPassword(password);
//     console.log('passwordHash', passwordHash, result);
//     if (Object.keys(result).length > 0) {
//       if (passwordHash === result.Item.password) {
//         console.log('password matched', result);
//         const response = {
//           headers: {
//             'Access-Control-Allow-Headers': 'Content-Type',
//             'Access-Control-Allow-Origin': '*',
//             'Access-Control-Allow-Methods': 'OPTIONS,POST, GET',
//           },
//           statusCode: 200,
//           body: JSON.stringify(result.Item),
//         };
//         callback(null, response);
//       } else {
//         response = {
//           headers: {
//             'Access-Control-Allow-Headers': 'Content-Type',
//             'Access-Control-Allow-Origin': '*',
//             'Access-Control-Allow-Methods': 'OPTIONS,POST, GET',
//           },
//           statusCode: 400,
//           body: JSON.stringify({error: 'user not found'}),
//         };
//       }
//     } else {
//       response = {
//         headers: {
//           'Access-Control-Allow-Headers': 'Content-Type',
//           'Access-Control-Allow-Origin': '*',
//           'Access-Control-Allow-Methods': 'OPTIONS,POST, GET',
//         },
//         statusCode: 400,
//         body: JSON.stringify({error: 'user not found'}),
//       };
//     }
//   } catch (err) {
//     console.error('Fetch error:', err);
//     callback(new Error("Couldn't retrieve user details."));
//   }
//   callback(null, response);
// };

module.exports.updateUser = async (event, context, callback) => {
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
  attr[`:id`] = id;
  attrname[`#id`] = "id";

  exp = exp.slice(0, -1);
  console.log("attrname", attrname, attr, exp);

  const params = {
    TableName: process.env.USERS_TABLE,
    Key: {
      id: event.pathParameters.id,
    },
    ConditionExpression: "#id = :id",
    ExpressionAttributeNames: attrname,
    ExpressionAttributeValues: attr,
    UpdateExpression: exp,
    // ReturnValues: "ALL_NEW",
  };
  console.log("paramsparams", params);
  // update the todo in the database

  try {
    const result = await dynamoDb.update(params).promise();
    console.log("resultresult", result);

    if (result) {
      const body = JSON.stringify({message: "User details updated successfully", status: 200});
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
function chunks(inputArray, perChunk) {
  return inputArray.reduce((all, one, i) => {
    const ch = Math.floor(i / perChunk);
    all[ch] = [].concat(all[ch] || [], one);
    return all;
  }, []);
}

const deleteTransactionsOfUser = async (queryResults) => {
  try {
    const batchCalls = chunks(queryResults.Items, 25).map(async (chunk) => {
      const deleteRequests = chunk.map((item, index) => {
        console.log("itemitem", item);
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
          [process.env.TRANSACTIONS_TABLE]: deleteRequests,
        },
      };
      await dynamoDb.batchWrite(batchWriteParams).promise();
    });
    console.log("batchCalls", batchCalls);
    const result = await Promise.allSettled(batchCalls);
    console.log("resultresult", result);
    const fulfilled = result.map((promise) => promise.status === "fulfilled");
    if (fulfilled.length === batchCalls.length) {
      return true;
    }
  } catch (err) {
    console.log("err", err);
  }
};
async function batchDeleteUserTransactions(userId, tableName) {
  try {
    const queryParams = {
      KeyConditionExpression: "#userIdIdx = :userId",
      IndexName: "userIdIdx",
      ExpressionAttributeNames: {
        "#userIdIdx": "userId",
      },
      // FilterExpression: "isDeleted = :isDeleted",
      ExpressionAttributeValues: {
        ":userId": userId,
        // ":isDeleted": false,
      },
      TableName: process.env.TRANSACTIONS_TABLE,
    };
    const queryResults = await dynamoDb.query(queryParams).promise();

    console.log("queryResults.Items", queryResults.Items);
    if (queryResults.Items && queryResults.Items.length) {
      const deletedTransactionsResult = await deleteTransactionsOfUser(queryResults);
      console.log("deletedTransactionsResult", deletedTransactionsResult);
      if (deletedTransactionsResult) {
        return true;
      }
    } else {
      return true;
    }
  } catch (err) {
    console.log("errrr", err);
  }
}

const deleteAllTransactions = async (ownerId, allOwner_TeamMemberIds) => {
  let count = 0;
  let res;
  for (const userId of allOwner_TeamMemberIds) {
    let allOwner_MemTransactionsDeleted = await batchDeleteUserTransactions(userId);
    console.log("allOwner_MemTransactionsDeleted", allOwner_MemTransactionsDeleted);
    if (allOwner_MemTransactionsDeleted) {
      count = count + 1;
    }
    if (count === allOwner_TeamMemberIds.length) {
      res = true;
    }
  }
  return res;
};

const deleteTeamMembers = async (members) => {
  console.log("PPmembers", members);
  try {
    const batchCalls = chunks(members, 25).map(async (chunk) => {
      const deleteRequests = chunk.map((item, index) => {
        return {
          DeleteRequest: {
            Key: {
              id: item,
            },
          },
        };
      });

      const batchWriteParams = {
        RequestItems: {
          [process.env.USERS_TABLE]: deleteRequests,
        },
      };
      await dynamoDb.batchWrite(batchWriteParams).promise();
    });
    console.log("deleteTeamMembers", batchCalls);
    const result = await Promise.allSettled(batchCalls);
    console.log("resultresult", result);
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

const deleteUserAllStuff = async (ownerId) => {
  try {
    // console.log("ownerIdownerId", ownerId);
    // const teamMemberParams = {
    //   KeyConditionExpression: "#ownerIdIdx = :ownerId",
    //   IndexName: "ownerIdIdx",
    //   ExpressionAttributeNames: {
    //     "#ownerIdIdx": "ownerId",
    //   },
    //   // FilterExpression: "isDeleted = :isDeleted",
    //   ExpressionAttributeValues: {
    //     ":ownerId": ownerId,
    //     // ":isDeleted": false,
    //   },
    //   TableName: process.env.USERS_TABLE,
    // };
    const params = getTeamMembersByUserId(ownerId);

    const ownerTeamMembers = await dynamoDb.query(params).promise();
    // const ownerTeamMembers = await dynamoDb.query(teamMemberParams).promise();
    console.log("ownerTeamMembers", ownerTeamMembers);

    let allTransactionsDeleted = false;
    if (ownerTeamMembers && ownerTeamMembers.Items.length) {
      const allOwner_TeamMemberIds = ownerTeamMembers.Items.map((member) => member.id);

      allOwner_TeamMemberIds.push(ownerId);
      const userCustomers = await getCustomersByIds(allOwner_TeamMemberIds);
      console.log("lluserCustomers", userCustomers);
      let customersDel = false;
      if (userCustomers && userCustomers.length) {
        console.log("1122userCustomersuserCustomers");
        const customersDelResult = await deleteCustomers(userCustomers);
        if (customersDelResult) {
          customersDel = true;
        }
      } else {
        customersDel = true;
      }
      console.log("allOwner_TeamMemberIds", allOwner_TeamMemberIds, ownerId);
      // DELETE USER AND TEAM MEMBER TRANSACTIONS
      const result = await deleteAllTransactions(ownerId, allOwner_TeamMemberIds);
      // DELETE TEAM MEMBERS
      const teamMembersResult = await deleteTeamMembers(allOwner_TeamMemberIds);
      console.log("teamMembersResult", teamMembersResult, result);
      if (teamMembersResult && result && customersDel) {
        const body = JSON.stringify({message: "User deleted successfully", status: 200});
        console.log("pppresultresult");
        return sendSuccessResponse(body);
      } else {
        const body = JSON.stringify({
          error: "Error in deleting",
          status: 400,
        });
        return sendFailureResponse(body);
      }
    } else {
      const userCustomers = await getCustomersByIds([ownerId]);
      console.log("customerParams99", userCustomers);
      console.log("lluserCustomers", userCustomers);
      let customersDel = false;
      if (userCustomers && userCustomers.length) {
        console.log("1122userCustomersuserCustomers");
        const customersDelResult = await deleteCustomers(userCustomers);
        if (customersDelResult) {
          customersDel = true;
        }
        console.log("customersDelResult", customersDelResult);
      } else {
        customersDel = true;
      }
      allTransactionsDeleted = await batchDeleteUserTransactions(ownerId);
      if (allTransactionsDeleted && customersDel) {
        return deleteOwnerById(ownerId);
      }
    }
    // if (allTransactionsDeleted) {
    //   const abc = await deleteOwnerById(ownerId);
    // }
  } catch (err) {
    console.log("errerr", err);
  }
};

const deleteOwnerById = async (id) => {
  // const deleteUserParams = {
  //   TableName: process.env.USERS_TABLE,
  //   Key: {
  //     id: id,
  //   },
  //   UpdateExpression: "set isDeleted = :isDeleted",
  //   ExpressionAttributeValues: {
  //     ":isDeleted": true,
  //   },
  //   ReturnValues: "UPDATED_NEW",
  // };
  // const result = await dynamoDb.update(deleteUserParams).promise();
  // console.log("resultresult", result);
  const idStr = "'" + id + "'";
  const tableName = process.env.USERS_TABLE;

  const str = `DELETE FROM "${tableName}" WHERE "id" = ${idStr}`;
  const {Items = []} = await ddb
    .executeStatement({
      Statement: str,
    })
    .promise();
  // const userData = Items.map(AWS.DynamoDB.Converter.unmarshall);
  if (!Items.length) {
    const body = JSON.stringify({message: "User deleted successfully", status: 200});
    return sendSuccessResponse(body);
  } else {
    const body = JSON.stringify({
      error: "User not found",
      status: 400,
    });
    return sendFailureResponse(body);
  }
};

module.exports.sendEmail = function (req, res) {
  const parametersReceived = JSON.parse(req.body);
  const {text, htmlText, subject} = parametersReceived;

  if (!htmlText && !text) {
    return {
      headers: {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
      },
      statusCode: 200,
      body: JSON.stringify({success: false, message: "Invalid data."}),
    };
  }

  const sgMail = require("@sendgrid/mail");
  sgMail.setApiKey(process.env.SEND_GRID_API_KEY);
  const msg = {
    to: "kbindal@innow8apps.com", // Change to your recipient
    from: "contact@innow8apps.com", // Change to your verified sender
    cc: "bbhatia@innow8apps.com",
    subject: subject || "Email from Innow8 site",
    text: text || "",
    html: htmlText || "",
  };
  console.log("sgMailsgMail", sgMail);
  return sgMail
    .send(msg)
    .then(() => {
      console.log("Email sent");
      return {
        headers: {
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
        },
        statusCode: 200,
        body: JSON.stringify({success: true, message: "Email sent."}),
      };
    })
    .catch((error) => {
      console.error(error);
      return {
        headers: {
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST, GET",
        },
        statusCode: 200,
        body: JSON.stringify(error),
      };
    });
};

const getUserByUserId = (id) => {
  const getParams = {
    TableName: process.env.USERS_TABLE,
    FilterExpression: "isDeleted = :isDeleted",
    Key: {
      id: id,
    },
    ExpressionAttributeValues: {
      ":isDeleted": false,
    },
  };
  return getParams;
};

module.exports.getUser = async (event, context, callback) => {
  const {userId} = event.pathParameters;
  const params = getUserByUserId(userId);
  const data = await dynamoDb.get(params).promise();
  console.log("datadata", data);
  if (data?.Item) {
    console.log("datadatadatadata");
    const body = JSON.stringify({data: data.Item, status: 200});
    return sendSuccessResponse(body);
  } else {
    const body = JSON.stringify({
      status: 200,
      error: "No user with this Id",
      data: [],
    });
    return sendSuccessResponse(body);
  }
};

module.exports.deleteUser = async (event, context, callback) => {
  const {id} = event.pathParameters;
  const params = getUserByUserId(id);
  const data = await dynamoDb.get(params).promise();
  console.log("datadata", data);
  if (data?.Item) {
    if (data?.Item.ownerId === "null") {
      const response = await deleteUserAllStuff(data?.Item.id);
      console.log("response", response);
      return response;
    } else {
      const body = JSON.stringify({
        error: "Team member delete on hold",
        status: 400,
      });
      return sendFailureResponse(body);
    }
  } else {
    const body = JSON.stringify({
      status: 400,
      error: "No user with this Id",
    });
    return sendFailureResponse(body);
  }
};

module.exports.checkIfOwnerExists = checkIfOwnerExists;
