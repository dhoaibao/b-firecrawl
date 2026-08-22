import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { describe, expect, it } from "vitest";

describe("raw request body handling", () => {
  it("keeps Fastify's existing malformed JSON 400 response", async () => {
    const fastify = Fastify();
    await fastify.register(rawBody as any, { field: "rawBody", global: true, encoding: "utf8", runFirst: true });
    fastify.post("/v1/test", (_request, reply) => reply.send({ success: true }));
    await fastify.ready();

    const response = await fastify.inject({
      method: "POST",
      url: "/v1/test",
      headers: { "content-type": "application/json" },
      payload: "{\"x\":",
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      statusCode: 400,
      code: "FST_ERR_CTP_INVALID_JSON_BODY",
      error: "Bad Request",
      message: "Body is not valid JSON but content-type is set to 'application/json'",
    });
    await fastify.close();
  });
});
