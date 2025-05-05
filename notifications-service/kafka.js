const { Kafka, Partitioners } = require("kafkajs");

const kafka = new Kafka({
  clientId: "reservation-service",
  brokers: ["localhost:9092"],
  logLevel: 1, // ERROR only
  retry: {
    initialRetryTime: 300,
    retries: 5,
    maxRetryTime: 5000,
  },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  allowAutoTopicCreation: false, // Meilleure pratique
});

const consumer = kafka.consumer({
  groupId: "notification-group",
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 500,
  allowAutoTopicCreation: false,
  retry: {
    retries: 3,
  },
});

async function connect() {
  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({
      topic: "reservation-events",
      fromBeginning: true,
    });
    console.log("✅ Kafka connecté (mode standard)");
  } catch (err) {
    console.error("Échec connexion Kafka:", err);
    throw err;
  }
}

module.exports = { producer, consumer, connect };
