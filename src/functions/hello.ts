import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function helloHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  const name = request.query.get("name") || (await request.text()) || "World";

  return {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Hello, ${name}!`,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    }),
  };
}

app.http("hello", {
  methods: ["GET", "POST"],
  authLevel: "function",
  handler: helloHandler,
});
