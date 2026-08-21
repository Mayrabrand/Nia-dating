import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const PREMIUM_PRICE = Number(process.env.PREMIUM_PRICE || 5000);
const CURRENCY = process.env.CURRENCY || "TZS";

const SNIPPE_API_URL =
  process.env.SNIPPE_API_URL || "https://api.snippe.sh";

const SNIPPE_API_KEY =
  process.env.SNIPPE_API_KEY || "";

const APP_URL =
  process.env.APP_URL || `http://localhost:${PORT}`;

const WEBHOOK_SECRET =
  process.env.SNIPPE_WEBHOOK_SECRET || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/* ==========================================
   BASIC DATABASE - DEMO
========================================== */

const users = new Map();
const payments = new Map();
const processedWebhooks = new Set();


/* ==========================================
   MIDDLEWARE
========================================== */

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use(express.static(
  path.join(__dirname, "public")
));


/* ==========================================
   HOME
========================================== */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );

});


/* ==========================================
   HEALTH CHECK
========================================== */

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    app: "NIA DATING",
    status: "online",
    time: new Date().toISOString()
  });

});


/* ==========================================
   SIGNUP
========================================== */

app.post("/api/signup", (req, res) => {

  try {

    const {
      name,
      email,
      password
    } = req.body;

    if (!name || !email || !password) {

      return res.status(400).json({
        success: false,
        message: "Jaza taarifa zote."
      });

    }


    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();


    if (users.has(normalizedEmail)) {

      return res.status(409).json({
        success: false,
        message: "Email hii tayari imesajiliwa."
      });

    }


    const user = {

      id: crypto.randomUUID(),

      name: String(name).trim(),

      email: normalizedEmail,

      /*
       * DEMO ONLY.
       * Production tutatumia bcrypt/hash.
       */
      password: String(password),

      premium: false,

      premiumUntil: null,

      createdAt: new Date().toISOString()

    };


    users.set(
      normalizedEmail,
      user
    );


    res.json({

      success: true,

      message: "Account imetengenezwa.",

      user: {

        id: user.id,

        name: user.name,

        email: user.email,

        premium: user.premium

      }

    });

  } catch (error) {

    console.error(
      "SIGNUP ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      message: "Server error."

    });

  }

});


/* ==========================================
   LOGIN
========================================== */

app.post("/api/login", (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;


    if (!email || !password) {

      return res.status(400).json({

        success: false,

        message:
          "Weka email na password."

      });

    }


    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();


    const user =
      users.get(normalizedEmail);


    if (!user) {

      return res.status(401).json({

        success: false,

        message:
          "Email au password sio sahihi."

      });

    }


    if (user.password !== String(password)) {

      return res.status(401).json({

        success: false,

        message:
          "Email au password sio sahihi."

      });

    }


    res.json({

      success: true,

      message: "Login successful.",

      user: {

        id: user.id,

        name: user.name,

        email: user.email,

        premium: user.premium,

        premiumUntil:
          user.premiumUntil

      }

    });

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      message: "Server error."

    });

  }

});


/* ==========================================
   PREMIUM STATUS
========================================== */

app.get(
  "/api/premium/:email",
  (req, res) => {

    const email =
      String(req.params.email)
        .trim()
        .toLowerCase();


    const user =
      users.get(email);


    if (!user) {

      return res.status(404).json({

        success: false,

        message: "User hajapatikana."

      });

    }


    res.json({

      success: true,

      premium: user.premium,

      premiumUntil:
        user.premiumUntil

    });

  }
);


/* ==========================================
   CREATE PAYMENT
========================================== */

