const express = require("express");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { producer } = require("../notifications-service/kafka");
const app = express();
app.use(express.json());

// Fake database
let reservations = [];

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

// Middleware de connexion Kafka
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
      grpcClient.CheckRoom(
        { roomId: room, date: new Date().toISOString().split("T")[0] },
        (err, response) => {
          resolve(err ? false : response?.available);
        }
      );
    });

    if (!isAvailable) {
      return res.status(409).json({ error: "Room not available" });
    }

    // 2. Création réservation
    const newReservation = {
      id: reservations.length + 1,
      room,
      user,
      createdAt: new Date().toISOString(),
    };
    reservations.push(newReservation);

    // 3. Notification Kafka (avec gestion d'erreur isolée)
    try {
      await connectKafka();

      await producer.send({
        topic: "reservation-events",
        messages: [
          {
            key: room, // Permet le partitionnement par salle
            value: JSON.stringify({
              type: "RESERVATION_CREATED",
              data: newReservation,
              metadata: {
                service: "reservation-service",
                version: "1.0",
              },
            }),
          },
        ],
      });
    } catch (kafkaError) {
      console.error("Erreur Kafka (non bloquante):", kafkaError);
      // On continue même si Kafka échoue
    }

    res.status(201).json(newReservation);
  } catch (err) {
    console.error("Erreur:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reservations
app.get("/reservations", (req, res) => {
  res.json(reservations);
});

// Gestion propre de la fermeture
process.on("SIGINT", async () => {
  if (isKafkaConnected) {
    await producer.disconnect();
    console.log("Producteur Kafka déconnecté");
  }
  process.exit();
});

// Démarrer le serveur
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`REST Service running on http://localhost:${PORT}`);
});
