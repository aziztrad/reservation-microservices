const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

// Charger le fichier proto
const packageDefinition = protoLoader.loadSync("availability.proto");
const availabilityProto = grpc.loadPackageDefinition(packageDefinition);

// Implémenter le service
const server = new grpc.Server();
server.addService(availabilityProto.Availability.service, {
  CheckRoom: (call, callback) => {
    const { roomId, date } = call.request;
    // Logique simplifiée : la salle est disponible si son ID est pair
    const available = parseInt(roomId) % 2 === 0;
    callback(null, { available });
  },
});

// Démarrer le serveur
server.bindAsync(
  "0.0.0.0:50051",
  grpc.ServerCredentials.createInsecure(),
  () => {
    console.log("gRPC Server running on port 50051");
    server.start();
  }
);