app.post(
  "/api/payment/create",
  async (req, res) => {

    try {

      const {
        name,
        email,
        phone
      } = req.body;


      if (!name || !email || !phone) {

        return res.status(400).json({

          success: false,

          message:
            "Jaza jina, email na namba ya simu."

        });

      }


      if (!SNIPPE_API_KEY) {

        return res.status(500).json({

          success: false,

          message:
            "SNIPPE_API_KEY haijawekwa kwenye .env."

        });

      }


      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();


      const user =
        users.get(normalizedEmail);


      if (!user) {

        return res.status(404).json({

          success: false,

          message:
            "Jisajili kwanza kabla ya kulipia Premium."

        });

      }


      /*
       * Payment reference yetu
       */

      const orderId =
        "NIA-" +
        Date.now() +
        "-" +
        crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase();


      /*
       * Save pending payment
       */

      payments.set(orderId, {

        orderId,

        email: normalizedEmail,

        name,

        phone,

        amount: PREMIUM_PRICE,

        currency: CURRENCY,

        status: "pending",

        createdAt:
          new Date().toISOString()

      });


      /*
       * Idempotency key
       *
       * Max 30 characters according
       * to Snippe documentation.
       */

      const idempotencyKey =
        orderId.slice(0, 30);


      /*
       * Webhook URL
       */

      const webhookUrl =
        `${APP_URL}/webhooks/snippe`;


      /*
       * Snippe payment request
       */

      const paymentResponse =
        await fetch(
          `${SNIPPE_API_URL}/v1/payments`,
          {

            method: "POST",

            headers: {

              "Authorization":
                `Bearer ${SNIPPE_API_KEY}`,

              "Content-Type":
                "application/json",

              "Idempotency-Key":
                idempotencyKey

            },

            body: JSON.stringify({

              payment_type: "mobile",

              details: {

                amount:
                  PREMIUM_PRICE,

                currency:
                  CURRENCY

              },

              phone_number:
                normalizePhone(phone),

              customer: {

                firstname:
                  getFirstName(name),

                lastname:
                  getLastName(name),

                email:
                  normalizedEmail

              },

              webhook_url:
                webhookUrl,

              metadata: {

                order_id:
                  orderId,

                product:
                  "NIA DATING PREMIUM",

                plan:
                  "MONTHLY",

                price:
                  PREMIUM_PRICE

              }

            })

          }
        );


      const data =
        await paymentResponse.json();


      console.log(
        "SNIPPE RESPONSE:",
        data
      );


      if (!paymentResponse.ok) {

        payments.delete(orderId);


        return res.status(
          paymentResponse.status
        ).json({

          success: false,

          message:
            data.message ||
            "Payment haijaanzishwa.",

          error: data

        });

      }


      const paymentData =
        data.data || data;


      const reference =
        paymentData.reference;


      /*
       * Update payment
       */

      const savedPayment =
        payments.get(orderId);


      if (savedPayment) {

        savedPayment.reference =
          reference;

        savedPayment.status =
          paymentData.status ||
          "pending";

      }


      /*
       * Return response to frontend
       */

      res.json({

        success: true,

        message:
          "Payment imeanzishwa. Angalia simu yako kwa USSD push.",

        orderId,

        reference,

        status:
          paymentData.status ||
          "pending",

        amount:
          PREMIUM_PRICE,

        currency:
          CURRENCY

      });

    } catch (error) {

      console.error(
        "PAYMENT CREATE ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Imeshindikana kuanzisha payment.",

        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined

      });

    }

  }
);


/* ==========================================
   CHECK PAYMENT STATUS
========================================== */

app.get(
  "/api/payment/status/:reference",
  async (req, res) => {

    try {

      const reference =
        req.params.reference;


      if (!SNIPPE_API_KEY) {

        return res.status(500).json({

          success: false,

          message:
            "SNIPPE_API_KEY haijawekwa."

        });

      }


      const response =
        await fetch(
          `${SNIPPE_API_URL}/v1/payments/${encodeURIComponent(reference)}`,
          {

            method: "GET",

            headers: {

              "Authorization":
                `Bearer ${SNIPPE_API_KEY}`,

              "Content-Type":
                "application/json"

            }

          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        return res.status(
          response.status
        ).json({

          success: false,

          error: data

        });

      }


      const payment =
        data.data || data;


      res.json({

        success: true,

        status:
          payment.status,

        reference:
          payment.reference,

        amount:
          payment.amount,

        provider:
          payment.channel?.provider ||
          null

      });

    } catch (error) {

      console.error(
        "STATUS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Imeshindikana kuangalia status."

      });

    }

  }
);


