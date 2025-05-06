import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const db = new Low(new JSONFile("./availability.json"), {
  rooms: [
    { id: "101", available: false },
    { id: "102", available: true },
  ],
});

export default db;
