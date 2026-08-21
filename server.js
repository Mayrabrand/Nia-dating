require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json());
app.use(express.static(__dirname));


// ===============================
// HOME PAGE
// ===============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


// ===============================
// CREATE PREMIUM PAYMENT
// ===============================

app.post("/api/create-payment", async (req, res) => {

  try {

    const {
      phone,
      paymentMethod,
      userName,
      userEmail
    } = req.body;


    // VALIDATE

    if (!phone) {

      return res.status(400).json({
        success: false,
        message: "Tafadhali ingiza namba ya simu."
      });

    }


    // Tanzania phone number

    let cleanPhone = phone
      .replace(/\s/g, "")
      .replace(/-/g, "");


    // Convert 07XXXXXXXX to 2557XXXXXXXX

    if (cleanPhone.startsWith("0")) {

      cleanPhone =
        "255" +
        cleanPhone.substring(1);

    }


    if (
      !cleanPhone.startsWith("255") ||
      cleanPhone.length < 12
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Ingiza namba sahihi. Mfano: 0712345678"
      });

    }


    // PAYMENT METHODS

    const methodMap = {

      "M-PESA": "MPESA",

      "AIRTEL MONEY": "AIRTELMONEY",

      "MIX BY YAS": "MIXXBYYAS",

      "HALOPESA": "HALOPESA"

    };


    const selectedMethod =
      methodMap[paymentMethod];


    if (!selectedMethod) {

      return res.status(400).json({
        success: false,
        message:
          "Njia ya malipo haijatambulika."
      });

    }


    // UNIQUE ORDER ID

    const orderId =
      "NIA-" +
      Date.now() +
      "-" +
      crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase();


    // PREMIUM PRICE

    const amount = 5000;


    /*
    ===================================

    SELCOM PAYMENT DATA

    API credentials zinatoka .env

    ===================================
    */


    const paymentData = {

      vendor:
        process.env.SELCOM_VENDOR,

      order_id:
        orderId,

      buyer_email:
        userEmail ||
        "customer@niadating.com",

      buyer_name:
        userName ||
        "NIA DATING USER",

      buyer_user_id:
        "NIA-USER",

      buyer_phone:
        cleanPhone,

      amount:
        amount,

      currency:
        "TZS",

      payment_methods:
        selectedMethod,

      payment_method:
        "MOBILEMONEY",

      msisdn:
        cleanPhone,

      redirect_url:
        Buffer
          .from(
            process.env.REDIRECT_URL ||
            "http://localhost:3000"
          )
          .toString("base64"),

      cancel_url:
        Buffer
          .from(
            process.env.REDIRECT_URL ||
            "http://localhost:3000"
          )
          .toString("base64"),

      webhook:
        process.env.WEBHOOK_URL
          ? Buffer
              .from(
                process.env.WEBHOOK_URL
              )
              .toString("base64")
          : "",

      payer_remarks:
        "NIA DATING PREMIUM",

      merchant_remarks:
        "Premium subscription TZS 5000"

    };


    /*
    ===================================

    IMPORTANT

    Selcom inahitaji API Key,
    API Secret na signed request.

    Usitumie API key ndani
    ya index.html.

    Hapa chini tunaweka endpoint
    ya kuanzisha malipo.

    ===================================
    */


    const timestamp =
      new Date()
        .toISOString();


    const apiKey =
      process.env.SELCOM_API_KEY;


    const apiSecret =
      process.env.SELCOM_API_SECRET;


    if (
      !apiKey ||
      !apiSecret ||
      !process.env.SELCOM_VENDOR
    ) {

      return res.status(500).json({

        success: false,

        message:
          "Payment API bado haijawekwa. Weka SELCOM_API_KEY, SELCOM_API_SECRET na SELCOM_VENDOR kwenye .env"

      });

    }


    /*
    Signed fields.
    Order yake lazima ifanane
    na payload inayosainiwa.
    */

    const signedFields = [

      "vendor",

      "order_id",

      "buyer_email",

      "buyer_name",

      "buyer_user_id",

      "buyer_phone",

      "amount",

      "currency",

      "payment_methods",

      "payment_method",

      "msisdn"

    ];


    /*
    CREATE SIGNING STRING
    */

    let signingString =
      "timestamp=" +
      timestamp;


    signedFields.forEach(field => {

      signingString +=
        "&" +
        field +
        "=" +
        (paymentData[field] || "");

    });


    /*
    HMAC SHA256 DIGEST
    */

    const digest =
      crypto
        .createHmac(
          "sha256",
          apiSecret
        )
        .update(signingString)
        .digest("base64");


    /*
    SELCOM API URL

    Confirm endpoint/version
    against your Selcom merchant
    documentation/credentials.
    */

    const selcomUrl =
      process.env.SELCOM_API_URL;


    if (!selcomUrl) {

      return res.status(500).json({

        success: false,

        message:
          "Weka SELCOM_API_URL kwenye .env"

      });

    }


    /*
    SEND PAYMENT REQUEST
    */

    const response =
      await fetch(selcomUrl, {

        method: "POST",

        headers: {

          "Accept":
            "application/json",

          "Content-Type":
            "application/json",

          "Authorization":
            "SELCOM " +
            Buffer
              .from(apiKey)
              .toString("base64"),

          "Digest-Method":
            "HS256",

          "Digest":
            digest,

          "Timestamp":
            timestamp,

          "Signed-Fields":
            signedFields.join(",")

        },

        body:
          JSON.stringify(paymentData)

      });


    const result =
      await response.json();


    console.log(
      "SELCOM RESPONSE:",
      result
    );


    /*
    RETURN RESULT TO WEBSITE
    */

    if (!response.ok) {

      return res.status(response.status).json({

        success: false,

        message:
          result.message ||
          "Malipo hayakuanzishwa.",

        data:
          result

      });

    }


    res.json({

      success: true,

      message:
        "Payment request imeanzishwa.",

      orderId:
        orderId,

      amount:
        amount,

      data:
        result

    });


  } catch (error) {

    console.error(
      "PAYMENT ERROR:",
      error
    );


    res.status(500).json({

      success: false,

      message:
        "Kuna tatizo kwenye payment server.",

      error:
        error.message

    });

  }

});


// ===============================
// SELCOM WEBHOOK
// ===============================

app.post(
  "/api/payment-webhook",
  (req, res) => {

    try {

      console.log(
        "PAYMENT WEBHOOK:",
        req.body
      );


      /*
      HAPA NDIPO
      UNAVERIFY PAYMENT STATUS.

      Payment ikiwa SUCCESS:

      1. Save payment kwenye database
      2. Mpe user PREMIUM
      3. Weka expiry date
      */


      const payment =
        req.body;


      console.log(
        "Payment received:",
        payment
      );


      res.status(200).json({

        success: true,

        message:
          "Webhook received"

      });


    } catch (error) {

      console.error(
        "WEBHOOK ERROR:",
        error
      );


      res.status(500).json({

        success: false

      });

    }

  }
);


// ===============================
// PAYMENT SUCCESS CHECK
// ===============================

app.get(
  "/api/payment-status/:orderId",
  async (req, res) => {

    const orderId =
      req.params.orderId;


    /*
    BAADAYE HAPA
    TUTAWEKA API CALL YA
    KU-CHECK PAYMENT STATUS
    */

    res.json({

      success: true,

      orderId: orderId,

      status: "PENDING",

      message:
        "Payment status endpoint ipo tayari."

    });

  }
);


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

  console.log("");

  console.log(
    "❤️ NIA DATING SERVER RUNNING"
  );

  console.log(
    "http://localhost:" + PORT
  );

  console.log("");

});
