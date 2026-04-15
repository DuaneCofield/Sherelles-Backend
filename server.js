const express = require("express");
const cors = require("cors");
const { Client, Environment } = require("square");

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
  accessToken: process.env.SQUARE_TOKEN,
  environment: Environment.Production,
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "Sherelle's API running ✅" });
});

// ── Create Order ──────────────────────────────────────────────────────────────
app.post("/create-order", async (req, res) => {
  try {
    const { lineItems, orderType, form } = req.body;
    const locationId = process.env.SQUARE_LOCATION;

    const fulfillment = orderType === "delivery" ? {
      type: "DELIVERY",
      state: "PROPOSED",
      deliveryDetails: {
        recipient: {
          displayName: form.name,
          phoneNumber: form.phone,
          address: { addressLine1: form.address },
        },
        scheduleType: "ASAP",
        note: form.special || "",
      },
    } : {
      type: "PICKUP",
      state: "PROPOSED",
      pickupDetails: {
        recipient: {
          displayName: form.name,
          phoneNumber: form.phone,
        },
        scheduleType: "ASAP",
        note: form.special || "",
      },
    };

    const { result } = await client.ordersApi.createOrder({
      order: {
        locationId,
        lineItems: lineItems.map(item => ({
          name: item.name,
          quantity: String(item.quantity),
          basePriceMoney: {
            amount: BigInt(Math.round(item.price * 100)),
            currency: "USD",
          },
        })),
        fulfillments: [fulfillment],
      },
      idempotencyKey: crypto.randomUUID(),
    });

    res.json({ orderId: result.order.id });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Process Payment ───────────────────────────────────────────────────────────
app.post("/process-payment", async (req, res) => {
  try {
    const { sourceId, amount, orderId, form } = req.body;
    const locationId = process.env.SQUARE_LOCATION;

    const { result } = await client.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(amount * 100)),
        currency: "USD",
      },
      orderId,
      locationId,
      buyerEmailAddress: form.email || undefined,
      billingAddress: form.address ? {
        addressLine1: form.address,
      } : undefined,
      note: `Sherelle's order for ${form.name}`,
    });

    res.json({
      paymentId: result.payment.id,
      status: result.payment.status,
      receiptUrl: result.payment.receiptUrl,
    });
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Get Location (verify connection) ─────────────────────────────────────────
app.get("/verify", async (req, res) => {
  try {
    const { result } = await client.locationsApi.retrieveLocation(
      process.env.SQUARE_LOCATION
    );
    res.json({
      connected: true,
      locationName: result.location.name,
      currency: result.location.currency,
    });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sherelle's API running on port ${PORT}`));
