const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");

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

    const helmetCollection = client.db("GripsNGears").collection("helmet");

    app.get("/helmet", async (req, res) => {
      const result = await helmetCollection.find().toArray();
      res.send(result);
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
