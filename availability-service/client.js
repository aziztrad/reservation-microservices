const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const packageDefinition = protoLoader.loadSync("availability.proto");
const availabilityProto = grpc.loadPackageDefinition(packageDefinition);

const client = new availabilityProto.Availability(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

client.CheckRoom({ roomId: "101", date: "2024-01-01" }, (err, response) => {
  console.log("Disponibilité:", response.available ? "Oui" : "Non");
});
