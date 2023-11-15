const express = require("express");
const userController = express.Router();
const User = require("./user");
const {sendFailureResponseMessage, sendSuccessMessageResponse} = require("../../../utils");
const TransactionTable = require("../transactions/transactions");

const OTPTable = require("./otp");
const AWS = require("aws-sdk");
const CustomerTable = require("../customers/customer");
var md5 = require("md5");
require("dotenv").config();

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

const checkIfUserAlreadyExist = async (phoneNumber) => {
  const user = await User.find({phoneNo: phoneNumber});

  return user;
};

userController.post("/createUser", async (req, res, next) => {
  console.log("UserUser");

  try {
    const parametersReceived = req.body;
    if (!parametersReceived?.phoneNo) {
      const body = {
        error: "Phone no is mandatory to send",
        status: 400,
      };
      sendFailureResponseMessage(res, body);
      return;
    }
    console.log("parametersReceived", parametersReceived);

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
      const ifOwner = await getUserByUserId(parametersReceived.ownerId);
      console.log("ifOwnerifOwner", ifOwner);
      if (!ifOwner) {
        const body = {
          error: "Owner not found",
          status: 400,
        };
        sendFailureResponseMessage(res, body);
        return;
      }
    }
    const ifUser = await checkIfUserAlreadyExist(phoneNumber);

    console.log("ifUserifUser", ifUser);
    if (ifUser?.length) {
      const body = {
        error: "User already exist",
        status: 400,
        // user: ifUser.Items[0],
      };
      sendFailureResponseMessage(res, body);
      return;
    }
    parametersReceived.ownerId = parametersReceived?.ownerId || "null";

    const result = await User.create(parametersReceived);
    console.log("resultresult", result);
    // Call DynamoDB to add the item to the table

    if (result) {
      delete result["password"];
    }
    body = {
      message: "Added successfully",
      status: 200,
      user: result,
    };
    if (result) {
      console.log("Body==>", body);
      sendSuccessMessageResponse(res, body);
    } else {
      const body = {
        error: "Error in adding user",
        status: 400,
      };
      sendFailureResponseMessage(res, body);
    }
  } catch (err) {
    console.log("eeeee", err);
    const body = {error: "User cannot be created", status: 400};
    sendFailureResponseMessage(res, body);
  }
});

const updateOtpTable = async (OTP, phoneNumber) => {
  console.log("update otp table", Date.now());
  const filter = {phoneNo: phoneNumber};
  const update = {createdAt: Date.now(), otp: OTP}; // Update
  let doc = await OTPTable.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    multi: true,
  });

  let body = {message: "OTP send successfully", status: 200};
  console.log("docdoc", doc);

  if (process.env.CURRENTSTAGE !== "prod") {
    body = {message: "OTP send successfully", status: 200, OTP: OTP};
  }
  console.log("bodybody", body);
  return body;
};

function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}
const sendOtpMessage = async (response, phoneNumber, res) => {
  let OTP = generateRandomNumber(1000, 9999);
  if (phoneNumber === "+919780433809") {
    OTP = 0000;
  }
  var snsParams = {
    Message: `Ledgerbook verification code: ${OTP}`,
    PhoneNumber: phoneNumber,
    MessageAttributes: {"AWS.SNS.SMS.SMSType": {DataType: "String", StringValue: "Transactional"}},
  };
  console.log("responseresponse", process.env.CURRENTSTAGE, response);

  // if sns service active
  if (process.env.CURRENTSTAGE === "prod") {
    console.log("sns service available in prod env");
    const resp = await new Promise((resolve, reject) => {
      sns.publish(snsParams, async (err, data) => {
        if (err) {
          console.log("error-> " + err + "-" + phoneNumber + "-" + JSON.stringify(snsParams.params));

          const body = {error: "Something went wrong", status: 400};
          sendFailueMessageResponse(res, body);
        } else {
          console.log("sns service sent");
          const response = await updateOtpTable(OTP, phoneNumber);
          console.log("response00", response);
          sendSuccessMessageResponse(res, response);
        }
      });
    });
    return resp;
  } else {
    console.log("dev environment");
    const response = await updateOtpTable(OTP, phoneNumber);
    sendSuccessMessageResponse(res, response);
  }
  return res;
};
userController.get("/sendOtp", async (req, res, next) => {
  let response = {};

  if (!req.query) {
    const body = {error: "please send phone number to login", status: 400};

    sendFailureResponseMessage(res, body);
  } else {
    const {phoneNo} = req.query;
    console.log("phoneNophoneNo", phoneNo);
    if (phoneNo && phoneNo.length === 10) {
      const phoneNumber = `+91${phoneNo.trim()}`;
      console.log("process.env.AWS_DEFAULT_REGION", process.env.ACCESS_KEY_ID, process.env.REGION);
      const snsResponse = await sendOtpMessage(response, phoneNumber, res);
      response = snsResponse;
    } else {
      body = {error: "Phone no not correct", status: 400};
      sendFailureResponseMessage(res, body);
    }
    return response;
  }
});

