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


// ── Get Catalog with Images ───────────────────────────────────────────────────
app.get("/catalog", async (req, res) => {
  try {
    // Fetch everything in one call
    const { result } = await client.catalogApi.listCatalog(undefined, "ITEM,IMAGE");
    const objects = result.objects || [];

    // Build image map first: id -> url
    const images = {};
    for (const obj of objects) {
      if (obj.type === "IMAGE" && obj.imageData?.url) {
        images[obj.id] = obj.imageData.url;
      }
    }

    // Match items to their images
    const items = [];
    for (const obj of objects) {
      if (obj.type === "ITEM") {
        const imageIds = obj.itemData?.imageIds || [];
        const imageUrl = imageIds.length > 0 ? (images[imageIds[0]] || null) : null;
        items.push({
          id: obj.id,
          name: obj.itemData?.name,
          description: obj.itemData?.description,
          imageUrl,
          variations: (obj.itemData?.variations || []).map(v => ({
            id: v.id,
            name: v.itemVariationData?.name,
            price: Number(v.itemVariationData?.priceMoney?.amount || 0) / 100,
          })),
        });
      }
    }

    // Debug info
    const withImages = items.filter(i => i.imageUrl).length;
    console.log(`Catalog: ${items.length} items, ${withImages} with images, ${Object.keys(images).length} total images`);

    res.json({ items, imageCount: Object.keys(images).length, itemCount: items.length, withImages });
  } catch (err) {
    console.error("Catalog error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ── Debug - see raw Square image data ────────────────────────────────────────
app.get("/debug-images", async (req, res) => {
  try {
    const { result } = await client.catalogApi.listCatalog(undefined, "IMAGE");
    const raw = (result.objects || []).slice(0, 3).map(obj => ({
      id: obj.id,
      type: obj.type,
      imageData: obj.imageData,
    }));
    res.json({ count: result.objects?.length || 0, sample: raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Search catalog by name ────────────────────────────────────────────────────
app.get("/search/:name", async (req, res) => {
  try {
    const { result } = await client.catalogApi.listCatalog(undefined, "ITEM,IMAGE");
    const objects = result.objects || [];
    const images = {};
    for (const obj of objects) {
      if (obj.type === "IMAGE" && obj.imageData?.url) {
        images[obj.id] = obj.imageData.url;
      }
    }
    const search = req.params.name.toLowerCase();
    const matches = objects
      .filter(obj => obj.type === "ITEM" && obj.itemData?.name?.toLowerCase().includes(search))
      .map(obj => ({
        name: obj.itemData?.name,
        imageIds: obj.itemData?.imageIds || [],
        imageUrl: obj.itemData?.imageIds?.[0] ? images[obj.itemData.imageIds[0]] : null,
      }));
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sherelle's API running on port ${PORT}`));
