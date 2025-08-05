const express = require("express");
const SSLCommerzPayment = require("sslcommerz-lts");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// encode credentials (in case special chars exist)
const DB_USER = encodeURIComponent(process.env.DB_USER);
const DB_PASS = encodeURIComponent(process.env.DB_PASS);
// SSL Commerz Configuration
const store_id = "alif688b9c8219294";
const store_passwd = "alif688b9c8219294@ssl";
const is_live = false; // true for live, false for sandbox

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@cluster0.c1dhaje.mongodb.net/gripsngears?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  ssl: true, // ensure TLS is enforced
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const userCollection = client.db("GripsNGears").collection("users");
    const allProductsCollection = client
      .db("GripsNGears")
      .collection("allproducts");
    const helmetCollection = client.db("GripsNGears").collection("helmet");
    const tyreCollection = client.db("GripsNGears").collection("tyre");
    const sparePartsCollection = client
      .db("GripsNGears")
      .collection("spareParts");
    const cartCollection = client.db("GripsNGears").collection("carts");
    const orderCollection = client.db("GripsNGears").collection("orders");

    //jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //middleware
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    //list of users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //check token email is similiar with user email
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //finding all user and prevent odd user not to add in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //Giving user admin role
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // delete user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // SSL Commerz Payment Initiation API
    app.post("/payment/init", verifyToken, async (req, res) => {
      try {
        const { email, cartItems, totalAmount, customerInfo } = req.body;

        if (!cartItems || cartItems.length === 0) {
          return res.status(400).json({ error: "Cart is empty" });
        }

        // Generate unique transaction ID
        const tran_id = `grips_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const data = {
          total_amount: totalAmount,
          currency: "BDT",
          tran_id: tran_id,

          // CRITICAL FIX: These should point to your BACKEND, not frontend
          success_url: `${BACKEND_URL}/payment/success/${tran_id}`,
          fail_url: `${BACKEND_URL}/payment/fail/${tran_id}`,
          cancel_url: `${BACKEND_URL}/payment/cancel/${tran_id}`,

          // Customer Information
          cus_name: customerInfo.name,
          cus_email: email,
          cus_add1: customerInfo.address,
          cus_add2: customerInfo.address2 || "",
          cus_city: customerInfo.city,
          cus_state: customerInfo.state || "",
          cus_postcode: customerInfo.postcode,
          cus_country: customerInfo.country || "Bangladesh",
          cus_phone: customerInfo.phone,
          cus_fax: customerInfo.phone,

          // Shipping Information (same as customer for now)
          ship_name: customerInfo.name,
          ship_add1: customerInfo.address,
          ship_add2: customerInfo.address2 || "",
          ship_city: customerInfo.city,
          ship_state: customerInfo.state || "",
          ship_postcode: customerInfo.postcode,
          ship_country: customerInfo.country || "Bangladesh",

          // Product Information
          product_name: `Grips & Gears Order - ${cartItems.length} items`,
          product_category: "Motorcycle Parts",
          product_profile: "general",

          // Additional configurations
          shipping_method: "Courier",
          multi_card_name: "mastercard,visacard,amexcard",
          value_a: email, // Store customer email for reference
          value_b: JSON.stringify(cartItems), // Store cart items for reference
          value_c: "", // Reserved for additional data
          value_d: "", // Reserved for additional data
        };

        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

        const apiResponse = await sslcz.init(data);

        if (apiResponse?.GatewayPageURL) {
          // Save pending order to database
          const pendingOrder = {
            transactionId: tran_id,
            email: email,
            customerInfo: customerInfo,
            cartItems: cartItems,
            totalAmount: totalAmount,
            status: "pending",
            createdAt: new Date(),
            paymentStatus: "pending",
          };

          await orderCollection.insertOne(pendingOrder);

          res.json({
            success: true,
            paymentUrl: apiResponse.GatewayPageURL,
            transactionId: tran_id,
          });
        } else {
          res.status(400).json({
            success: false,
            error: "Payment initialization failed",
            details: apiResponse,
          });
        }
      } catch (error) {
        console.error("Payment initialization error:", error);
        res.status(500).json({
          success: false,
          error: "Payment initialization failed",
          message: error.message,
        });
      }
    });

    // SSL Commerz Success Callback - This runs on BACKEND
    app.post("/payment/success/:tran_id", async (req, res) => {
      try {
        const { tran_id } = req.params;
        const paymentData = req.body;

        console.log("✅ Payment Success Data:", paymentData);

        // Validate payment with SSLCommerz
        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        const validation = await sslcz.validate({
          val_id: paymentData.val_id,
        });

        console.log("✅ Validation Result:", validation);

        if (
          validation.status === "VALID" ||
          validation.status === "VALIDATED"
        ) {
          // Find the pending order
          const pendingOrder = await orderCollection.findOne({
            transactionId: tran_id,
          });

          if (!pendingOrder) {
            console.log("❌ Order not found:", tran_id);
            return res.redirect(
              `${FRONTEND_URL}/payment/error?reason=order_not_found`
            );
          }

          // Update order status
          await orderCollection.updateOne(
            { transactionId: tran_id },
            {
              $set: {
                status: "confirmed",
                paymentStatus: "paid",
                paymentDetails: paymentData,
                validationDetails: validation,
                paidAt: new Date(),
              },
            }
          );

          // Clear user's cart
          const cartDeleteResult = await cartCollection.deleteMany({
            email: pendingOrder.email,
          });

          console.log(
            "🗑️ Cart cleared:",
            cartDeleteResult.deletedCount,
            "items"
          );

          // Redirect to frontend success page
          res.redirect(`${FRONTEND_URL}/payment/success/${tran_id}`);
        } else {
          console.log("❌ Payment validation failed:", validation);

          // Payment validation failed
          await orderCollection.updateOne(
            { transactionId: tran_id },
            {
              $set: {
                status: "failed",
                paymentStatus: "failed",
                paymentDetails: paymentData,
                validationDetails: validation,
                failedAt: new Date(),
              },
            }
          );

          res.redirect(`${FRONTEND_URL}/payment/fail/${tran_id}`);
        }
      } catch (error) {
        console.error("❌ Payment success handler error:", error);
        res.redirect(`${FRONTEND_URL}/payment/error?reason=server_error`);
      }
    });

    // SSL Commerz Fail Callback - This runs on BACKEND
    app.post("/payment/fail/:tran_id", async (req, res) => {
      try {
        const { tran_id } = req.params;
        const paymentData = req.body;

        console.log("❌ Payment Failed Data:", paymentData);

        // Update order status
        await orderCollection.updateOne(
          { transactionId: tran_id },
          {
            $set: {
              status: "failed",
              paymentStatus: "failed",
              paymentDetails: paymentData,
              failedAt: new Date(),
            },
          }
        );

        // Redirect to frontend fail page
        res.redirect(`${FRONTEND_URL}/payment/fail/${tran_id}`);
      } catch (error) {
        console.error("❌ Payment fail handler error:", error);
        res.redirect(`${FRONTEND_URL}/payment/error?reason=server_error`);
      }
    });

    // SSL Commerz Cancel Callback - This runs on BACKEND
    app.post("/payment/cancel/:tran_id", async (req, res) => {
      try {
        const { tran_id } = req.params;
        const paymentData = req.body;

        console.log("⚠️ Payment Cancelled Data:", paymentData);

        // Update order status
        await orderCollection.updateOne(
          { transactionId: tran_id },
          {
            $set: {
              status: "cancelled",
              paymentStatus: "cancelled",
              paymentDetails: paymentData,
              cancelledAt: new Date(),
            },
          }
        );

        // Redirect to frontend cancel page
        res.redirect(`${FRONTEND_URL}/payment/cancel/${tran_id}`);
      } catch (error) {
        console.error("❌ Payment cancel handler error:", error);
        res.redirect(`${FRONTEND_URL}/payment/error?reason=server_error`);
      }
    });

    // ALSO ADD: GET endpoints for frontend to check payment status
    app.get("/payment/verify/:tran_id", async (req, res) => {
      try {
        const { tran_id } = req.params;
        const order = await orderCollection.findOne({ transactionId: tran_id });

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        res.json({
          transactionId: order.transactionId,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt,
          paidAt: order.paidAt,
        });
      } catch (error) {
        console.error("❌ Payment verification error:", error);
        res.status(500).json({ error: "Failed to verify payment" });
      }
    });

    // Get order details API (keep existing)
    app.get("/orders/:tran_id", verifyToken, async (req, res) => {
      try {
        const { tran_id } = req.params;
        const order = await orderCollection.findOne({ transactionId: tran_id });

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        res.json(order);
      } catch (error) {
        console.error("Get order error:", error);
        res.status(500).json({ error: "Failed to fetch order" });
      }
    });

    // Get user orders API (keep existing)
    app.get("/orders", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email || email !== req.decoded.email) {
          return res.status(403).json({ error: "Unauthorized access" });
        }

        const orders = await orderCollection
          .find({ email: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(orders);
      } catch (error) {
        console.error("Get user orders error:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
      }
    });

    // Admin: Get all orders (keep existing)
    app.get("/admin/orders", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const orders = await orderCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.json(orders);
      } catch (error) {
        console.error("Get all orders error:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
      }
    });

    // Admin: Update order status (keep existing)
    app.patch(
      "/admin/orders/:tran_id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { tran_id } = req.params;
          const { status } = req.body;

          const result = await orderCollection.updateOne(
            { transactionId: tran_id },
            {
              $set: {
                status: status,
                updatedAt: new Date(),
              },
            }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Order not found" });
          }

          res.json({ message: "Order status updated successfully" });
        } catch (error) {
          console.error("Update order status error:", error);
          res.status(500).json({ error: "Failed to update order status" });
        }
      }
    );

    // admin stats for dashboard for admin dashboard
    app.get("/stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const totalRevenue = await orderCollection
          .aggregate([
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ])
          .toArray();

        const totalOrders = await orderCollection.countDocuments();
        const totalCustomers = await userCollection.countDocuments({
          role: "admin",
        });
        const totalProducts = await allProductsCollection.countDocuments();

        const categories = await allProductsCollection
          .aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }])
          .toArray();

        const topSellingProducts = await orderCollection
          .aggregate([
            { $match: { status: "confirmed" } }, // Only confirmed orders
            { $unwind: "$cartItems" }, // Flatten the cartItems array
            {
              $group: {
                _id: "$cartItems.productId", // Group by productId
                totalSold: { $sum: "$cartItems.quantity" }, // Sum the quantity sold
                name: { $first: "$cartItems.name" }, // Get name from cartItem
                image: { $first: "$cartItems.image" }, // Get image for visualization
              },
            },
            { $sort: { totalSold: -1 } }, // Sort by total quantity sold
            { $limit: 10 }, // Get top 10 products
          ])
          .toArray();

        const monthlyStats = await orderCollection
          .aggregate([
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                monthlyRevenue: { $sum: "$totalAmount" },
                orderCount: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ])
          .toArray();

        res.send({
          totalRevenue: totalRevenue[0]?.total || 0,
          totalOrders,
          totalCustomers,
          totalProducts,
          productCategories: categories,
          monthlyStats,
          topSellingProducts,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch stats" });
      }
    });

    //list of all helmet items
    app.get("/helmet", async (req, res) => {
      const result = await helmetCollection.find().toArray();
      res.send(result);
    });

    //add helmet items
    app.post("/helmet", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await helmetCollection.insertOne(item);
      res.send(result);
    });

    // List of all tyre items
    app.get("/tyre", async (req, res) => {
      const result = await tyreCollection.find().toArray();
      res.send(result);
    });

    // Add tyre items
    app.post("/tyre", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await tyreCollection.insertOne(item);
      res.send(result);
    });

    // List of all spare parts items
    app.get("/spareparts", async (req, res) => {
      const result = await sparePartsCollection.find().toArray();
      res.send(result);
    });

    // Add spare parts items
    app.post("/spareparts", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await sparePartsCollection.insertOne(item);
      res.send(result);
    });

    // List of all products from allProducts collection
    app.get("/allproducts", async (req, res) => {
      const result = await allProductsCollection.find().toArray();
      res.send(result);
    });

    // Add items to allProducts collection
    app.post("/allproducts", async (req, res) => {
      const item = req.body;
      const result = await allProductsCollection.insertOne(item);
      res.send(result);
    });

    // 1. Fixed main product delete endpoint - THIS IS THE CRITICAL ONE
    app.delete(
      "/allproducts/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        console.log(`🔍 DELETE request received for product ID: ${id}`);

        // Try matching ObjectId
        let result = { deletedCount: 0 };
        if (ObjectId.isValid(id)) {
          result = await allProductsCollection.deleteOne({
            _id: new ObjectId(id),
          });
        }

        // If not deleted, try matching string ID
        if (result.deletedCount === 0) {
          result = await allProductsCollection.deleteOne({ _id: id });
        }

        if (result.deletedCount > 0) {
          return res.status(200).json({
            message: "Product deleted successfully",
            deletedCount: result.deletedCount,
          });
        } else {
          return res
            .status(404)
            .json({ message: "Product not found", deletedCount: 0 });
        }
      }
    );

    app.get("/allproducts/:id", async (req, res) => {
      const id = req.params.id;
      try {
        let product = null;

        if (ObjectId.isValid(id)) {
          product = await allProductsCollection.findOne({
            _id: new ObjectId(id),
          });
        }

        if (!product) {
          product = await allProductsCollection.findOne({ _id: id });
        }

        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        res.json(product); // send only the product
      } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({
          message: "Failed to fetch product",
          error: error.message,
        });
      }
    });

    // Update product in allproducts and category collection
    app.put("/allproducts/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        let filter = null;

        // Try ObjectId first
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
          let result = await allProductsCollection.updateOne(filter, {
            $set: updatedData,
          });
          if (result.matchedCount > 0) {
            return res.send({
              message: "Product updated successfully",
              result,
            });
          }
        }

        // Fallback to string-based _id
        filter = { _id: id };
        const result = await allProductsCollection.updateOne(filter, {
          $set: updatedData,
        });

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send({ message: "Product updated successfully", result });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Update failed", error: error.message });
      }
    });

    app.put("/:category/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { category, id } = req.params;
      const updatedData = req.body;

      const collectionMap = {
        helmet: helmetCollection,
        tyre: tyreCollection,
        spareparts: sparePartsCollection,
      };

      const collection = collectionMap[category.toLowerCase()];
      if (!collection) {
        return res.status(400).send({ message: "Invalid category" });
      }

      try {
        let filter = null;

        // Try ObjectId first
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
          let result = await collection.updateOne(filter, {
            $set: updatedData,
          });
          if (result.matchedCount > 0) {
            return res.send({
              message: "Category item updated successfully",
              result,
            });
          }
        }

        // Fallback to string-based _id
        filter = { _id: id };
        const result = await collection.updateOne(filter, {
          $set: updatedData,
        });

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ message: "Category product not found" });
        }

        res.send({ message: "Category item updated successfully", result });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Category update failed", error: error.message });
      }
    });

    // 3. Fixed category delete endpoints
    app.delete("/helmet/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        console.log(`🪖 Deleting helmet with ID: ${id}`);

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            message: "Invalid helmet ID format",
            deletedCount: 0,
          });
        }

        const result = await helmetCollection.deleteOne({
          _id: new ObjectId(id),
        });
        console.log(`Helmet delete result:`, result);

        res.status(200).json({
          message:
            result.deletedCount > 0
              ? "Helmet deleted successfully"
              : "Helmet not found in category",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Helmet delete error:", error);
        res.status(500).json({
          message: "Error deleting helmet",
          error: error.message,
          deletedCount: 0,
        });
      }
    });

    app.delete("/tyre/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        console.log(`🚗 Deleting tyre with ID: ${id}`);

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            message: "Invalid tyre ID format",
            deletedCount: 0,
          });
        }

        const result = await tyreCollection.deleteOne({
          _id: new ObjectId(id),
        });
        console.log(`Tyre delete result:`, result);

        res.status(200).json({
          message:
            result.deletedCount > 0
              ? "Tyre deleted successfully"
              : "Tyre not found in category",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Tyre delete error:", error);
        res.status(500).json({
          message: "Error deleting tyre",
          error: error.message,
          deletedCount: 0,
        });
      }
    });

    app.delete(
      "/spareparts/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          console.log(`🔧 Deleting spare part with ID: ${id}`);

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              message: "Invalid spare part ID format",
              deletedCount: 0,
            });
          }

          const result = await sparePartsCollection.deleteOne({
            _id: new ObjectId(id),
          });
          console.log(`Spare part delete result:`, result);

          res.status(200).json({
            message:
              result.deletedCount > 0
                ? "Spare part deleted successfully"
                : "Spare part not found in category",
            deletedCount: result.deletedCount,
          });
        } catch (error) {
          console.error("Spare part delete error:", error);
          res.status(500).json({
            message: "Error deleting spare part",
            error: error.message,
            deletedCount: 0,
          });
        }
      }
    );

    // cart collection apis
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const { quantity } = req.body;
      const result = await cartCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { quantity } }
      );
      res.send(result);
    });

    //delete cart items
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //check & update cart items
    app.post("/carts", async (req, res) => {
      const { email, productId, name, image, price } = req.body;
      const query = { email, productId };
      const existing = await cartCollection.findOne(query);

      if (existing) {
        const result = await cartCollection.updateOne(
          query,
          { $inc: { quantity: 1 } } // increment quantity
        );
        return res.send({ modified: true, result });
      } else {
        const newItem = { email, productId, name, image, price, quantity: 1 };
        const result = await cartCollection.insertOne(newItem);
        return res.send({ insertedId: result.insertedId });
      }
    });

    await client.db("GripsNGears").command({ ping: 1 });
    console.log("✅ Connected successfully to MongoDB Atlas");
  } catch (error) {
    console.error("❌ Failed to connect:", error);
  }
}
run();

app.get("/", (req, res) => {
  res.send("🚀 Server is running fine");
});

app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});