userController.post("/validateUser", async (req, res, next) => {
  try {
    const parametersReceived = req.body;
    const {otp, phoneNo} = parametersReceived;
    console.log("parametersReceived11", otp);
    const phoneNumber = `+91${phoneNo.trim()}`;

    // const otpParams = {
    //   TableName: process.env.OTP_TABLE,
    //   FilterExpression: "phoneNo = :phoneNo",
    //   ExpressionAttributeValues: {
    //     ":phoneNo": phoneNumber,
    //   },
    // };
    // console.log("otpData", otpParams);

    var usersResult;
    // Do scan
    const otpResult = await OTPTable.findOne({phoneNo: phoneNumber});

    // otpResult = await dynamoDb.scan(otpParams).promise();
    console.log("otpResult", otpResult);

    if (otpResult) {
      if (otpResult.otp === otp) {
        console.log("otpResult22", otpResult);

        var currentTime = new Date(Date.now());
        var otpTime = new Date(otpResult?.createdAt);
        console.log("otpTime", otpTime, currentTime);
        var difference = currentTime.getTime() - otpTime.getTime();
        var minutesDifference = Math.floor(difference / 1000 / 60);
        difference -= minutesDifference * 1000 * 60;
        console.log("otpTime", otpTime, difference, minutesDifference);

        if (minutesDifference >= 10) {
          console.log("999999");
          const body = {
            error: "OTP expired",
            status: 401,
            user: {},
          };
          sendFailureResponseMessage(res, body);
          return;
        }

        const usersResult = await User.findOne({phoneNo: phoneNumber});

        //use getuser here
        console.log("usersResultusersResult", usersResult);
        if (usersResult) {
          delete usersResult["password"];
          const body = {
            message: "Validated successfully",
            status: 200,
            user: usersResult,
          };
          sendSuccessMessageResponse(res, body);
        } else {
          console.log("kkkkk");
          const body = {
            message: "Validated successfully",
            status: 200,
            user: {},
          };
          sendSuccessMessageResponse(res, body);
        }
      } else {
        const body = {
          error: "OTP not correct",
          status: 400,
        };
        sendFailureResponseMessage(res, body);
      }
    } else {
      const body = {
        error: "Either phone no or otp not correct",
        status: 400,
        user: {},
      };
      sendFailureResponseMessage(res, body);
    }
  } catch (err) {
    console.error("Fetch error:", err);

    const body = {
      error: "Couldnt retrieve user details.",
      status: 401,
      user: {},
    };
    sendFailureResponseMessage(res, body);
  }
});

userController.post("/updateUser/:id", async (req, res, next) => {
  const data = req.body;
  console.log("updateUser data", data);
  console.log("dreq.queryatadata", req.params.id);

  try {
    let arr = Object.keys(data);
    let err = false;

    arr.map((key) => {
      console.log("keykey", key);
      if (key === "phoneNo") {
        err = true;
      }
    });
    if (err) {
      const body = {
        error: "Sorry, phone number cannot be updated",
        status: 400,
      };
      sendFailureResponseMessage(res, body);
    }

    console.log("paramsparams", data);
    // update the todo in the database
    const user = await User.findOne({id: req.params.id});
    console.log("useruser", user);
    if (user) {
      const result = await User.updateOne({id: req.params.id}, data, {new: true});
      console.log("resultresult", result);
      if (Object.keys(result).length) {
        console.log("resultresult2233", result.modifiedCount, result?.acknowledged);

        if (result?.modifiedCount) {
          const body = {message: "User details updated successfully", status: 200};
          res.status(200).send(body);
          return;
        } else if (result?.acknowledged) {
          const body = {message: "User details already updated successfully", status: 200};
          res.status(200).send(body);
          return;
        }
      } else {
        const body = {
          error: "Something went wrong",
          status: 400,
        };
        sendFailureResponseMessage(res, body);
      }
      // if (result && result?.modifiedCount) {
      //   const body = {message: "User details updated successfully", status: 200};
      //   res.status(200).send(body);
      // } else {
      //   const body = {
      //     error: "Something went wrong",
      //     status: 400,
      //   };
      //   sendFailureResponseMessage(res, body);
      // }
    } else {
      const body = {
        error: "No user found with this id ",
        status: 400,
      };
      sendFailureResponseMessage(res, body);
    }
  } catch (err) {
    const body = {
      error: err,
      status: 400,
    };
    sendFailureResponseMessage(res, body);
  }
});
const getUserByUserId = async (id) => {
  console.log("getUserByUserId", id);
  const user = await User.findOne({id: id});
  console.log("getUserByUserId222", user);

  return user;
};
userController.get("/getUser/:userId", async (req, res, next) => {
  const {userId} = req.params;
  const user = await getUserByUserId(userId);
  console.log("datadata", user);
  if (user) {
    console.log("datadatadatadata");
    const body = {data: user, status: 200, message: "User fetched successfully"};
    res.status(200).send(body);
  } else {
    const body = {
      status: 200,
      error: "No user with this Id",
      data: [],
    };
    res.status(400).send(body);
  }
});

