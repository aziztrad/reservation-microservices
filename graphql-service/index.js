const { ApolloServer, gql } = require("apollo-server");
const axios = require("axios");

// Schéma GraphQL
const typeDefs = gql`
  type Reservation {
    id: ID!
    room: String!
    user: String!
  }

  type Query {
    reservations: [Reservation]
    reservationsByUser(user: String!): [Reservation]
  }
`;

// Résolveurs (logique des requêtes)
const resolvers = {
  Query: {
    reservations: async () => {
      const response = await axios.get("http://localhost:3000/reservations");
      return response.data;
    },
    reservationsByUser: async (_, { user }) => {
      const response = await axios.get("http://localhost:3000/reservations");
      return response.data.filter((r) => r.user === user);
    },
  },
};

// Démarrer le serveur
const server = new ApolloServer({ typeDefs, resolvers });
server.listen({ port: 4000 }).then(({ url }) => {
  console.log(`🚀 Serveur GraphQL prêt à ${url}`);
});
