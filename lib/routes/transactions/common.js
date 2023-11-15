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
    let updatedBal = balance || 0;
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

    parametersReceived.updatedBal = updatedBal;
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

function generateHeader(doc, length) {
  doc.image("logo.png", 50, 45, {width: 50}).fillColor("#444444").fontSize(20).text("Ledgerbook Inc.", 110, 57).moveDown();
}
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

module.exports.createNewTransaction = createNewTransaction;
module.exports.updateCustomerBal = updateCustomerBal;