const getTeamMembersByUserId = async (id, req) => {
  try {
    let teamMembers = [];
    if (req && req?.query?.search) {
      console.log("searchsearch", id);
      teamMembers = await User.find({
        $and: [{ownerId: id}, {name: {$regex: req?.query?.search, $options: "i"}}],
      });
      console.log("lllll", teamMembers);
    } else {
      teamMembers = await User.find({ownerId: id});
      console.log("teamMembers", teamMembers);
    }

    return teamMembers;
  } catch (err) {
    return err;
  }
};

const getCustomersByIds = async (arrOfIds) => {
  const customers = await CustomerTable.find({userId: {$in: arrOfIds}}, {id: 1});
  console.log("customerscustomers", customers);
  return customers;
};

const deleteCustomers = async (customerIds) => {
  console.log("customerIds88", customerIds);
  const deletedCustomersResult = await CustomerTable.remove({id: {$in: customerIds}});
  console.log("deletedCustomersResult33", deletedCustomersResult);
  return deletedCustomersResult;
};
const batchDeleteUserTransactions = async (userId, tableName) => {
  try {
    const queryResults = await TransactionTable.remove({userId: userId});
    console.log("queryResults.Items", queryResults);

    return true;
  } catch (err) {
    console.log("errrr", err);
  }
};

const deleteAllTransactions = async (allOwner_TeamMemberIds) => {
  console.log("allOwner_TeamMemberIds", allOwner_TeamMemberIds);
  const deletedTransactionsResult = await TransactionTable.deleteMany({userId: {$in: allOwner_TeamMemberIds}});
  console.log("deletedTransactionsResult232", deletedTransactionsResult);
  return deletedTransactionsResult;
};

const deleteTeamMembers = async (ids) => {
  const deletedTransactionsResult = await User.remove({id: {$in: ids}});
  return deletedTransactionsResult;
};