/* ==========================================
   SNIPPE WEBHOOK
========================================== */

/*
 * NOTE:
 *
 * Production webhook should verify
 * X-Webhook-Signature using the
 * signing secret from Snippe.
 *
 * We keep raw body here so signature
 * verification can be added safely.
 */

app.post(
  "/webhooks/snippe",
  express.raw({
    type: "application/json"
  }),
  async (req, res) => {

    try {

      const rawBody =
        req.body;


      /*
       * Verify webhook signature
       */

      if (WEBHOOK_SECRET) {

        const signature =
          req.headers[
            "x-webhook-signature"
          ];

        const timestamp =
          req.headers[
            "x-webhook-timestamp"
          ];


        if (!signature || !timestamp) {

          return res.status(401).json({

            success: false,

            message:
              "Webhook signature missing."

          });

        }


        const valid =
          verifyWebhookSignature(
            rawBody,
            signature,
            timestamp,
            WEBHOOK_SECRET
          );


        if (!valid) {

          return res.status(401).json({

            success: false,

            message:
              "Invalid webhook signature."

          });

        }

      }


      const body =
        JSON.parse(
          rawBody.toString()
        );


      console.log(
        "SNIPPE WEBHOOK:",
        JSON.stringify(
          body,
          null,
          2
        )
      );


      /*
       * Current event format
       */

      const eventType =
        body.type ||
        body.event ||
        req.headers[
          "x-webhook-event"
        ];


      const eventId =
        body.id ||
        body.data?.reference ||
        body.reference;


      /*
       * Prevent duplicate webhook
       */

      if (eventId) {

        if (
          processedWebhooks.has(eventId)
        ) {

          return res.json({

            success: true,

            message:
              "Webhook already processed."

          });

        }

      }


      const data =
        body.data || body;


      const reference =
        data.reference ||
        body.reference;


      /*
       * PAYMENT COMPLETED
       */

      if (
        eventType ===
        "payment.completed"
      ) {

        const orderId =
          data.metadata?.order_id ||
          data.metadata?.url_metadata?.order_id;


        const amount =
          Number(
            data.amount?.value ??
            data.amount ??
            0
          );


        const currency =
          data.amount?.currency ||
          CURRENCY;


        /*
         * Security:
         * Premium only activates if
         * amount and currency match.
         */

        if (
          amount !== PREMIUM_PRICE ||
          currency !== CURRENCY
        ) {

          console.error(
            "Invalid payment amount:",
            {
              amount,
              currency
            }
          );


          return res.status(400).json({

            success: false,

            message:
              "Invalid payment amount."

          });

        }


        let payment = null;


        /*
         * Find our payment by orderId
         */

        if (orderId) {

          payment =
            payments.get(orderId);

        }


        /*
         * If payment not found,
         * search by reference.
         */

        if (!payment && reference) {

          for (
            const item
            of payments.values()
          ) {

            if (
              item.reference ===
              reference
            ) {

              payment = item;

              break;

            }

          }

        }


        if (payment) {

          payment.status =
            "completed";

          payment.completedAt =
            new Date().toISOString();

          payment.reference =
            reference;


          /*
           * Activate Premium
           */

          const user =
            users.get(payment.email);


          if (user) {

            user.premium =
              true;


            /*
             * 30 days Premium
             */

            const expiry =
              new Date();

            expiry.setDate(
              expiry.getDate() + 30
            );


            user.premiumUntil =
              expiry.toISOString();

          }

        }


        console.log(
          "NIA PREMIUM ACTIVATED:",
          {
            orderId,
            reference,
            email:
              payment?.email
          }
        );

      }


      /*
       * PAYMENT FAILED
       */

      if (
        eventType ===
        "payment.failed"
      ) {

        if (reference) {

          for (
            const item
            of payments.values()
          ) {

            if (
              item.reference ===
              reference
            ) {

              item.status =
                "failed";

            }

          }

        }


        console.log(
          "NIA PAYMENT FAILED:",
          reference
        );

      }


      /*
       * PAYMENT EXPIRED
       */

      if (
        eventType ===
        "payment.expired"
      ) {

        if (reference) {

          for (
            const item
            of payments.values()
          ) {

            if (
              item.reference ===
              reference
            ) {

              item.status =
                "expired";

            }

          }

        }

      }


      if (eventId) {

        processedWebhooks.add(
          eventId
        );

      }


      /*
       * Always respond quickly
       */

      res.status(200).json({

        success: true,

        received: true

      });

    } catch (error) {

      console.error(
        "WEBHOOK ERROR:",
        error
      );


      res.status(400).json({

        success: false,

        message:
          "Invalid webhook."

      });

    }

  }
);


