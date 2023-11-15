const express = require("express");
const customerController = express.Router();
const CustomerTable = require("./customer");
var md5 = require("md5");
const {getUserByUserId} = require("../user/user.controller");
const {createNewTransaction} = require("../transactions/transactions.controller");
const {sendFailureResponseMessage, sendSuccessMessageResponse} = require("../../../utils");

const getCustomerByCustomerId = async (id) => {
  const customer = await CustomerTable.findOne({id: id});
  return customer;
};

customerController.post("/createCustomer", async (req, res, next) => {
  console.log("ppppppcreateCustomer", req.body);
  try {
    const parametersReceived = req.body;
    const {fullName, phone, userId} = parametersReceived;
    // const customerId = md5(fullName);
    console.log("phonephone", phone + userId);
    const customerId = await md5(phone + userId);
    console.log("phonephcustomerIdcustomerIdone", customerId);

    const phoneNumber = `+91${phone.trim()}`;

    const ifAlreadyCustomer = await getCustomerByCustomerId(customerId);
    //   const ifAlreadyCustomer = await dynamoDb.get(customerParams).promise();
    console.log("ifAlreadyCustomer", ifAlreadyCustomer);
    if (ifAlreadyCustomer) {
      const body = {
        error: "Customer already exist",
        status: 201,
        customer: ifAlreadyCustomer,
      };
      res.status(201).send(body);
      return;
      // return sendAlreadyExistSuccessResponse(body);
    }
    const ifOwner = await getUserByUserId(userId);
    console.log("ifOwner.Item", ifOwner);
    if (!ifOwner) {
      const body = {
        error: "Owner not found",
        status: 400,
      };
      res.status(400).send(body);
      return;
      // return sendFailureResponse(body);
    }
    console.log("ifAlreadyCustomer12", ifAlreadyCustomer);
    parametersReceived.fullName = fullName.toLowerCase();
    parametersReceived.phone = phoneNumber;
    parametersReceived.isDeleted = false;
    parametersReceived.id = customerId;
    parametersReceived.createdAt = Date.now();
    parametersReceived.openingBal = parametersReceived?.balance || 0;
    parametersReceived.balance = 0;

    console.log("parametersReceived11", parametersReceived);
    if (!parametersReceived?.userId) {
      const body = {
        error: "userId is mandatory to send",
        status: 400,
      };
      res.status(400).send(body);
    }

    const result = await CustomerTable.create(parametersReceived);
    console.log("kkkk", req.body);

    const params = {
      body: {
        customerId: result.id,
        amount: parametersReceived.openingBal,
        mode: "OPENING_BALANCE",
        type: parametersReceived.openingBal > 0 ? "CREDIT" : "DEBIT",
        userId: parametersReceived.userId,
      },
    };
    console.log("paramsparams", params);
    const openingBalTrans = createNewTransaction(params, res, "OPENING_BAL");
    console.log("resultresult", result);
    const body = {
      message: "Added successfully",
      status: 200,
      customerId: customerId,
    };
    // updateWeeklyBal(parametersReceived.createdAt, parametersReceived.openingBal, customerId, customerId, parametersReceived.userId);
    if (result) {
      res.status(200).send(body);
      return;
    } else {
      const body = {error: "Couldn't add customer details.", status: 400};
      res.status(400).send(body);
    }
  } catch (err) {
    console.log("errrr", err);
    const body = {error: "Customer cannot be created", status: 400};
    res.status(400).send(body);
  }
});

customerController.get("/getCustomer/:customerId", async (req, res, next) => {
  const {customerId} = req.params;
  const customer = await getCustomerByCustomerId(customerId);
  if (customer) {
    console.log("datadatadatadata", customer);
    const body = {data: customer, status: 200};
    res.status(200).send(body);
  } else {
    const body = {
      status: 400,
      error: "No customer with this Id",
      data: [],
      message: "Customer fetched successfully",
    };
    res.status(400).send(body);
  }
});
const getCustomersByUserId = async (userId, req) => {
  let customers = [];
  if (req && req?.query?.search) {
    console.log("searchsearch", userId);
    customers = await CustomerTable.find(
      {
        $and: [{userId: userId}, {fullName: {$regex: req?.query?.search, $options: "i"}}],
      },
      {password: 0}
    );
    console.log("lllll", customers);
  } else {
    customers = await CustomerTable.find({userId: userId}, {password: 0});
  }
  return customers;
};

customerController.get("/getCustomers/:userId", async (req, res, next) => {
  try {
    console.log("event.pathParameters", req.params.userId);
    const {userId} = req.params;

    const customerByUserId = await getCustomersByUserId(userId, req);
    console.log("22customerByUserId", customerByUserId);

    if (customerByUserId.length) {
      console.log("datadatadatadata", customerByUserId);
      const body = {data: customerByUserId, status: 200};
      res.status(200).send(body);
    } else {
      const body = {
        status: 200,
        error: "No customer with this user Id",
        data: [],
        message: "Customer fetched succesfully",
      };
      res.status(200).send(body);
    }
  } catch (err) {
    console.log("errr", err);
    res.status(400).send(err);
  }
});

customerController.post("/updateCustomer/:customerId", async (req, res, next) => {
  const data = req.body;
  console.log("datadata", data);
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
    const customer = await CustomerTable.findOne({id: req.params.customerId});
    console.log("customercustomer", customer);
    if (customer) {
      const result = await CustomerTable.updateOne({id: req.params.customerId}, data, {new: true});
      console.log("resultresult1212", result, Object.keys(result).length);
      if (Object.keys(result).length) {
        console.log("resultresult2233", result.modifiedCount, result?.acknowledged);

        if (result?.modifiedCount) {
          const body = {message: "customer details updated successfully", status: 200};
          res.status(200).send(body);
          return;
        } else if (result?.acknowledged) {
          const body = {message: "customer already updated successfully", status: 200};
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
    } else {
      const body = {
        error: "No customer found with this id ",
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

module.exports = customerController;
module.exports.getCustomerByCustomerId = getCustomerByCustomerId;