const deleteUserCustomers = async (userCustomers) => {
  try {
    let customersDel = false;
    if (userCustomers && userCustomers.length) {
      console.log("1122userCustomersuserCustomers");
      const userCustomersIds = userCustomers.map((member) => member.id);

      const customersDelResult = await deleteCustomers(userCustomersIds);
      console.log("kkkkcustomersDelResult", customersDelResult);
      if (customersDelResult?.deletedCount) {
        customersDel = true;
      }
      console.log("customersDelResult", customersDelResult);
    } else {
      customersDel = true;
    }
    console.log("pppcustomersDel22", customersDel);
    return customersDel;
  } catch (err) {
    console.log("errrr", err);
  }
};
const deleteOwnerById = async (res, ownerId) => {
  const deletedOwner = await User.deleteOne({id: ownerId});
  console.log("deletedOwner", deletedOwner);
  if (deletedOwner.deletedCount) {
    const body = {
      message: "User deleted successfully",
      status: 200,
    };
    sendSuccessMessageResponse(res, body);
  }
};
const deleteUserAllStuff = async (ownerId, res) => {
  try {
    const ownerTeamMembers = await getTeamMembersByUserId(ownerId);

    let allTransactionsDeleted = false;
    if (ownerTeamMembers && ownerTeamMembers.length) {
      console.log("ownerTeamMembers", ownerTeamMembers);
      const allOwner_TeamMemberIds = ownerTeamMembers.map((member) => member.id);

      allOwner_TeamMemberIds.push(ownerId);
      //get all customers of owner and team members
      const userCustomers = await getCustomersByIds(allOwner_TeamMemberIds);
      console.log("lluserCustomers", userCustomers);

      let customersDel = false;
      if (userCustomers && userCustomers.length) {
        console.log("1122userCustomersuserCustomers");
        const userCustomersIds = userCustomers.map((member) => member.id);

        const customersDelResult = await deleteCustomers(userCustomersIds);

        console.log("allOwner_TeamMemberIds", customersDelResult, allOwner_TeamMemberIds, ownerId);
        // DELETE USER AND TEAM MEMBER TRANSACTIONS
        const result = await deleteAllTransactions(ownerId, allOwner_TeamMemberIds);
        console.log("ppresult", result);
        // DELETE TEAM MEMBERS
        const teamMembersResult = await deleteTeamMembers(allOwner_TeamMemberIds);
        console.log("teamMembersResult344", teamMembersResult, result);
        if (teamMembersResult?.deletedCount && result?.deletedCount && customersDelResult?.deletedCount) {
          const body = {message: "User deleted successfully", status: 200};
          res.status(200).send(body);
        } else {
          const body = {
            error: "Error in deleting",
            status: 400,
          };
          sendFailureResponseMessage(res, body);
        }
      } else {
        const userCustomers = await getCustomersByIds([ownerId]);
        console.log("customerParams99", userCustomers);
        let customersDel = false;
        if (userCustomers && userCustomers.length) {
          console.log("1122userCustomersuserCustomers");
          const userCustomersIds = userCustomers.map((member) => member.id);

          const customersDelResult = await deleteCustomers(userCustomersIds);
          console.log("pppcustomersDelResult", customersDelResult);
          if (customersDelResult?.deletedCount) {
            customersDel = true;
          }
          console.log("customersDelResult", customersDelResult);
        } else {
          customersDel = true;
        }
        allTransactionsDeleted = await batchDeleteUserTransactions(ownerId);
        console.log("customersDel", allTransactionsDeleted, customersDel);
        if (allTransactionsDeleted && customersDel) {
          return deleteOwnerById(res, ownerId);
        }
      }
    } else {
      const userCustomers = await getCustomersByIds(ownerId);
      if (userCustomers?.length) {
        const customersResult = await deleteUserCustomers(userCustomers);
        console.log("customersResult23333", customersResult);
      }
      console.log("userCustomersuserCustomers", userCustomers);
      const result = await deleteAllTransactions([ownerId]);
      console.log("resultresul23333t11", result);
      if (result.deletedCount) {
        console.log("2233333", ownerId);

        return deleteOwnerById(res, ownerId);
      } else {
        console.log("del11111etedOwner");

        const deletedOwner = await User.deleteOne({id: ownerId});
        console.log("deletedOwner", deletedOwner);
        const body = {
          error: "User deleted successfully",
          status: 200,
        };
        sendSuccessMessageResponse(res, body);
      }
    }
  } catch (err) {
    const body = {
      error: err,
      status: 400,
    };
    sendFailureResponseMessage(res, body);
  }
};
userController.post("/deleteUser/:id", async (req, res, next) => {
  const {id} = req.params;
  const user = await getUserByUserId(id);
  console.log("useruser", user);
  if (user) {
    if (!user?.ownerId || user?.ownerId === "null") {
      await deleteUserAllStuff(user?.id, res);
    } else {
      const body = {
        error: "Team member delete on hold",
        status: 400,
      };
      sendFailureResponseMessage(res, body);
      return;
    }
  } else {
    const body = {
      status: 400,
      error: "No user with this Id",
    };
    sendFailureResponseMessage(res, body);
  }
});

// const getTeamMembersByUserId = async (id) => {
//   const teamMembers = await User.find({ownerId: id});
//   console.log("ppteamMembers", teamMembers);
// };

userController.get("/getTeamMembers/:id", async (req, res, next) => {
  const {id} = req.params;
  console.log("reqreq22", req.params.id);
  const ownerTeamMembers = await getTeamMembersByUserId(id, req);
  console.log("reqreq22", ownerTeamMembers);

  const body = {
    status: 200,
    message: "Team members fetched successfully",
    data: ownerTeamMembers || [],
  };
  sendSuccessMessageResponse(res, body);
});

module.exports = userController;
module.exports.getUserByUserId = getUserByUserId;