/* ==========================================
   WEBHOOK SIGNATURE
========================================== */

function verifyWebhookSignature(
  rawBody,
  signature,
  timestamp,
  secret
) {

  try {

    /*
     * Prevent replay attacks.
     *
     * Five minutes.
     */

    const now =
      Math.floor(
        Date.now() / 1000
      );

    const webhookTime =
      Number(timestamp);


    if (
      !Number.isFinite(
        webhookTime
      )
    ) {

      return false;

    }


    if (
      Math.abs(
        now - webhookTime
      ) > 300
    ) {

      return false;

    }


    /*
     * HMAC SHA256
     */

    const signedPayload =
      `${timestamp}.${rawBody.toString()}`;


    const expected =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(
          signedPayload
        )
        .digest("hex");


    /*
     * Some providers prefix
     * signatures.
     */

    const cleanSignature =
      String(signature)
        .replace(/^sha256=/i, "")
        .trim();


    if (
      expected.length !==
      cleanSignature.length
    ) {

      return false;

    }


    return crypto.timingSafeEqual(

      Buffer.from(expected),

      Buffer.from(cleanSignature)

    );

  } catch (error) {

    console.error(
      "SIGNATURE ERROR:",
      error
    );

    return false;

  }

}


/* ==========================================
   PHONE NORMALIZER
========================================== */

function normalizePhone(phone) {

  let value =
    String(phone)
      .trim()
      .replace(/\s+/g, "")
      .replace(/-/g, "");


  if (
    value.startsWith("+255")
  ) {

    value =
      value.substring(1);

  }


  if (
    value.startsWith("0")
  ) {

    value =
      "255" +
      value.substring(1);

  }


  return value;

}


/* ==========================================
   NAME HELPERS
========================================== */

function getFirstName(name) {

  const parts =
    String(name)
      .trim()
      .split(/\s+/);


  return parts[0] || "NIA";

}


function getLastName(name) {

  const parts =
    String(name)
      .trim()
      .split(/\s+/);


  if (parts.length < 2) {

    return "User";

  }


  return parts
    .slice(1)
    .join(" ");

}


/* ==========================================
   404
========================================== */

app.use(
  (req, res) => {

    res.status(404).json({

      success: false,

      message:
        "Route haijapatikana."

    });

  }
);


/* ==========================================
   ERROR HANDLER
========================================== */

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error
    );


    res.status(500).json({

      success: false,

      message:
        "Internal server error."

    });

  }
);


/* ==========================================
   START SERVER
========================================== */

app.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "===================================="
    );

    console.log(
      "❤️  NIA DATING SERVER"
    );

    console.log(
      "===================================="
    );

    console.log(
      `🌐 http://localhost:${PORT}`
    );

    console.log(
      `💎 Premium: TZS ${PREMIUM_PRICE}`
    );

    console.log(
      "📱 M-Pesa"
    );

    console.log(
      "🔴 Airtel Money"
    );

    console.log(
      "🔵 Mixx by Yas"
    );

    console.log(
      "🟠 HaloPesa"
    );

    console.log(
      "===================================="
    );

  }
);
