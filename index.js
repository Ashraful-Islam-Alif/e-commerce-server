const express = require("express");
const app = express();
const cors = require("cors");
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
    const helmetCollection = client.db("GripsNGears").collection("helmet");
    const cartCollection = client.db("GripsNGears").collection("carts");

    //list of users
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
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
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", async (req, res) => {
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
