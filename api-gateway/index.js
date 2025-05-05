import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import { Kafka } from "kafkajs";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialisation Express
const app = express();
app.use(express.json());

// --------------------------------------------------------------------------
// Configuration des clients
// --------------------------------------------------------------------------

const REST_API_URL = "http://localhost:3000";

// Configuration gRPC corrigée
const grpcProto = protoLoader.loadSync(
  path.join(__dirname, "../availability-service/availability.proto"),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const availabilityProto = grpc.loadPackageDefinition(grpcProto);
const grpcClient = new availabilityProto.Availability(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

// Configuration Kafka améliorée
const kafka = new Kafka({
  clientId: "api-gateway",
  brokers: ["localhost:9092"],
  retry: { retries: 3 },
});
const producer = kafka.producer();

// Connect Kafka producer once at startup
let isKafkaConnected = false;
const connectKafka = async () => {
  if (!isKafkaConnected) {
    await producer.connect();
    isKafkaConnected = true;
    console.log("✅ Kafka Producer connecté");
  }
};

// --------------------------------------------------------------------------
// Schema GraphQL
// --------------------------------------------------------------------------

const typeDefs = gql`
  type Reservation {
    id: ID!
    room: String!
    user: String!
  }

  type Query {
    reservations: [Reservation]
  }

  type Mutation {
    createReservation(room: String!, user: String!): Reservation
  }
`;

const resolvers = {
  Query: {
    reservations: async () => {
      const response = await axios.get(`${REST_API_URL}/reservations`);
      return response.data;
    },
  },
  Mutation: {
    createReservation: async (_, { room, user }) => {
      try {
        // Vérification gRPC améliorée
        const isAvailable = await new Promise((resolve, reject) => {
          grpcClient.CheckRoom({ roomId: room }, (err, response) => {
            if (err) {
              console.error("Erreur gRPC:", err);
              reject(err);
            } else {
              console.log("DEBUG gRPC Response:", response);
              resolve(response?.available);
            }
          });
        });

        if (!isAvailable) {
          throw new Error("Room not available");
        }

        // Création de réservation
        const res = await axios.post(`${REST_API_URL}/reservations`, {
          room,
          user,
        });

        // Notification Kafka avec gestion d'erreur
        try {
          await connectKafka();
          await producer.send({
            topic: "reservation-events",
            messages: [
              {
                value: JSON.stringify({
                  type: "RESERVATION_CREATED",
                  data: res.data,
                  timestamp: new Date().toISOString(),
                }),
              },
            ],
          });
        } catch (kafkaError) {
          console.error("Erreur Kafka (non bloquante):", kafkaError);
        }

        return res.data;
      } catch (err) {
        console.error("Erreur création réservation:", err);
        throw new Error(err.message || "Internal server error");
      }
    },
  },
};

// --------------------------------------------------------------------------
// Initialisation Apollo Server
// --------------------------------------------------------------------------

const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (err) => {
    console.error("GraphQL Error:", err);
    return { message: err.message };
  },
});

await server.start();
server.applyMiddleware({ app });

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "Gateway OK",
    services: {
      gRPC: "localhost:50051",
      REST: REST_API_URL,
      Kafka: "localhost:9092",
    },
  });
});

// --------------------------------------------------------------------------
// Démarrer le serveur
// --------------------------------------------------------------------------

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`🚀 API Gateway démarré sur http://localhost:${PORT}`);
  console.log(`🔮 GraphQL disponible sur http://localhost:${PORT}/graphql`);
});

// Gestion propre de la fermeture
process.on("SIGINT", async () => {
  if (isKafkaConnected) {
    await producer.disconnect();
    console.log("Kafka Producer déconnecté");
  }
  process.exit();
});
