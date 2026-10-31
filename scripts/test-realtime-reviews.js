import assert from "assert";

console.log("Testing realtime reviews endpoints logic...");

// Test rating breakdown & average calculation logic
function computeRatingSummary(reviews) {
  const reviewCount = reviews.length;
  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const averageRating = reviewCount > 0 ? Math.round((sum / reviewCount) * 10) / 10 : 0;

  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of reviews) {
    const rNum = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
    if (rNum >= 1 && rNum <= 5) {
      ratingBreakdown[rNum]++;
    }
  }
  return { reviewCount, averageRating, ratingBreakdown };
}

// 1. Zero reviews test
const zeroState = computeRatingSummary([]);
assert.strictEqual(zeroState.reviewCount, 0, "Zero state count must be 0");
assert.strictEqual(zeroState.averageRating, 0, "Zero state average rating must be 0");
assert.deepStrictEqual(zeroState.ratingBreakdown, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

// 2. Multi-review test
const testReviews = [
  { rating: 5, comment: "Amazing fabric and zari work" },
  { rating: 4, comment: "Good quality saree" },
  { rating: 5, comment: "Excellent saree" },
];
const multiState = computeRatingSummary(testReviews);
assert.strictEqual(multiState.reviewCount, 3);
assert.strictEqual(multiState.averageRating, 4.7); // (5+4+5)/3 = 4.666 -> 4.7
assert.strictEqual(multiState.ratingBreakdown[5], 2);
assert.strictEqual(multiState.ratingBreakdown[4], 1);
assert.strictEqual(multiState.ratingBreakdown[3], 0);

console.log("✅ All realtime review calculation logic tests passed successfully!");
