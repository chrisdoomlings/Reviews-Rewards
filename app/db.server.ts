import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

// In production (Vercel serverless) connection_limit=1 is correct — one connection
// per function invocation avoids exhausting the PgBouncer pool.
// In local dev, multiple concurrent queries share one process, so we raise the
// limit to avoid "connection pool timeout" errors from Promise.all loaders.
function buildClient() {
  if (process.env.NODE_ENV !== "production") {
    const devUrl = (process.env.DATABASE_URL ?? "").replace(
      /connection_limit=\d+/,
      "connection_limit=10"
    );
    return new PrismaClient({
      datasources: { db: { url: devUrl } },
    });
  }
  return new PrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = buildClient();
  }
}

const prisma = global.prismaGlobal ?? buildClient();

export default prisma;
