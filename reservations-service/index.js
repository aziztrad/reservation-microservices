const express = require("express");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { producer } = require("../notifications-service/kafka");
const sqlite = require("sqlite3").verbose();
const app = express();
app.use(express.json());

// Configuration de la base de données SQLite
const db = new sqlite.Database("./reservations.db", (err) => {
  if (err) {
    console.error("Erreur DB:", err.message);
  } else {
    console.log("✅ Connecté à la base SQLite");
    db.run(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room TEXT NOT NULL,
        user TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});

// Configuration gRPC
const packageDefinition = protoLoader.loadSync(
  "../availability-service/availability.proto",
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const availabilityProto = grpc.loadPackageDefinition(packageDefinition);
const grpcClient = new availabilityProto.Availability(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

// Cache de connexion Kafka
let isKafkaConnected = false;

const connectKafka = async () => {
  if (!isKafkaConnected) {
    try {
      await producer.connect();
      isKafkaConnected = true;
      console.log("✅ Producteur Kafka connecté");
    } catch (err) {
      console.error("Échec de connexion Kafka:", err);
      throw err;
    }
  }
};

// POST /reservations
app.post("/reservations", async (req, res) => {
  const { room, user } = req.body;

  if (!room || !user) {
    return res.status(400).json({ error: "Room and user are required" });
  }

  try {
    // 1. Vérification disponibilité
    const isAvailable = await new Promise((resolve) => {
      grpcClient.CheckRoom({ roomId: room }, (err, response) => {
        resolve(err ? false : response?.available);
      });
    });

    if (!isAvailable) {
      return res.status(409).json({ error: "Room not available" });
    }

    // 2. Création réservation dans SQLite
    const newReservation = await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO reservations (room, user) VALUES (?, ?)",
        [room, user],
        function (err) {
          if (err) return reject(err);
          resolve({
            id: this.lastID,
            room,
            user,
            createdAt: new Date().toISOString(),
          });
        }
      );
    });

    // 3. Notification Kafka
    try {
      await connectKafka();
      await producer.send({
        topic: "reservation-events",
        messages: [
          {
            value: JSON.stringify({
              type: "RESERVATION_CREATED",
              data: newReservation,
              metadata: { service: "reservation-service" },
            }),
          },
        ],
      });
    } catch (kafkaError) {
      console.error("Erreur Kafka (non bloquante):", kafkaError);
    }

    res.status(201).json(newReservation);
  } catch (err) {
    console.error("Erreur:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reservations
app.get("/reservations", (req, res) => {
  db.all("SELECT * FROM reservations", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Gestion de la fermeture
process.on("SIGINT", async () => {
  if (isKafkaConnected) {
    await producer.disconnect();
    console.log("Producteur Kafka déconnecté");
  }
  db.close();
  process.exit();
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`REST Service running on http://localhost:${PORT}`);
});
