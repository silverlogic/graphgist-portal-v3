import { ApolloServer } from "apollo-server-express";
import express from "express";
import neo4j from "neo4j-driver";
import { makeAugmentedSchema } from "neo4j-graphql-js";

import dotenv from "dotenv";
dotenv.config();

import { getUser } from "./auth";
import { typeDefs } from "./graphql-schema";

import * as usersMutations from "./users/mutations";
import * as usersQueries from "./users/queries";

import * as graphgistsMutations from "./graphgists/mutations";
import * as graphgistsQueries from "./graphgists/queries";
import * as graphgistsTypes from "./graphgists/types";

import * as imagesTypes from "./images/types";

/*
 * Create a Neo4j driver instance to connect to the database
 * using credentials specified as environment variables
 * with fallback to defaults
 */
export const driver = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(
    process.env.NEO4J_USER || "neo4j",
    process.env.NEO4J_PASSWORD || "neo4j"
  )
);

const app = express();

/*
 * Create an executable GraphQL schema object from GraphQL type definitions
 * including autogenerated queries and mutations.
 * Optionally a config object can be included to specify which types to include
 * in generated queries and/or mutations. Read more in the docs:
 * https://grandstack.io/docs/neo4j-graphql-js-api.html#makeaugmentedschemaoptions-graphqlschema
 */

export const schema = makeAugmentedSchema({
  typeDefs,
  resolvers: {
    Mutation: {
      ...usersMutations,
      ...graphgistsMutations
    },
    Query: {
      ...usersQueries,
      ...graphgistsQueries
    },
    ...graphgistsTypes,
    ...imagesTypes
  },
  config: {
    mutation: false,
  },
});

/*
 * Create a new ApolloServer instance, serving the GraphQL schema
 * created using makeAugmentedSchema above and injecting the Neo4j driver
 * instance into the context object so it is available in the
 * generated resolvers to connect to the database.
 */
const server = new ApolloServer({
  context: ({ req }) => {
    const user = getUser(driver, req);
    return {
      driver,
      user,
    };
  },
  schema: schema,
  introspection: true,
  playground: true,
  formatError: error => ({
    message: error.message,
    state: error.originalError && error.originalError.state,
    locations: error.locations,
    path: error.path,
  })
});

// Specify port and path for GraphQL endpoint
const port = process.env.PORT || process.env.GRAPHQL_LISTEN_PORT || 4001;
const path = "/graphql";

/*
 * Optionally, apply Express middleware for authentication, etc
 * This also also allows us to specify a path for the GraphQL endpoint
 */
server.applyMiddleware({ app, path });

app.listen({ port, path }, () => {
  console.log(`GraphQL server ready at http://localhost:${port}${path}`);
});
