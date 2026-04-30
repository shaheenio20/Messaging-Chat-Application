require('dotenv').config();
const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { Server } = require("socket.io");

app.use(cors());
app.use(express.json());

// ----- MongoDB Connection -----
// Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues (ECONNREFUSED ::1)
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let messagesCollection;

async function startServer() {
  // 1. Attempt MongoDB Connection (Optional)
  try {
    await client.connect();
    const db = client.db("chatapp");
    messagesCollection = db.collection("messages");
    console.log("🗄️  Connected to MongoDB");
  } catch (err) {
    console.error("⚠️  MongoDB connection failed. Chat will work but history won't be saved.");
    console.error("Error details:", err.message);
  }

  // 2. Initialize HTTP Server & Socket.io (Always runs)
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("join_room", (room) => {
      socket.join(room);
      console.log(`User ${socket.id} joined room ${room}`);
    });

    socket.on("send_message", async (data) => {
      try {
        const doc = { ...data, timestamp: new Date() };
        
        // Save to DB only if collection is available
        if (messagesCollection) {
          await messagesCollection.insertOne(doc);
        }
        
        // Always broadcast message to the room
        io.to(data.room).emit("receive_message", doc);
      } catch (err) {
        console.error("Failed to process message:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("User Disconnected", socket.id);
    });
  });

  // REST endpoint for history
  app.get("/messages/:room", async (req, res) => {
    if (!messagesCollection) {
      return res.status(503).json({ error: "Database not available" });
    }
    try {
      const room = req.params.room;
      const msgs = await messagesCollection
        .find({ room })
        .sort({ timestamp: 1 })
        .limit(100)
        .toArray();
      res.json(msgs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🚀 SERVER RUNNING on http://localhost:${PORT}`);
  });
}

startServer();

