const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// encode credentials (in case special chars exist)
const DB_USER = encodeURIComponent(process.env.DB_USER);
const DB_PASS = encodeURIComponent(process.env.DB_PASS);

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
      console.log("inside verify token", req.headers.authorization);
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

    // delete product
    app.delete(
      "/allproducts/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await allProductsCollection.deleteOne(query);
        res.send(result);
      }
    );

    // category wise delete item
    // delete for helmet
    app.delete("/helmet/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await helmetCollection.deleteOne(query);
      res.send(result);
    });

    //delete for tyre
    app.delete("/tyre/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tyreCollection.deleteOne(query);
      res.send(result);
    });

    //delete for spareparts
    app.delete(
      "/spareparts/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await sparePartsCollection.deleteOne(query);
        res.send(result);
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
