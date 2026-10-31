import { connectToMongoDB, getMongoDb } from "@workspace/db";
import router from "../routes/adminReports.ts";

async function testAllReports() {
  console.log("Connecting to MongoDB Atlas...");
  await connectToMongoDB();
  console.log("Connected to MongoDB!");

  // Mock req / res
  function makeReqRes(path, query = {}) {
    let statusCode = 200;
    let jsonResult = null;
    const req = {
      query,
      path,
      headers: { "x-admin-key": "vastraa_admin_secret_key_2026_secure" },
      log: { error: console.error, info: console.log },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      },
    };
    return { req, res, getResult: () => ({ statusCode, jsonResult }) };
  }

  // Find the route handlers from router
  const handlers = {};
  for (const layer of router.stack) {
    if (layer.route) {
      const p = layer.route.path;
      // Get the last middleware in route stack (the handler)
      const h = layer.route.stack[layer.route.stack.length - 1].handle;
      handlers[p] = h;
    }
  }

  console.log("Available routes in adminReports:", Object.keys(handlers));

  for (const period of ["30d", "monthly", "today", "yesterday", "7d", "last_month", "yearly"]) {
    console.log(`\n================ Testing period: ${period} ================`);

    // 1. Revenue
    if (handlers["/admin/reports/revenue"]) {
      const { req, res, getResult } = makeReqRes("/admin/reports/revenue", { period });
      await handlers["/admin/reports/revenue"](req, res);
      const { jsonResult } = getResult();
      console.log(`Revenue Summary (${period}):`, JSON.stringify(jsonResult?.summary, null, 2));
      console.log(`Trend data points count: ${jsonResult?.trend?.length}, non-zero points: ${jsonResult?.trend?.filter(t => t.revenue > 0).length}`);
    }

    // 2. Sales
    if (handlers["/admin/reports/sales"]) {
      const { req, res, getResult } = makeReqRes("/admin/reports/sales", { period });
      await handlers["/admin/reports/sales"](req, res);
      const { jsonResult } = getResult();
      console.log(`Sales Summary (${period}):`, JSON.stringify(jsonResult?.summary, null, 2));
      console.log(`Categories count: ${jsonResult?.byCategory?.length}, Orders count: ${jsonResult?.orders?.length}`);
    }

    // 3. Vendors
    if (handlers["/admin/reports/vendors"]) {
      const { req, res, getResult } = makeReqRes("/admin/reports/vendors", { period });
      await handlers["/admin/reports/vendors"](req, res);
      const { jsonResult } = getResult();
      console.log(`Vendor Summary (${period}):`, JSON.stringify(jsonResult?.summary, null, 2));
      console.log(`Top vendors count: ${jsonResult?.topVendors?.length}`);
      if (jsonResult?.topVendors?.length > 0) {
        console.log("Sample top vendor:", jsonResult.topVendors[0]);
      }
    }

    // 4. Customers
    if (handlers["/admin/reports/customers"]) {
      const { req, res, getResult } = makeReqRes("/admin/reports/customers", { period });
      await handlers["/admin/reports/customers"](req, res);
      const { jsonResult } = getResult();
      console.log(`Customer Summary (${period}):`, JSON.stringify(jsonResult?.summary, null, 2));
      console.log(`Top customers count: ${jsonResult?.topCustomers?.length}`);
    }

    // 5. Products
    if (handlers["/admin/reports/products"]) {
      const { req, res, getResult } = makeReqRes("/admin/reports/products", { period });
      await handlers["/admin/reports/products"](req, res);
      const { jsonResult } = getResult();
      console.log(`Product Summary (${period}):`, JSON.stringify(jsonResult?.summary, null, 2));
      console.log(`Category highlights:`, jsonResult?.categoryHighlights);
      console.log(`Best sellers count: ${jsonResult?.bestSellers?.length}`);
    }

    // 6. Returns
    if (handlers["/admin/reports/returns"]) {
      const { req, res, getResult } = makeReqRes("/admin/reports/returns", { period });
      await handlers["/admin/reports/returns"](req, res);
      const { jsonResult } = getResult();
      console.log(`Returns Summary (${period}):`, JSON.stringify(jsonResult?.summary, null, 2));
      console.log(`Return reasons:`, jsonResult?.byReason);
      console.log(`Recent returns count: ${jsonResult?.recentReturns?.length}`);
    }
  }

  process.exit(0);
}

testAllReports().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
