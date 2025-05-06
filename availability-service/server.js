// Version corrigée utilisant le nouveau format de lowdb avec données par défaut
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const { join } = path;

// Créer une fonction principale async pour pouvoir utiliser await avec dynamic import
async function startServer() {
  // Importer lowdb avec dynamic import (nouvelle structure)
  const { Low } = await import("lowdb");
  const { JSONFile } = await import("lowdb/node");

  // Configuration LowDB avec données par défaut
  const file = join(__dirname, "availability.json");
  const adapter = new JSONFile(file);
  // Fournir des données par défaut lors de l'initialisation
  const defaultData = { rooms: [] };
  const db = new Low(adapter, defaultData);

  // Initialisation des données
  async function initDB() {
    await db.read();

    // Vérifier si les chambres existent et les ajouter si nécessaire
    if (db.data.rooms.length === 0) {
      db.data.rooms = [
        { id: "101", available: false },
        { id: "102", available: true },
        { id: "103", available: false },
      ];
      await db.write();
    }
  }

  // Charger le protobuf
  const packageDefinition = protoLoader.loadSync("availability.proto", {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const availabilityProto = grpc.loadPackageDefinition(packageDefinition);

  // Implémenter le service
  const server = new grpc.Server();
  server.addService(availabilityProto.Availability.service, {
    CheckRoom: async (call, callback) => {
      try {
        await db.read();
        const room = db.data.rooms.find((r) => r.id === call.request.roomId);
        callback(null, { available: room?.available ?? false });
      } catch (err) {
        console.error("Erreur DB:", err);
        callback(err);
      }
    },
  });

  // Démarrer le serveur
  await initDB();
  server.bindAsync(
    "0.0.0.0:50051",
    grpc.ServerCredentials.createInsecure(),
    () => {
      console.log("gRPC Server running on port 50051");
      server.start();
    }
  );
}

// Démarrer le serveur et gérer les erreurs
startServer().catch((err) => {
  console.error("Erreur au démarrage du serveur:", err);
});
