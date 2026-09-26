import { describe, it, expect, vi } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { helloHandler } from "../src/functions/hello.js";

describe("helloHandler", () => {
  it("should return greeting with default 'World' when no name provided", async () => {
    const mockRequest = {
      url: "http://localhost:7071/api/hello",
      query: new Map<string, string>(),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as HttpRequest;

    const mockContext = {
      log: vi.fn(),
    } as unknown as InvocationContext;

    const response = await helloHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.message).toBe("Hello, World!");
    expect(mockContext.log).toHaveBeenCalled();
  });

  it("should return greeting with specified name parameter", async () => {
    const queryMap = new Map<string, string>();
    queryMap.set("name", "Alice");

    const mockRequest = {
      url: "http://localhost:7071/api/hello?name=Alice",
      query: queryMap,
      text: vi.fn().mockResolvedValue(""),
    } as unknown as HttpRequest;

    const mockContext = {
      log: vi.fn(),
    } as unknown as InvocationContext;

    const response = await helloHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.message).toBe("Hello, Alice!");
  });
});
