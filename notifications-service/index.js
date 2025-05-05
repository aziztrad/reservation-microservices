const { consumer, connect } = require("./kafka");

const run = async () => {
  try {
    await connect();

    consumer.on(consumer.events.GROUP_JOIN, () => {
      console.log("👥 Consumer intégré au groupe");
    });

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          console.log(`📩 [${partition}] Message reçu:`, event);

          // Traitement métier ici

          await consumer.commitOffsets([
            {
              topic,
              partition,
              offset: (Number(message.offset) + 1).toString(),
            },
          ]);
        } catch (err) {
          console.error("❌ Erreur traitement:", err);
        }
      },
    });
  } catch (err) {
    console.error("💥 Erreur majeure:", err);
    process.exit(1);
  }
};

run();
