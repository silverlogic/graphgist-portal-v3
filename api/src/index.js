import { ApolloServer } from "apollo-server-express";
import express from "express";
import cors from "cors";
import neo4j from "neo4j-driver";
import { makeAugmentedSchema } from "neo4j-graphql-js";
import { GraphQLUpload } from "graphql-upload";
import Asciidoctor from "asciidoctor";

import dotenv from "dotenv";

dotenv.config();

import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

import { getUser } from "./auth";
import { typeDefs } from "./graphql-schema";

import * as usersMutations from "./users/mutations";
import * as usersQueries from "./users/queries";

import * as graphgistsMutations from "./graphgists/mutations";
import * as graphgistsQueries from "./graphgists/queries";
import * as graphgistsTypes from "./graphgists/types";

import * as categoriesMutations from "./categories/mutations";
import * as categoriesTypes from "./categories/types";

import * as imagesTypes from "./images/types";
import { getGraphGistBySlug, getGraphGistByUUID } from "./graphgists/utils";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});

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
  ),
  {
    maxConnectionPoolSize: 500,
  }
);

const app = express();

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());
app.set("view engine", "ejs");

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
      ...graphgistsMutations,
      ...categoriesMutations,
    },
    Query: {
      ...usersQueries,
      ...graphgistsQueries,
    },
    ...graphgistsTypes,
    ...categoriesTypes,
    ...imagesTypes,
    Upload: GraphQLUpload,
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
  context: async ({ req }) => {
    const user = await getUser(driver, req);
    return {
      driver,
      user,
      cypherParams: {
        currentUser: user ? user.uuid : null
      }
    };
  },
  schema: schema,
  introspection: true,
  playground: true,
  formatError: (error) => ({
    ...error,
    state: error.originalError && error.originalError.state,
    extensions: {
      ...error.extensions,
      exception: {
      ...error.extensions.exception,
        stacktrace: process.env.NODE_ENV !== "production" ? error.extensions.exception.stacktrace : undefined
      }
    }
  }),
});

// Specify port and path for GraphQL endpoint
const port = process.env.PORT || process.env.GRAPHQL_LISTEN_PORT || 4001;
const path = "/graphql";

/*
 * Optionally, apply Express middleware for authentication, etc
 * This also also allows us to specify a path for the GraphQL endpoint
 */
server.applyMiddleware({ app, path });

app.get("/graph_gists/:slug/graph_guide", function (req, res) {
  const session = driver.session();
  const txc = session.beginTransaction();
  getGraph(req.params.slug, txc).then((graph) => {
    //const adocText =graph.asciidoc.replaceAll(/^=+ /, '== ')
    const adoc = Asciidoctor();
    res.render("index", {
      title: graph.title,
      html: adoc.convert(graph.asciidoc, {
        attributes: {
          "env-guide": true,
          "experimental": true
        },
        header_footer: true,
        catalog_assets: true,
        safe: 0,
        template_dir: 'views',
        template_cache: false,
      })
    });
  }).catch((error) => {
    console.error(error);
    res.render("404");
  });
});

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

app.listen({ port, path }, () => {
  console.log(`GraphQL server ready at http://localhost:${port}${path}`);
});

async function getGraph(slug, txc) {
  let graphGist = await getGraphGistBySlug(txc, slug);
  if (!graphGist) {
    graphGist = await getGraphGistByUUID(txc, slug);
  }
  return graphGist;
}
