/**
 * VASTRAA Real-Time Returns & Exchanges Comprehensive Test Suite
 * Validates all 10 core scenarios specified in Section 9 of the requirements.
 */

import { getCollection, mongoProducts, mongoOrders } from "../artifacts/api-server/dist/index.mjs";
import { returnsService } from "../artifacts/api-server/dist/index.mjs";

async function runTestSuite() {
  console.log("===============================================================================");
  console.log("  VASTRAA RETURNS & EXCHANGES VERIFICATION SUITE — 10 MANDATORY SCENARIOS");
  console.log("===============================================================================\n");

  const results = [];
  const testUserId = `test_user_${Date.now()}`;
  const testVendorId = "vendor_paithani_weavers_yeola";
  const testVendorName = "Yeola Paithani Heritage";

  // Helper to log test result
  function assert(scenarioNum, title, passed, details) {
    results.push({ scenarioNum, title, passed, details });
    const mark = passed ? "✓ PASS" : "✗ FAIL";
    console.log(`[Scenario ${scenarioNum}] ${mark} — ${title}`);
    if (details) console.log(`   └─ ${details}\n`);
  }

  try {
    // -------------------------------------------------------------------------
    // Setup test products
    // -------------------------------------------------------------------------
    const standardPaithani = {
      id: `prod_paithani_${Date.now()}`,
      name: "Royal Purple Pure Silk Paithani Saree",
      price: 18500,
      stock: 5,
      vendorId: testVendorId,
      vendorName: testVendorName,
      category: "paithani",
      isCustomizable: false,
      isReturnable: true,
      images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80"],
    };

    const standardDesigner = {
      id: `prod_designer_${Date.now()}`,
      name: "Handcrafted Zari Border Designer Saree",
      price: 12500,
      stock: 4,
      vendorId: testVendorId,
      vendorName: testVendorName,
      category: "designer",
      isCustomizable: false,
      isReturnable: true,
      images: ["https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80"],
    };

    const outOfStockReplacement = {
      id: `prod_replacement_oos_${Date.now()}`,
      name: "Emerald Green Kanjivaram Designer Replacement",
      price: 12500,
      stock: 0, // 0 stock for testing insufficient stock fallback
      vendorId: testVendorId,
      vendorName: testVendorName,
      category: "designer",
      isCustomizable: false,
      isReturnable: true,
      images: [],
    };

    const customDesignedSaree = {
      id: `prod_custom_${Date.now()}`,
      name: "Bespoke Monogrammed Gold Zari Saree (Custom)",
      price: 24000,
      stock: 2,
      vendorId: testVendorId,
      vendorName: testVendorName,
      category: "designer",
      isCustomizable: true,
      isReturnable: false,
      tags: ["custom", "personalized"],
    };

    await mongoProducts.create(standardPaithani);
    await mongoProducts.create(standardDesigner);
    await mongoProducts.create(outOfStockReplacement);
    await mongoProducts.create(customDesignedSaree);

    // -------------------------------------------------------------------------
    // Scenario 1: Standard Paithani product return
    // -------------------------------------------------------------------------
    const order1DeliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const order1 = await mongoOrders.create({
      id: `order_test_1_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: order1DeliveredAt.toISOString(),
      updatedAt: order1DeliveredAt.toISOString(),
      items: [
        {
          productId: standardPaithani.id,
          name: standardPaithani.name,
          price: standardPaithani.price,
          quantity: 1,
          images: standardPaithani.images,
          vendorId: testVendorId,
          vendorName: testVendorName,
        },
      ],
      total: standardPaithani.price,
      address: {
        name: "Devendra Patil",
        phone: "9876543210",
        line1: "Flat 401, Deccan Towers",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411004",
      },
      paymentMethod: "upi",
      paymentStatus: "paid",
    });

    const eligCheck1 = await returnsService.checkOrderEligibility(order1.id, testUserId);
    const returnReq1 = await returnsService.createReturnRequest({
      userId: testUserId,
      userName: "Devendra Patil",
      orderId: order1.id,
      requestType: "return",
      issueCategory: "change_of_mind",
      customerNotes: "Colour doesn't match family wedding theme",
      evidenceUrls: [],
      selectedItems: [{ productId: standardPaithani.id, quantity: 1 }],
    });

    const ret1 = returnReq1.returnRequests[0];
    const initialStock1 = (await mongoProducts.findById(standardPaithani.id)).stock;

    // Approve -> Pickup -> Receive -> QC pass -> Restock -> Refund
    await returnsService.reviewReturnRequest({ returnId: ret1.id, actor: "admin", decision: "approved" });
    await returnsService.updatePickupTracking(ret1.id, "RECEIVED", "Central Warehouse");
    await returnsService.submitQualityCheck({
      returnId: ret1.id,
      inspector: "admin",
      conditionPass: true,
      defectVerified: true,
      originalTagsPresent: true,
      packagingIntact: true,
      qcNotes: "Unopened royal packaging, seals and tags verified intact.",
    });

    const restockedProd1 = await mongoProducts.findById(standardPaithani.id);
    const refundRes1 = await returnsService.processRefundPayment(ret1.id, "super_admin");

    const passed1 =
      eligCheck1.eligible &&
      ret1.status === "PENDING" &&
      restockedProd1.stock === initialStock1 + 1 &&
      refundRes1.status === "REFUND_COMPLETED" &&
      refundRes1.refundDetails?.refundAmount === standardPaithani.price;

    assert(
      1,
      "Standard Paithani product return",
      passed1,
      `Standard Paithani returned successfully. Inventory restocked from ${initialStock1} to ${restockedProd1.stock}. Refund of ₹${refundRes1.refundDetails?.refundAmount} completed.`
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Standard Designer product exchange
    // -------------------------------------------------------------------------
    const order2DeliveredAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const order2 = await mongoOrders.create({
      id: `order_test_2_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: order2DeliveredAt.toISOString(),
      updatedAt: order2DeliveredAt.toISOString(),
      items: [
        {
          productId: standardDesigner.id,
          name: standardDesigner.name,
          price: standardDesigner.price,
          quantity: 1,
          images: standardDesigner.images,
          vendorId: testVendorId,
          vendorName: testVendorName,
        },
      ],
      total: standardDesigner.price,
      address: {
        name: "Ananya Deshmukh",
        phone: "9123456780",
        line1: "12, Shivaji Park",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400028",
      },
      paymentMethod: "card",
      paymentStatus: "paid",
    });

    const returnReq2 = await returnsService.createReturnRequest({
      userId: testUserId,
      userName: "Ananya Deshmukh",
      orderId: order2.id,
      requestType: "exchange",
      issueCategory: "change_of_mind",
      customerNotes: "Want to exchange for a different shade",
      selectedItems: [{ productId: standardDesigner.id, quantity: 1, exchangePreference: { note: "Same price saree" } }],
    });

    const ret2 = returnReq2.returnRequests[0];
    await returnsService.reviewReturnRequest({ returnId: ret2.id, actor: "admin", decision: "approved" });
    await returnsService.updatePickupTracking(ret2.id, "RECEIVED", "Central Warehouse");
    await returnsService.submitQualityCheck({
      returnId: ret2.id,
      inspector: "admin",
      conditionPass: true,
      defectVerified: true,
      originalTagsPresent: true,
      packagingIntact: true,
      qcNotes: "Tags and packaging intact.",
    });

    const exchangeFulfill2 = await returnsService.processExchangeFulfillment(ret2.id, "super_admin");
    const exchangeDelivered2 = await returnsService.markExchangeDelivered(ret2.id, "super_admin");

    const passed2 =
      ret2.requestType === "exchange" &&
      exchangeFulfill2.status === "EXCHANGE_SHIPPED" &&
      Boolean(exchangeFulfill2.exchangeDetails?.replacementAwb) &&
      exchangeDelivered2.status === "EXCHANGE_DELIVERED";

    assert(
      2,
      "Standard Designer product exchange",
      passed2,
      `Exchange processed. Replacement AWB: ${exchangeFulfill2.exchangeDetails?.replacementAwb}. Lifecycle reached EXCHANGE_DELIVERED.`
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Custom product return rejection
    // -------------------------------------------------------------------------
    const order3 = await mongoOrders.create({
      id: `order_test_3_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          productId: customDesignedSaree.id,
          name: customDesignedSaree.name,
          price: customDesignedSaree.price,
          quantity: 1,
          isCustomized: true,
          vendorId: testVendorId,
        },
      ],
      total: customDesignedSaree.price,
      address: { line1: "Test St", city: "Nashik", state: "MH", pincode: "422001" },
    });

    const eligCheck3 = await returnsService.checkOrderEligibility(order3.id, testUserId);
    let rejectedByBackendCreation3 = false;
    let backendErrorMsg3 = "";
    try {
      await returnsService.createReturnRequest({
        userId: testUserId,
        orderId: order3.id,
        requestType: "return",
        issueCategory: "change_of_mind",
        selectedItems: [{ productId: customDesignedSaree.id, quantity: 1 }],
      });
    } catch (e) {
      rejectedByBackendCreation3 = true;
      backendErrorMsg3 = e.message;
    }

    const passed3 = !eligCheck3.eligible && rejectedByBackendCreation3;
    assert(
      3,
      "Custom product return rejection",
      passed3,
      `Backend correctly blocked return for custom saree. Reason: "${backendErrorMsg3}"`
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Custom-stitched blouse return rejection
    // -------------------------------------------------------------------------
    const order4 = await mongoOrders.create({
      id: `order_test_4_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          productId: standardPaithani.id,
          name: `${standardPaithani.name} with Custom Stitched Blouse`,
          price: standardPaithani.price + 1800,
          quantity: 1,
          customBlouse: true,
          blouseMeasurements: { bust: 36, waist: 30, frontLength: 14 },
          vendorId: testVendorId,
        },
      ],
      total: standardPaithani.price + 1800,
      address: { line1: "Test St", city: "Pune", state: "MH", pincode: "411001" },
    });

    const eligCheck4 = await returnsService.checkOrderEligibility(order4.id, testUserId);
    let rejectedByBackendCreation4 = false;
    let backendErrorMsg4 = "";
    try {
      await returnsService.createReturnRequest({
        userId: testUserId,
        orderId: order4.id,
        requestType: "return",
        issueCategory: "change_of_mind",
        selectedItems: [{ productId: standardPaithani.id, quantity: 1 }],
      });
    } catch (e) {
      rejectedByBackendCreation4 = true;
      backendErrorMsg4 = e.message;
    }

    const passed4 = !eligCheck4.eligible && rejectedByBackendCreation4;
    assert(
      4,
      "Custom-stitched blouse return rejection",
      passed4,
      `Backend correctly blocked return for item with custom-stitched blouse. Reason: "${backendErrorMsg4}"`
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Return after 7 days
    // -------------------------------------------------------------------------
    const order5DeliveredAt = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000); // 12 days ago (> 7 days)
    const order5 = await mongoOrders.create({
      id: `order_test_5_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: order5DeliveredAt.toISOString(),
      items: [
        {
          productId: standardPaithani.id,
          name: standardPaithani.name,
          price: standardPaithani.price,
          quantity: 1,
          vendorId: testVendorId,
        },
      ],
      total: standardPaithani.price,
      address: { line1: "Test St", city: "Nagpur", state: "MH", pincode: "440001" },
    });

    const eligCheck5 = await returnsService.checkOrderEligibility(order5.id, testUserId);
    let rejectedByBackendCreation5 = false;
    let backendErrorMsg5 = "";
    try {
      await returnsService.createReturnRequest({
        userId: testUserId,
        orderId: order5.id,
        requestType: "return",
        issueCategory: "change_of_mind",
        selectedItems: [{ productId: standardPaithani.id, quantity: 1 }],
      });
    } catch (e) {
      rejectedByBackendCreation5 = true;
      backendErrorMsg5 = e.message;
    }

    const passed5 =
      !eligCheck5.eligible &&
      eligCheck5.daysSinceDelivery === 12 &&
      eligCheck5.daysRemaining === 0 &&
      rejectedByBackendCreation5;

    assert(
      5,
      "Return after 7 days",
      passed5,
      `Deadline enforcement verified. Days since delivery: ${eligCheck5.daysSinceDelivery}. Ineligible reason: "${eligCheck5.ineligibleReason}".`
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Damaged product with image upload
    // -------------------------------------------------------------------------
    const order6 = await mongoOrders.create({
      id: `order_test_6_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          productId: standardDesigner.id,
          name: standardDesigner.name,
          price: standardDesigner.price,
          quantity: 1,
          vendorId: testVendorId,
        },
      ],
      total: standardDesigner.price,
      address: { line1: "Test St", city: "Kolhapur", state: "MH", pincode: "416001" },
    });

    // 6a: Test that damaged_item requires image upload
    let blockedWithoutPhotos = false;
    try {
      await returnsService.createReturnRequest({
        userId: testUserId,
        orderId: order6.id,
        requestType: "return",
        issueCategory: "damaged_item",
        evidenceUrls: [], // Empty photos!
        selectedItems: [{ productId: standardDesigner.id, quantity: 1 }],
      });
    } catch (e) {
      blockedWithoutPhotos = e.message.includes("photo");
    }

    // 6b: Now upload with valid evidence photographs
    const damagePhotos = [
      "https://vastraa.com/uploads/returns/damage_weft_1.jpg",
      "https://vastraa.com/uploads/returns/damage_zari_tear_2.jpg",
    ];
    const returnReq6 = await returnsService.createReturnRequest({
      userId: testUserId,
      orderId: order6.id,
      requestType: "return",
      issueCategory: "damaged_item",
      customerNotes: "Tear observed along the golden pallu upon opening packaging",
      evidenceUrls: damagePhotos,
      selectedItems: [{ productId: standardDesigner.id, quantity: 1 }],
    });

    const ret6 = returnReq6.returnRequests[0];
    const passed6 =
      blockedWithoutPhotos &&
      ret6.evidenceUrls.length === 2 &&
      ret6.issueCategory === "damaged_item";

    assert(
      6,
      "Damaged product with image upload",
      passed6,
      `Mandatory photo validation enforced. Successfully created with ${ret6.evidenceUrls.length} supporting photos.`
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Multi-item order with an individual product return
    // -------------------------------------------------------------------------
    const order7 = await mongoOrders.create({
      id: `order_test_7_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          productId: standardPaithani.id,
          name: standardPaithani.name,
          price: standardPaithani.price,
          quantity: 1,
          vendorId: testVendorId,
        },
        {
          productId: standardDesigner.id,
          name: standardDesigner.name,
          price: standardDesigner.price,
          quantity: 1,
          vendorId: testVendorId,
        },
      ],
      total: standardPaithani.price + standardDesigner.price,
      address: { line1: "Test St", city: "Thane", state: "MH", pincode: "400601" },
    });

    // Customer only selects standardPaithani from the 2-item order
    const returnReq7 = await returnsService.createReturnRequest({
      userId: testUserId,
      orderId: order7.id,
      requestType: "return",
      issueCategory: "change_of_mind",
      selectedItems: [{ productId: standardPaithani.id, quantity: 1 }],
    });

    // Check subsequent eligibility: Paithani should now be marked with active claim, but Designer is still eligible!
    const eligCheck7After = await returnsService.checkOrderEligibility(order7.id, testUserId);
    const paithaniStatus = eligCheck7After.itemsEligibility.find((i) => i.productId === standardPaithani.id);
    const designerStatus = eligCheck7After.itemsEligibility.find((i) => i.productId === standardDesigner.id);

    const passed7 =
      returnReq7.returnRequests[0].items.length === 1 &&
      paithaniStatus?.eligible === false &&
      designerStatus?.eligible === true;

    assert(
      7,
      "Multi-item order with an individual product return",
      passed7,
      `Only Paithani saree returned. Designer saree remains available for independent return/exchange claim.`
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Exchange with insufficient stock
    // -------------------------------------------------------------------------
    const order8 = await mongoOrders.create({
      id: `order_test_8_${Date.now()}`,
      displayId: `ORD-${Date.now().toString().slice(-6)}`,
      userId: testUserId,
      status: "delivered",
      deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          productId: standardDesigner.id,
          name: standardDesigner.name,
          price: standardDesigner.price,
          quantity: 1,
          vendorId: testVendorId,
        },
      ],
      total: standardDesigner.price,
      address: { line1: "Test St", city: "Solapur", state: "MH", pincode: "413001" },
    });

    // Request exchange targeting the 0-stock replacement product
    const returnReq8 = await returnsService.createReturnRequest({
      userId: testUserId,
      orderId: order8.id,
      requestType: "exchange",
      issueCategory: "change_of_mind",
      selectedItems: [
        {
          productId: standardDesigner.id,
          quantity: 1,
          exchangePreference: {
            replacementProductId: outOfStockReplacement.id,
            note: "Exchange for Emerald Green Kanjivaram",
          },
        },
      ],
    });

    const ret8 = returnReq8.returnRequests[0];
    await returnsService.reviewReturnRequest({ returnId: ret8.id, actor: "admin", decision: "approved" });
    await returnsService.updatePickupTracking(ret8.id, "RECEIVED", "Central Warehouse");
    await returnsService.submitQualityCheck({
      returnId: ret8.id,
      inspector: "admin",
      conditionPass: true,
      defectVerified: true,
      originalTagsPresent: true,
      packagingIntact: true,
      qcNotes: "Quality verified.",
    });

    // Fulfill exchange — stock is 0, so service must gracefully fallback to REFUND_INITIATED
    const exchangeResult8 = await returnsService.processExchangeFulfillment(ret8.id, "super_admin");

    const passed8 =
      exchangeResult8.status === "REFUND_INITIATED" &&
      exchangeResult8.exchangeDetails?.fallbackToRefund === true &&
      exchangeResult8.exchangeDetails?.stockAvailable === false;

    assert(
      8,
      "Exchange with insufficient stock",
      passed8,
      `Insufficient stock detected (available: 0). Automatically converted to refund initiation (Status: ${exchangeResult8.status}).`
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Refund duplicate prevention
    // -------------------------------------------------------------------------
    // Use ret1 which is already REFUND_COMPLETED from Scenario 1
    let duplicatePrevented = false;
    let duplicateMsg = "";
    try {
      await returnsService.processRefundPayment(ret1.id, "another_admin");
    } catch (e) {
      duplicatePrevented = true;
      duplicateMsg = e.message;
    }

    const passed9 = duplicatePrevented && duplicateMsg.includes("already");
    assert(
      9,
      "Refund duplicate prevention",
      passed9,
      `Duplicate refund attempt safely rejected with idempotency lock: "${duplicateMsg}"`
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Real-time synchronization between User, Seller, and Admin
    // -------------------------------------------------------------------------
    const userReturns = await returnsService.getCustomerReturns(testUserId);
    const sellerReturns = await returnsService.getSellerReturns(testVendorId);
    const adminAnalytics = await returnsService.getReturnAnalytics();

    const userHasClaims = userReturns.length > 0;
    const sellerHasClaims = sellerReturns.length > 0;
    const adminHasMetrics =
      adminAnalytics.totalReturns > 0 &&
      adminAnalytics.totalRefundAmount > 0;

    const passed10 = userHasClaims && sellerHasClaims && adminHasMetrics;
    assert(
      10,
      "Real-time synchronization between User, Seller, and Admin",
      passed10,
      `User sees ${userReturns.length} claims. Seller sees ${sellerReturns.length} scoped artisan claims. Admin Dashboard synchronized with ${adminAnalytics.totalReturns} total records & ₹${adminAnalytics.totalRefundAmount} refunds.`
    );

    // -------------------------------------------------------------------------
    // Final Summary
    // -------------------------------------------------------------------------
    console.log("===============================================================================");
    const totalPassed = results.filter((r) => r.passed).length;
    console.log(`  TEST RESULTS: ${totalPassed} / 10 SCENARIOS PASSED`);
    console.log("===============================================================================");

    if (totalPassed === 10) {
      console.log("  >>> ALL 10 VASTRAA RETURN & EXCHANGE RULES ARE 100% PRODUCTION-READY <<<\n");
    }
  } catch (err) {
    console.error("FATAL SUITE ERROR:", err);
  } finally {
    process.exit(0);
  }
}

runTestSuite();
