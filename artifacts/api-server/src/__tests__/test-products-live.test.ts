import { describe, it, expect } from "vitest";
import request from "supertest";
import { connectToMongoDB } from "@workspace/db";
import app from "../app";

describe("Live Product HTTP Endpoint Tests with Exact Frontend Params", () => {
  it("tests /api/products?category=paithani&sort=rating_desc&page=1&limit=12", async () => {
    await connectToMongoDB();

    const urlPaithani = "/api/products?category=paithani&sort=rating_desc&page=1&limit=12";
    const resPaithani = await request(app).get(urlPaithani);
    console.log("Status Paithani:", resPaithani.status);
    console.log("Body Paithani:", JSON.stringify(resPaithani.body, null, 2));
    expect(resPaithani.status).toBe(200);

    const urlDesigner = "/api/products?category=designer&sort=rating_desc&page=1&limit=24";
    const resDesigner = await request(app).get(urlDesigner);
    console.log("Status Designer:", resDesigner.status);
    console.log("Body Designer:", JSON.stringify(resDesigner.body, null, 2));
    expect(resDesigner.status).toBe(200);
  }, 30000);
});
