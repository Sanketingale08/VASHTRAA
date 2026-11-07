/**
 * Authoritative Catalog Categories, Subcategories, and Subtypes Specification
 *
 * Defines the complete, authoritative list of 6 main women's fashion categories:
 * 1. Sarees
 * 2. Kurtis
 * 3. Kurta Sets
 * 4. Ethnic Dresses
 * 5. Western Dresses
 * 6. Winter Wear
 *
 * And preserves all traditional saree categories, subcategories, weaves, and product attributes
 * for backward compatibility and deep heritage search.
 */

export interface CatalogSubcategory {
  id: string;
  name: string;
  slug: string;
  route?: string;
  group?: string;
  subtypes: string[];
  coverImage?: string | null;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  type: string;
  prefix: string;
  displayOrder: number;
  description: string;
  coverImage?: string;
  bannerImage?: string;
  subcategories: CatalogSubcategory[];
}

// ─── OFFICIAL 6 MAIN CATALOG CATEGORIES ──────────────────────────────────────

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  // 1. SAREES
  {
    id: "cat-sarees-default",
    name: "Sarees",
    slug: "sarees",
    type: "main",
    prefix: "SR",
    displayOrder: 1,
    description: "Centuries of royal heritage, handwoven pure mulberry silks, regal gold zari borders, and contemporary runway drapes from master Indian weavers.",
    coverImage: "/images/hero-paithani-1.png",
    bannerImage: "/images/hero-paithani-banner.png",
    subcategories: [
      {
        id: "sub-saree-paithani",
        name: "Paithani",
        slug: "paithani",
        route: "/sarees?subcategory=paithani",
        subtypes: ["Bridal Paithani", "Royal Bridal Peshwai", "Red Bridal Paithani", "Golden Zari Bridal", "Lagna Special", "Yeola Traditional", "Muniya Border", "Kadiyal Weave", "Brocade Jaal", "Semi-Paithani"],
      },
      {
        id: "sub-saree-designer",
        name: "Designer",
        slug: "designer",
        route: "/sarees?subcategory=designer",
        subtypes: ["Bollywood Inspired", "Cocktail Drapes", "Sequin & Cutwork", "Georgette Designer", "Organza Shimmer", "Pre-Stitched Saree", "Ruffle Saree", "Party Wear Glamour"],
      },
      {
        id: "sub-saree-gadwal",
        name: "Gadwal",
        slug: "gadwal",
        route: "/sarees?subcategory=gadwal",
        subtypes: ["Pure Silk Gadwal", "Cotton Gadwal", "Sico Blend", "Kuppadam Interlock Border", "Meenakari Zari", "Royal Temple Border"],
      },
      {
        id: "sub-saree-banarasi",
        name: "Banarasi",
        slug: "banarasi",
        route: "/sarees?subcategory=banarasi",
        subtypes: ["Katan Silk", "Organza Kora", "Georgette Banarasi", "Shattir Weave", "Tanchoi Silk", "Shikargah Brocade", "Jangla Jaal"],
      },
      {
        id: "sub-saree-kanjivaram",
        name: "Kanjivaram",
        slug: "kanjivaram",
        route: "/sarees?subcategory=kanjivaram",
        subtypes: ["Pure Silk Korvai", "Bridal Kanjivaram", "Temple Border", "Gold Zari Checks", "Muthu Seer", "Traditional Vaira Oosi"],
      },
      {
        id: "sub-saree-chanderi",
        name: "Chanderi",
        slug: "chanderi",
        route: "/sarees?subcategory=chanderi",
        subtypes: ["Pure Chanderi Silk", "Chanderi Cotton", "Cotton Silk Sico", "Zari Buti", "Eknaliya Weave", "Hand Block Printed Chanderi"],
      },
      {
        id: "sub-saree-bandhani",
        name: "Bandhani",
        slug: "bandhani",
        route: "/sarees?subcategory=bandhani",
        subtypes: ["Gujarati Bandhani", "Rajasthani Bandhej", "Gaji Silk Bandhani", "Leheriya Wave", "Jhankaar Bandhani", "Hand Tie & Dye"],
      },
      {
        id: "sub-saree-mysore-silk",
        name: "Mysore Silk",
        slug: "mysore-silk",
        route: "/sarees?subcategory=mysore-silk",
        subtypes: ["Pure Mysore Crepe Silk", "Gold Zari Border", "Georgette Mysore", "Royal Heritage Silk", "Kasuti Embroidered Mysore"],
      },
      {
        id: "sub-saree-ikat",
        name: "Ikat",
        slug: "ikat",
        route: "/sarees?subcategory=ikat",
        subtypes: ["Pochampally Ikat", "Patola Double Ikat", "Sambalpuri Bandha", "Telia Rumal", "Orissa Handloom Ikat"],
      },
      {
        id: "sub-saree-cotton",
        name: "Cotton",
        slug: "cotton",
        route: "/sarees?subcategory=cotton",
        subtypes: ["Bengal Tant", "Khadi Cotton", "Jamdani Weave", "Kota Doria", "Mangalagiri Cotton", "Chettinad Cotton", "Chanderi Cotton"],
      },
      {
        id: "sub-saree-silk",
        name: "Silk",
        slug: "silk",
        route: "/sarees?subcategory=silk",
        subtypes: ["Pure Mulberry Silk", "Tussar Silk", "Muga Silk", "Eri Silk", "Matka Silk", "Soft Silk", "Raw Silk", "Tissue Silk"],
      },
      {
        id: "sub-saree-other-traditional",
        name: "Other Traditional",
        slug: "other-traditional",
        route: "/sarees?subcategory=other-traditional",
        subtypes: ["Narayan Peth", "Nauvari 9-Yard", "Himroo Weave", "Solapuri Chanderi", "Maheshwari", "Uppada Jamdani", "Kerala Kasavu", "Dharmavaram"],
      },
    ],
  },

  // 2. KURTIS (15 official subcategories)
  {
    id: "cat-kurtis-default",
    name: "Kurtis",
    slug: "kurtis",
    type: "main",
    prefix: "KU",
    displayOrder: 2,
    description: "Everyday elegance, breezy silhouettes, and contemporary designer cuts — straight cut, Anarkalis, Angrakhas, kaftans, and fusion styles.",
    coverImage: "/images/product-2.png",
    bannerImage: "/images/hero-designer-banner.png",
    subcategories: [
      {
        id: "sub-kurti-straight",
        name: "Straight Kurti",
        slug: "straight-kurti",
        route: "/kurtis?subcategory=straight-kurti",
        subtypes: ["Solid Straight Kurti", "Printed Straight Kurti", "Embroidered Straight Kurti", "Side-Slit Straight Kurti", "Office Wear Straight Kurti"],
      },
      {
        id: "sub-kurti-a-line",
        name: "A-Line Kurti",
        slug: "a-line-kurti",
        route: "/kurtis?subcategory=a-line-kurti",
        subtypes: ["Casual A-Line Kurti", "Festive A-Line Kurti", "Tiered A-Line Kurti", "Printed A-Line Kurti"],
      },
      {
        id: "sub-kurti-anarkali",
        name: "Anarkali Kurti",
        slug: "anarkali-kurti",
        route: "/kurtis?subcategory=anarkali-kurti",
        subtypes: ["Floor-Length Anarkali", "Kalidar Anarkali Kurti", "Festive Zari Anarkali", "Cotton Printed Anarkali", "Gota Patti Anarkali"],
      },
      {
        id: "sub-kurti-angrakha",
        name: "Angrakha Kurti",
        slug: "angrakha-kurti",
        route: "/kurtis?subcategory=angrakha-kurti",
        subtypes: ["Traditional Wrap Angrakha", "Tassel Tie-Up Angrakha", "Festive Angrakha Kurti", "Indo-Western Angrakha"],
      },
      {
        id: "sub-kurti-flared",
        name: "Flared Kurti",
        slug: "flared-kurti",
        route: "/kurtis?subcategory=flared-kurti",
        subtypes: ["Fit & Flared Kurti", "Multi-Tier Flared Kurti", "Breezy Cotton Flare", "Festive Gherdar Kurti"],
      },
      {
        id: "sub-kurti-asymmetrical",
        name: "Asymmetrical Kurti",
        slug: "asymmetrical-kurti",
        route: "/kurtis?subcategory=asymmetrical-kurti",
        subtypes: ["Side-Tail Asymmetrical Kurti", "Hankey Hemline Kurti", "Modern Contemporary Cut"],
      },
      {
        id: "sub-kurti-kaftan",
        name: "Kaftan Kurti",
        slug: "kaftan-kurti",
        route: "/kurtis?subcategory=kaftan-kurti",
        subtypes: ["Drawstring Waist Kaftan", "Breezy Resort Kaftan Kurti", "Embroidered Silk Kaftan", "Floral Print Kaftan"],
      },
      {
        id: "sub-kurti-short",
        name: "Short Kurti",
        slug: "short-kurti",
        route: "/kurtis?subcategory=short-kurti",
        subtypes: ["Peplum Short Kurti", "Denim-Pairing Short Kurti", "Tunic Short Kurti", "Embroidered Short Kurti"],
      },
      {
        id: "sub-kurti-long",
        name: "Long Kurti",
        slug: "long-kurti",
        route: "/kurtis?subcategory=long-kurti",
        subtypes: ["Calf-Length Long Kurti", "Ankle-Length Long Kurti", "Button-Down Long Kurti", "Festive Brocade Long Kurti"],
      },
      {
        id: "sub-kurti-high-low",
        name: "High-Low Kurti",
        slug: "high-low-kurti",
        route: "/kurtis?subcategory=high-low-kurti",
        subtypes: ["Subtle High-Low Hem", "Dramatic Train High-Low Kurti", "Casual High-Low Tunic"],
      },
      {
        id: "sub-kurti-pakistani",
        name: "Pakistani Style Kurti",
        slug: "pakistani-style-kurti",
        route: "/kurtis?subcategory=pakistani-style-kurti",
        subtypes: ["Lawn Cotton Pakistani Kurti", "Organza Lace Detailed", "Wide Sleeve Pakistani Style", "Heavy Threadwork Pakistani"],
      },
      {
        id: "sub-kurti-shirt-style",
        name: "Shirt-Style Kurti",
        slug: "shirt-style-kurti",
        route: "/kurtis?subcategory=shirt-style-kurti",
        subtypes: ["Collar Neck Shirt Kurti", "Button Placket Shirt Kurti", "Roll-Up Sleeve Tunic", "Striped Linen Shirt Kurti"],
      },
      {
        id: "sub-kurti-front-slit",
        name: "Front-Slit Kurti",
        slug: "front-slit-kurti",
        route: "/kurtis?subcategory=front-slit-kurti",
        subtypes: ["High Front-Slit Kurti", "Double Slit Kurti", "Festive Front-Open Kurti"],
      },
      {
        id: "sub-kurti-jacket-style",
        name: "Jacket-Style Kurti",
        slug: "jacket-style-kurti",
        route: "/kurtis?subcategory=jacket-style-kurti",
        subtypes: ["Attached Jacket Kurti", "Detachable Koti Jacket Kurti", "Mirror Work Jacket Kurti", "Brocade Shrug Kurti"],
      },
      {
        id: "sub-kurti-cape-style",
        name: "Cape-Style Kurti",
        slug: "cape-style-kurti",
        route: "/kurtis?subcategory=cape-style-kurti",
        subtypes: ["Sheer Cape Kurti", "Shoulder Cape Tunic", "Asymmetrical Cape Kurti"],
      },
    ],
  },

  // 3. KURTA SETS (10 official subcategories)
  {
    id: "cat-kurta-sets-default",
    name: "Kurta Sets",
    slug: "kurta-sets",
    type: "main",
    prefix: "KS",
    displayOrder: 3,
    description: "Coordinated ethnic perfection — 2-piece and 3-piece designer sets paired with palazzos, straight pants, shararas, ghararas, and dupattas.",
    coverImage: "/images/product-3.png",
    bannerImage: "/images/hero-banarasi-banner.png",
    subcategories: [
      {
        id: "sub-kurtaset-palazzo",
        name: "Kurti with Palazzo",
        slug: "kurti-with-palazzo",
        route: "/kurta-sets?subcategory=kurti-with-palazzo",
        subtypes: ["Flared Palazzo Set", "Straight Palazzo Set", "Festive Gota Palazzo Set", "Casual Cotton Palazzo Set"],
      },
      {
        id: "sub-kurtaset-straight-pants",
        name: "Kurti with Straight Pants",
        slug: "kurti-with-straight-pants",
        route: "/kurta-sets?subcategory=kurti-with-straight-pants",
        subtypes: ["Formal Straight Pants Set", "Embroidered Pants Set", "Printed Cotton Pants Set", "Festive Silk Pants Set"],
      },
      {
        id: "sub-kurtaset-cigarette-pants",
        name: "Kurti with Cigarette Pants",
        slug: "kurti-with-cigarette-pants",
        route: "/kurta-sets?subcategory=kurti-with-cigarette-pants",
        subtypes: ["Ankle-Length Cigarette Pants Set", "Lace Trimmed Cigarette Pants", "Chanderi Silk Set"],
      },
      {
        id: "sub-kurtaset-sharara",
        name: "Kurti with Sharara",
        slug: "kurti-with-sharara",
        route: "/kurta-sets?subcategory=kurti-with-sharara",
        subtypes: ["Tiered Sharara Set", "Gota Patti Festive Sharara", "Peplum Kurti with Sharara", "Georgette Wedding Sharara Set"],
      },
      {
        id: "sub-kurtaset-gharara",
        name: "Kurti with Gharara",
        slug: "kurti-with-gharara",
        route: "/kurta-sets?subcategory=kurti-with-gharara",
        subtypes: ["Royal Knee-Ruched Gharara", "Zardozi Heavy Gharara Set", "Lagna Special Gharara Ensemble"],
      },
      {
        id: "sub-kurtaset-dhoti-pants",
        name: "Kurti with Dhoti Pants",
        slug: "kurti-with-dhoti-pants",
        route: "/kurta-sets?subcategory=kurti-with-dhoti-pants",
        subtypes: ["Pleated Dhoti Pants Set", "Peplum Kurti with Dhoti", "Festive Haldi Special Dhoti Set"],
      },
      {
        id: "sub-kurtaset-skirt",
        name: "Kurti with Skirt",
        slug: "kurti-with-skirt",
        route: "/kurta-sets?subcategory=kurti-with-skirt",
        subtypes: ["Flared Ethnic Skirt Set", "Brocade Skirt with Straight Kurti", "Festive Lehenga-Style Skirt Set"],
      },
      {
        id: "sub-kurtaset-dupatta",
        name: "Kurti with Dupatta",
        slug: "kurti-with-dupatta",
        route: "/kurta-sets?subcategory=kurti-with-dupatta",
        subtypes: ["Chiffon Dupatta Kurti Set", "Organza Floral Dupatta Set", "Banarasi Zari Dupatta Set", "Bandhani Dupatta Set"],
      },
      {
        id: "sub-kurtaset-2-piece",
        name: "2-Piece Kurta Set",
        slug: "2-piece-kurta-set",
        route: "/kurta-sets?subcategory=2-piece-kurta-set",
        subtypes: ["Kurta & Bottom 2-Piece", "Tunic & Trouser Set", "Everyday Wear 2-Piece Set"],
      },
      {
        id: "sub-kurtaset-3-piece",
        name: "3-Piece Kurta Set",
        slug: "3-piece-kurta-set",
        route: "/kurta-sets?subcategory=3-piece-kurta-set",
        subtypes: ["Kurta + Bottom + Dupatta Set", "Heavy Bridal 3-Piece Suite", "Festive Wedding Guest 3-Piece Ensemble"],
      },
    ],
  },

  // 4. ETHNIC DRESSES (10 official subcategories)
  {
    id: "cat-ethnic-dresses-default",
    name: "Ethnic Dresses",
    slug: "ethnic-dresses",
    type: "main",
    prefix: "ED",
    displayOrder: 4,
    description: "Traditional Indian aesthetics crafted into flowing one-piece gowns, Indo-Western fusion maxi dresses, and festive gala silhouettes.",
    coverImage: "/images/hero-designer-1.png",
    bannerImage: "/images/designer-banner.png",
    subcategories: [
      {
        id: "sub-ethnicdress-anarkali-gown",
        name: "Anarkali Gown",
        slug: "anarkali-gown",
        route: "/ethnic-dresses?subcategory=anarkali-gown",
        subtypes: ["Royal Flare Anarkali Gown", "Bridal Zari Gown", "Floor-Sweeping Georgette Gown", "Embroidered Net Anarkali Gown"],
      },
      {
        id: "sub-ethnicdress-maxi",
        name: "Ethnic Maxi Dress",
        slug: "ethnic-maxi-dress",
        route: "/ethnic-dresses?subcategory=ethnic-maxi-dress",
        subtypes: ["Tiered Ethnic Maxi", "Belted Ethnic Maxi Dress", "Block-Printed Cotton Maxi", "Festive Silk Blend Maxi"],
      },
      {
        id: "sub-ethnicdress-midi",
        name: "Ethnic Midi Dress",
        slug: "ethnic-midi-dress",
        route: "/ethnic-dresses?subcategory=ethnic-midi-dress",
        subtypes: ["A-Line Ethnic Midi", "Flared Haldi Midi Dress", "Contemporary Indian Print Midi"],
      },
      {
        id: "sub-ethnicdress-a-line",
        name: "Ethnic A-Line Dress",
        slug: "ethnic-a-line-dress",
        route: "/ethnic-dresses?subcategory=ethnic-a-line-dress",
        subtypes: ["Subtle Flare A-Line Dress", "Embroidered Yoke A-Line", "Festive Chanderi A-Line Dress"],
      },
      {
        id: "sub-ethnicdress-indo-western",
        name: "Indo-Western Dress",
        slug: "indo-western-dress",
        route: "/ethnic-dresses?subcategory=indo-western-dress",
        subtypes: ["Pre-Draped Gown Dress", "One-Shoulder Indo-Western", "Corset Waist Ethnic Fusion", "Cape Fusion Gown"],
      },
      {
        id: "sub-ethnicdress-floor-length-gown",
        name: "Floor-Length Ethnic Gown",
        slug: "floor-length-ethnic-gown",
        route: "/ethnic-dresses?subcategory=floor-length-ethnic-gown",
        subtypes: ["Cocktail Evening Gown", "Sangeet Special Gown", "Velvet Heavy Embroidered Gown", "Ruffle Layered Gown"],
      },
      {
        id: "sub-ethnicdress-jacket-style",
        name: "Jacket-Style Ethnic Dress",
        slug: "jacket-style-ethnic-dress",
        route: "/ethnic-dresses?subcategory=jacket-style-ethnic-dress",
        subtypes: ["Longline Jacket Ethnic Dress", "Embroidered Shrug Dress", "Koti Layered Ethnic Dress"],
      },
      {
        id: "sub-ethnicdress-kaftan",
        name: "Kaftan Dress",
        slug: "kaftan-dress",
        route: "/ethnic-dresses?subcategory=kaftan-dress",
        subtypes: ["Pure Silk Kaftan Dress", "Georgette Embellished Kaftan", "Mirror-Work Festive Kaftan", "Handloom Bandhani Kaftan"],
      },
      {
        id: "sub-ethnicdress-festive",
        name: "Festive Ethnic Dress",
        slug: "festive-ethnic-dress",
        route: "/ethnic-dresses?subcategory=festive-ethnic-dress",
        subtypes: ["Diwali Special Dress", "Puja Rituals Silk Dress", "Rich Zari Woven Dress", "Gota Patti Detailed Dress"],
      },
      {
        id: "sub-ethnicdress-party-wear",
        name: "Party-Wear Ethnic Dress",
        slug: "party-wear-ethnic-dress",
        route: "/ethnic-dresses?subcategory=party-wear-ethnic-dress",
        subtypes: ["Sequin Shimmer Ethnic Dress", "Reception Night Gown", "Metallic Threadwork Dress"],
      },
    ],
  },

  // 5. WESTERN DRESSES (16 official subcategories)
  {
    id: "cat-western-dresses-default",
    name: "Western Dresses",
    slug: "western-dresses",
    type: "main",
    prefix: "WD",
    displayOrder: 5,
    description: "Global trends and effortless Western silhouettes — bodycons, fit-and-flare styles, wrap dresses, maxis, and runway-ready party dresses.",
    coverImage: "/images/hero-designer-2.png",
    bannerImage: "/images/hero-designer-shop-banner.jpg",
    subcategories: [
      {
        id: "sub-westerndress-a-line",
        name: "A-Line Dress",
        slug: "a-line-dress",
        route: "/western-dresses?subcategory=a-line-dress",
        subtypes: ["Classic A-Line Cut", "Sleeveless A-Line", "Formal Office A-Line Dress"],
      },
      {
        id: "sub-westerndress-fit-and-flare",
        name: "Fit and Flare Dress",
        slug: "fit-and-flare-dress",
        route: "/western-dresses?subcategory=fit-and-flare-dress",
        subtypes: ["Feminine Cinched Waist", "Cocktail Fit and Flare", "Casual Summer Fit and Flare"],
      },
      {
        id: "sub-westerndress-bodycon",
        name: "Bodycon Dress",
        slug: "bodycon-dress",
        route: "/western-dresses?subcategory=bodycon-dress",
        subtypes: ["Ribbed Knit Bodycon", "Ruched Evening Bodycon", "Midi Bodycon Dress", "Cut-Out Party Bodycon"],
      },
      {
        id: "sub-westerndress-maxi",
        name: "Maxi Dress",
        slug: "maxi-dress",
        route: "/western-dresses?subcategory=maxi-dress",
        subtypes: ["Flowing Bohemian Maxi", "Tiered Vacation Maxi", "Off-Shoulder Evening Maxi", "Satin Slip Maxi"],
      },
      {
        id: "sub-westerndress-midi",
        name: "Midi Dress",
        slug: "midi-dress",
        route: "/western-dresses?subcategory=midi-dress",
        subtypes: ["Pleated Midi Dress", "Side-Slit Midi Dress", "Floral Print Midi", "Workwear Belted Midi"],
      },
      {
        id: "sub-westerndress-mini",
        name: "Mini Dress",
        slug: "mini-dress",
        route: "/western-dresses?subcategory=mini-dress",
        subtypes: ["Cocktail Mini Dress", "Casual Day Mini", "Blazer Mini Dress", "Babydoll Mini Dress"],
      },
      {
        id: "sub-westerndress-shirt",
        name: "Shirt Dress",
        slug: "shirt-dress",
        route: "/western-dresses?subcategory=shirt-dress",
        subtypes: ["Belted Cotton Shirt Dress", "Oversized Utility Shirt Dress", "Striped Poplin Shirt Dress"],
      },
      {
        id: "sub-westerndress-wrap",
        name: "Wrap Dress",
        slug: "wrap-dress",
        route: "/western-dresses?subcategory=wrap-dress",
        subtypes: ["True Wrap Tie Dress", "Faux Wrap Silhouette", "V-Neck Crepe Wrap Dress"],
      },
      {
        id: "sub-westerndress-skater",
        name: "Skater Dress",
        slug: "skater-dress",
        route: "/western-dresses?subcategory=skater-dress",
        subtypes: ["Structured Knit Skater", "Casual Cotton Skater Dress", "Printed Party Skater"],
      },
      {
        id: "sub-westerndress-tiered",
        name: "Tiered Dress",
        slug: "tiered-dress",
        route: "/western-dresses?subcategory=tiered-dress",
        subtypes: ["Multi-Tier Ruffle Dress", "Breezy Smocked Tiered Dress", "Voluminous Midi Tiered"],
      },
      {
        id: "sub-westerndress-slip",
        name: "Slip Dress",
        slug: "slip-dress",
        route: "/western-dresses?subcategory=slip-dress",
        subtypes: ["Pure Satin Cowl Neck Slip", "Bias-Cut Silk Slip", "Minimal 90s Strappy Slip Dress"],
      },
      {
        id: "sub-westerndress-co-ord",
        name: "Co-Ord Dress",
        slug: "co-ord-dress",
        route: "/western-dresses?subcategory=co-ord-dress",
        subtypes: ["Top & Skirt Co-Ord Set", "Blazer & Dress Matching Set", "Resort Wear 2-Piece Co-Ord"],
      },
      {
        id: "sub-westerndress-denim",
        name: "Denim Dress",
        slug: "denim-dress",
        route: "/western-dresses?subcategory=denim-dress",
        subtypes: ["Button-Down Denim Dress", "Fitted Denim Bodycon", "A-Line Dungaree Dress"],
      },
      {
        id: "sub-westerndress-floral",
        name: "Floral Dress",
        slug: "floral-dress",
        route: "/western-dresses?subcategory=floral-dress",
        subtypes: ["Ditsy Floral Summer Dress", "Moody Botanical Evening Floral", "Pastel Garden Party Dress"],
      },
      {
        id: "sub-westerndress-ruffle",
        name: "Ruffle Dress",
        slug: "ruffle-dress",
        route: "/western-dresses?subcategory=ruffle-dress",
        subtypes: ["Cascading Ruffle Trim", "Ruffled Hemline Dress", "Off-Shoulder Flounce Dress"],
      },
      {
        id: "sub-westerndress-party",
        name: "One-Piece Party Dress",
        slug: "one-piece-party-dress",
        route: "/western-dresses?subcategory=one-piece-party-dress",
        subtypes: ["Sequin Cocktail Dress", "LBD (Little Black Dress)", "Metallic Shimmer Evening Dress", "Velvet Night Out Dress"],
      },
    ],
  },

  // 6. WINTER WEAR (EXACTLY 10 official subcategories)
  {
    id: "cat-winter-wear-default",
    name: "Winter Wear",
    slug: "winter-wear",
    type: "main",
    prefix: "WW",
    displayOrder: 6,
    description: "Opulent cold-weather drapes and snug luxury — sweater dresses, pure woolen ensembles, royal velvet outfits, and tailored winter coats.",
    coverImage: "/images/product-8.png",
    bannerImage: "/images/hero-chanderi-banner.png",
    subcategories: [
      {
        id: "sub-winter-dresses",
        name: "Winter Dresses",
        slug: "winter-dresses",
        route: "/winter-wear?subcategory=winter-dresses",
        subtypes: ["Thermal Layered Dress", "Long Sleeve Winter Dress", "Fleece-Lined Midi Dress", "Winter Floral Dress"],
      },
      {
        id: "sub-winter-sweater-dresses",
        name: "Sweater Dresses",
        slug: "sweater-dresses",
        route: "/winter-wear?subcategory=sweater-dresses",
        subtypes: ["Chunky Cable Knit Sweater Dress", "Ribbed Turtleneck Sweater Dress", "Belted Knitwear Dress", "Oversized Slouchy Knit"],
      },
      {
        id: "sub-winter-woolen-dresses",
        name: "Woolen Dresses",
        slug: "woolen-dresses",
        route: "/winter-wear?subcategory=woolen-dresses",
        subtypes: ["Pure Merino Wool Dress", "Cashmere Blend Winter Dress", "Tweed Tailored Wool Dress"],
      },
      {
        id: "sub-winter-ethnic-wear",
        name: "Winter Ethnic Wear",
        slug: "winter-ethnic-wear",
        route: "/winter-wear?subcategory=winter-ethnic-wear",
        subtypes: ["Pashmina Silk Kurta Set", "Warm Woolen Kurti Ensemble", "Velvet Festive Saree Drape", "Cashmere Embroidered Shawl Set"],
      },
      {
        id: "sub-winter-western-wear",
        name: "Winter Western Wear",
        slug: "winter-western-wear",
        route: "/winter-wear?subcategory=winter-western-wear",
        subtypes: ["Woolen Trench Layer", "Tailored Winter Blazer", "Heavy Knit Co-Ord"],
      },
      {
        id: "sub-winter-velvet-dresses",
        name: "Velvet Dresses",
        slug: "velvet-dresses",
        route: "/winter-wear?subcategory=velvet-dresses",
        subtypes: ["Plush Royal Velvet Gown", "Embroidered Velvet Midi Dress", "Velvet Wrap Party Dress", "Dark Wine Velvet Ensemble"],
      },
      {
        id: "sub-winter-party-wear",
        name: "Winter Party Wear",
        slug: "winter-party-wear",
        route: "/winter-wear?subcategory=winter-party-wear",
        subtypes: ["Metallic Knit Party Dress", "Velvet Sequin Gala Dress", "Warm Evening Formal Gown"],
      },
      {
        id: "sub-winter-co-ord-sets",
        name: "Winter Co-ord Sets",
        slug: "winter-co-ord-sets",
        route: "/winter-wear?subcategory=winter-co-ord-sets",
        subtypes: ["Ribbed Knit Top & Pant Set", "Velvet Co-ord Lounge Set", "Heavy Woolen 2-Piece Ensemble"],
      },
      {
        id: "sub-winter-jackets-coats",
        name: "Winter Jackets & Coats",
        slug: "winter-jackets-coats",
        route: "/winter-wear?subcategory=winter-jackets-coats",
        subtypes: ["Longline Wool Overcoat", "Faux Fur Trimmed Jacket", "Belted Wrap Winter Coat", "Quilted Puffer Coat"],
      },
      {
        id: "sub-winter-casual-wear",
        name: "Winter Casual Wear",
        slug: "winter-casual-wear",
        route: "/winter-wear?subcategory=winter-casual-wear",
        subtypes: ["Comfort Knit Daywear", "Fleece Pullover Dress", "Warm Everyday Winter Tunic"],
      },
    ],
  },

  // 7. TOPS (Women's Tops - 42 official subcategories across Women's, Girls', and Seasonal)
  {
    id: "cat-tops-default",
    name: "Women's Tops",
    slug: "tops",
    type: "main",
    prefix: "TP",
    displayOrder: 7,
    description: "Chic, contemporary, and everyday tops for women and girls — crop tops, peplums, tunics, shirts, blouses, party wear, and seasonal knits.",
    coverImage: "/images/product-4.png",
    bannerImage: "/images/hero-designer-banner.png",
    subcategories: [
      // A. Women's Tops (24 Subcategories)
      {
        id: "sub-tops-casual",
        name: "Casual Tops",
        slug: "casual-tops",
        route: "/tops?subcategory=casual-tops",
        group: "Women's Tops",
        subtypes: ["Solid Casual Top", "Printed Day Top", "Cotton Daily Wear", "Relaxed Fit Casual Top"],
      },
      {
        id: "sub-tops-crop",
        name: "Crop Tops",
        slug: "crop-tops",
        route: "/tops?subcategory=crop-tops",
        group: "Women's Tops",
        subtypes: ["Fitted Crop Top", "Boxy Crop Top", "Tie-Front Crop Top", "Ribbed Knit Crop Top"],
      },
      {
        id: "sub-tops-peplum",
        name: "Peplum Tops",
        slug: "peplum-tops",
        route: "/tops?subcategory=peplum-tops",
        group: "Women's Tops",
        subtypes: ["Flared Peplum Top", "Cinched Waist Peplum", "Smocked Peplum", "Ruffled Peplum"],
      },
      {
        id: "sub-tops-tunic",
        name: "Tunic Tops",
        slug: "tunic-tops",
        route: "/tops?subcategory=tunic-tops",
        group: "Women's Tops",
        subtypes: ["Longline Tunic", "Side-Slit Tunic", "A-Line Tunic", "Embroidered Tunic"],
      },
      {
        id: "sub-tops-shirt-style",
        name: "Shirt Style Tops",
        slug: "shirt-style-tops",
        route: "/tops?subcategory=shirt-style-tops",
        group: "Women's Tops",
        subtypes: ["Button-Down Shirt Top", "Collar Poplin Top", "Oversized Utility Shirt Top", "Satin Shirt Top"],
      },
      {
        id: "sub-tops-blouse",
        name: "Blouse Tops",
        slug: "blouse-tops",
        route: "/tops?subcategory=blouse-tops",
        group: "Women's Tops",
        subtypes: ["Chiffon Blouse Top", "Georgette Flowy Blouse", "Tie-Neck Blouse", "Satin Elegant Blouse"],
      },
      {
        id: "sub-tops-tank",
        name: "Tank Tops",
        slug: "tank-tops",
        route: "/tops?subcategory=tank-tops",
        group: "Women's Tops",
        subtypes: ["Ribbed Tank Top", "Racerback Tank", "Scoop Neck Tank", "Seamless Stretch Tank"],
      },
      {
        id: "sub-tops-sleeveless",
        name: "Sleeveless Tops",
        slug: "sleeveless-tops",
        route: "/tops?subcategory=sleeveless-tops",
        group: "Women's Tops",
        subtypes: ["Breezy Sleeveless Top", "High-Neck Sleeveless Top", "Formal Sleeveless Blouse"],
      },
      {
        id: "sub-tops-off-shoulder",
        name: "Off-Shoulder Tops",
        slug: "off-shoulder-tops",
        route: "/tops?subcategory=off-shoulder-tops",
        group: "Women's Tops",
        subtypes: ["Bardot Off-Shoulder", "Elasticated Ruffle Off-Shoulder", "Smocked Off-Shoulder Top"],
      },
      {
        id: "sub-tops-one-shoulder",
        name: "One-Shoulder Tops",
        slug: "one-shoulder-tops",
        route: "/tops?subcategory=one-shoulder-tops",
        group: "Women's Tops",
        subtypes: ["Asymmetric One-Shoulder Top", "Ruffle One-Shoulder Top", "Satin Party One-Shoulder"],
      },
      {
        id: "sub-tops-halter-neck",
        name: "Halter Neck Tops",
        slug: "halter-neck-tops",
        route: "/tops?subcategory=halter-neck-tops",
        group: "Women's Tops",
        subtypes: ["Tie-Halter Top", "Cross-Halter Knit Top", "Backless Halter Top"],
      },
      {
        id: "sub-tops-cold-shoulder",
        name: "Cold-Shoulder Tops",
        slug: "cold-shoulder-tops",
        route: "/tops?subcategory=cold-shoulder-tops",
        group: "Women's Tops",
        subtypes: ["Cut-Out Shoulder Top", "Ruffled Cold-Shoulder", "Party Cold-Shoulder Blouse"],
      },
      {
        id: "sub-tops-wrap",
        name: "Wrap Tops",
        slug: "wrap-tops",
        route: "/tops?subcategory=wrap-tops",
        group: "Women's Tops",
        subtypes: ["True Wrap Tie Top", "Surplice Faux Wrap Top", "Kimono Wrap Top"],
      },
      {
        id: "sub-tops-ruffle",
        name: "Ruffle Tops",
        slug: "ruffle-tops",
        route: "/tops?subcategory=ruffle-tops",
        group: "Women's Tops",
        subtypes: ["Tiered Ruffle Top", "Frill Neck Ruffle Top", "Flounce Sleeve Ruffle Top"],
      },
      {
        id: "sub-tops-tie-up",
        name: "Tie-Up Tops",
        slug: "tie-up-tops",
        route: "/tops?subcategory=tie-up-tops",
        group: "Women's Tops",
        subtypes: ["Front Tie-Up Top", "Back Knot Tie Top", "Side Tie-Up Wrap"],
      },
      {
        id: "sub-tops-printed",
        name: "Printed Tops",
        slug: "printed-tops",
        route: "/tops?subcategory=printed-tops",
        group: "Women's Tops",
        subtypes: ["Floral Print Top", "Geometric Print Top", "Polka Dot Top", "Abstract Art Top"],
      },
      {
        id: "sub-tops-embroidered",
        name: "Embroidered Tops",
        slug: "embroidered-tops",
        route: "/tops?subcategory=embroidered-tops",
        group: "Women's Tops",
        subtypes: ["Chikankari Top", "Mirror Work Top", "Zari Thread Embroidered", "Floral Yoke Embroidered"],
      },
      {
        id: "sub-tops-lace",
        name: "Lace Tops",
        slug: "lace-tops",
        route: "/tops?subcategory=lace-tops",
        group: "Women's Tops",
        subtypes: ["Crochet Lace Top", "Sheer Lace Blouse", "Lace Inset Top", "Scalloped Lace Top"],
      },
      {
        id: "sub-tops-party-wear",
        name: "Party Wear Tops",
        slug: "party-wear-tops",
        route: "/tops?subcategory=party-wear-tops",
        group: "Women's Tops",
        subtypes: ["Sequin Shimmer Top", "Metallic Foil Top", "Velvet Night Top", "Satin Glamour Top"],
      },
      {
        id: "sub-tops-formal",
        name: "Formal Tops",
        slug: "formal-tops",
        route: "/tops?subcategory=formal-tops",
        group: "Women's Tops",
        subtypes: ["Office Workwear Top", "Tailored Pleated Top", "Minimalist Formal Blouse"],
      },
      {
        id: "sub-tops-long",
        name: "Long Tops",
        slug: "long-tops",
        route: "/tops?subcategory=long-tops",
        group: "Women's Tops",
        subtypes: ["Hip-Covering Long Top", "Flared Longline Top", "High-Slit Long Top"],
      },
      {
        id: "sub-tops-short",
        name: "Short Tops",
        slug: "short-tops",
        route: "/tops?subcategory=short-tops",
        group: "Women's Tops",
        subtypes: ["Waist-Length Short Top", "Fitted Short Top", "Breezy Summer Short Top"],
      },
      {
        id: "sub-tops-high-low",
        name: "High-Low Tops",
        slug: "high-low-tops",
        route: "/tops?subcategory=high-low-tops",
        group: "Women's Tops",
        subtypes: ["Dramatic High-Low Hem", "Subtle High-Low Tunic", "Asymmetrical High-Low"],
      },
      {
        id: "sub-tops-basic-solid",
        name: "Basic / Solid Tops",
        slug: "basic-solid-tops",
        route: "/tops?subcategory=basic-solid-tops",
        group: "Women's Tops",
        subtypes: ["Plain Solid Cotton Top", "Essential Crew Neck Top", "Minimalist V-Neck Top"],
      },

      // B. Girls' Tops (13 Subcategories)
      {
        id: "sub-tops-girls-casual",
        name: "Girls Casual Tops",
        slug: "girls-casual-tops",
        route: "/tops?subcategory=girls-casual-tops",
        group: "Girls' Tops",
        subtypes: ["Cotton Everyday Top", "Comfort Fit Day Top", "School-Holiday Casual"],
      },
      {
        id: "sub-tops-girls-printed",
        name: "Girls Printed Tops",
        slug: "girls-printed-tops",
        route: "/tops?subcategory=girls-printed-tops",
        group: "Girls' Tops",
        subtypes: ["Floral Print Girls Top", "Animal Print Top", "Polka Dot Girls Top"],
      },
      {
        id: "sub-tops-girls-graphic",
        name: "Girls Graphic Tops",
        slug: "girls-graphic-tops",
        route: "/tops?subcategory=girls-graphic-tops",
        group: "Girls' Tops",
        subtypes: ["Cute Graphic Print Top", "Slogan Print Top", "Cartoon & Anime Top"],
      },
      {
        id: "sub-tops-girls-crop",
        name: "Girls Crop Tops",
        slug: "girls-crop-tops",
        route: "/tops?subcategory=girls-crop-tops",
        group: "Girls' Tops",
        subtypes: ["Age-Appropriate Crop Top", "Boxy Dance Crop Top", "Layered Crop Top"],
      },
      {
        id: "sub-tops-girls-ruffle",
        name: "Girls Ruffle Tops",
        slug: "girls-ruffle-tops",
        route: "/tops?subcategory=girls-ruffle-tops",
        group: "Girls' Tops",
        subtypes: ["Frill Sleeve Girls Top", "Tiered Ruffle Top", "Peter Pan Collar Ruffle"],
      },
      {
        id: "sub-tops-girls-peplum",
        name: "Girls Peplum Tops",
        slug: "girls-peplum-tops",
        route: "/tops?subcategory=girls-peplum-tops",
        group: "Girls' Tops",
        subtypes: ["Flared Girls Peplum", "Smocked Waist Peplum", "Party Peplum Top"],
      },
      {
        id: "sub-tops-girls-party-wear",
        name: "Girls Party Wear Tops",
        slug: "girls-party-wear-tops",
        route: "/tops?subcategory=girls-party-wear-tops",
        group: "Girls' Tops",
        subtypes: ["Sequin Embellished Girls Top", "Glitter Shimmer Top", "Birthday Special Top"],
      },
      {
        id: "sub-tops-girls-embroidered",
        name: "Girls Embroidered Tops",
        slug: "girls-embroidered-tops",
        route: "/tops?subcategory=girls-embroidered-tops",
        group: "Girls' Tops",
        subtypes: ["Thread Embroidered Top", "Appliqué Embroidery Top", "Floral Threadwork Top"],
      },
      {
        id: "sub-tops-girls-sleeveless",
        name: "Girls Sleeveless Tops",
        slug: "girls-sleeveless-tops",
        route: "/tops?subcategory=girls-sleeveless-tops",
        group: "Girls' Tops",
        subtypes: ["Summer Tank Top", "Strappy Sundress Top", "Halter-Style Girls Top"],
      },
      {
        id: "sub-tops-girls-full-sleeve",
        name: "Girls Full-Sleeve Tops",
        slug: "girls-full-sleeve-tops",
        route: "/tops?subcategory=girls-full-sleeve-tops",
        group: "Girls' Tops",
        subtypes: ["Full-Length Sleeve Top", "Balloon Sleeve Top", "Cuffed Sleeve Top"],
      },
      {
        id: "sub-tops-girls-off-shoulder",
        name: "Girls Off-Shoulder Tops",
        slug: "girls-off-shoulder-tops",
        route: "/tops?subcategory=girls-off-shoulder-tops",
        group: "Girls' Tops",
        subtypes: ["Cold-Shoulder Cut-Out Top", "Elasticated Bardot Girls Top"],
      },
      {
        id: "sub-tops-girls-tunic",
        name: "Girls Tunic Tops",
        slug: "girls-tunic-tops",
        route: "/tops?subcategory=girls-tunic-tops",
        group: "Girls' Tops",
        subtypes: ["Longline Girls Tunic", "Leggings-Pairing Tunic", "A-Line Girls Tunic"],
      },
      {
        id: "sub-tops-girls-basic-solid",
        name: "Girls Basic / Solid Tops",
        slug: "girls-basic-solid-tops",
        route: "/tops?subcategory=girls-basic-solid-tops",
        group: "Girls' Tops",
        subtypes: ["Plain Pure Cotton Top", "Solid Round Neck Tee Top", "Pastel Solid Top"],
      },

      // C. Seasonal Tops (5 Subcategories)
      {
        id: "sub-tops-winter",
        name: "Winter Tops",
        slug: "winter-tops",
        route: "/tops?subcategory=winter-tops",
        group: "Seasonal Tops",
        subtypes: ["Fleece-Lined Warm Top", "Thermal Knit Day Top", "Heavy Cotton Winter Top"],
      },
      {
        id: "sub-tops-sweatshirt",
        name: "Sweatshirt Tops",
        slug: "sweatshirt-tops",
        route: "/tops?subcategory=sweatshirt-tops",
        group: "Seasonal Tops",
        subtypes: ["Crewneck Sweatshirt", "Cropped Sweatshirt", "Oversized Fleece Sweatshirt"],
      },
      {
        id: "sub-tops-sweater",
        name: "Sweater Tops",
        slug: "sweater-tops",
        route: "/tops?subcategory=sweater-tops",
        group: "Seasonal Tops",
        subtypes: ["Chunky Cable Knit Sweater Top", "Fine Ribbed Knit Top", "Turtleneck Sweater Top"],
      },
      {
        id: "sub-tops-thermal",
        name: "Thermal Tops",
        slug: "thermal-tops",
        route: "/tops?subcategory=thermal-tops",
        group: "Seasonal Tops",
        subtypes: ["Base Layer Thermal Top", "Ultra-Warm Merino Thermal", "Seamless Body Thermal"],
      },
      {
        id: "sub-tops-full-sleeve",
        name: "Full-Sleeve Tops",
        slug: "full-sleeve-tops",
        route: "/tops?subcategory=full-sleeve-tops",
        group: "Seasonal Tops",
        subtypes: ["Classic Long Sleeve Top", "Ribbed Full-Sleeve Top", "Layering Winter Long Sleeve"],
      },
    ],
  },
];

// ─── PRESERVED SAREE DEFINITIONS FOR DEEP SEARCH & LEGACY INTEGRITY ───────────

export const PRESERVED_SAREE_CATEGORIES: CatalogCategory[] = [
  {
    id: "cat-paithani-default",
    name: "Paithani Sarees",
    slug: "paithani",
    type: "main",
    prefix: "PS",
    displayOrder: 1,
    description: "Centuries of royal Maharashtrian heritage handwoven in pure mulberry silk with rich gold zari borders, peacock motifs, and Yeola artistry.",
    coverImage: "/images/hero-paithani-1.png",
    bannerImage: "/images/hero-paithani-banner.png",
    subcategories: [
      {
        id: "cat-bridal-default",
        name: "Bridal",
        slug: "bridal",
        route: "/bridal",
        subtypes: ["Bridal Paithani", "Royal Bridal Peshwai", "Red Bridal Paithani", "Golden Zari Bridal", "Lagna Special"],
      },
      {
        id: "cat-wedding-paithani-main",
        name: "Weddings",
        slug: "wedding-paithani-main",
        route: "/wedding-paithani-main",
        subtypes: ["Wedding Paithani", "Traditional Yeola", "Pure Silk Handloom", "Royal Zari Border", "Barat Special"],
      },
      {
        id: "cat-western-paithani-main",
        name: "Western",
        slug: "western-paithani-main",
        route: "/western-paithani-main",
        subtypes: ["Indo-Western Fusion", "Contemporary Drape", "Cocktail Paithani", "Modern Drape"],
      },
      {
        id: "sub-paithani-traditional",
        name: "Traditional",
        slug: "traditional",
        route: "/paithani/shop?subcategory=traditional",
        subtypes: ["Yeola Traditional", "Classic Handloom", "Royal Peshwai", "Vintage Asavali"],
      },
      {
        id: "sub-paithani-pure-silk",
        name: "Pure Silk",
        slug: "pure-silk",
        route: "/paithani/shop?subcategory=pure-silk",
        subtypes: ["Pure Handloom Silk", "Double Warp Pure Silk", "Fine Mulberry Silk", "Charkha Silk"],
      },
      {
        id: "sub-paithani-kadiyal",
        name: "Kadiyal",
        slug: "kadiyal",
        route: "/paithani/shop?subcategory=kadiyal",
        subtypes: ["Interlocking Border", "Contrast Kadiyal Weave", "Three-Shuttle Kadiyal"],
      },
      {
        id: "sub-paithani-muniya",
        name: "Muniya",
        slug: "muniya",
        route: "/paithani/shop?subcategory=muniya",
        subtypes: ["Single Muniya Border", "Double Muniya Border", "Triple Muniya Border", "Parrot Muniya"],
      },
      {
        id: "sub-paithani-brocade",
        name: "Brocade",
        slug: "brocade",
        route: "/paithani/shop?subcategory=brocade",
        subtypes: ["All-Over Brocade", "All-Over Zari Jaal", "Heavy Brocade Pallu", "Tissue Brocade"],
      },
      {
        id: "sub-paithani-motif",
        name: "Motif",
        slug: "motif",
        route: "/paithani/shop?subcategory=motif",
        subtypes: ["Peacock / Mor Motif", "Lotus / Kamal Motif", "Parrot / Popat Motif", "Hans / Swan Motif", "Asavali Motif", "Bangle / Bangadi Motif"],
      },
      {
        id: "sub-paithani-border",
        name: "Border",
        slug: "border",
        route: "/paithani/shop?subcategory=border",
        subtypes: ["Tissue Border", "Narali Border", "Broad Zari Border", "Slender Border", "Ganga Jamuna Border"],
      },
      {
        id: "sub-paithani-occasion",
        name: "Occasion",
        slug: "occasion",
        route: "/paithani/shop?subcategory=occasion",
        subtypes: ["Bridal Paithani", "Wedding Paithani", "Festival Paithani", "Puja & Ceremonial Wear", "Reception Wear"],
      },
      {
        id: "sub-paithani-contemporary",
        name: "Contemporary",
        slug: "contemporary",
        route: "/paithani/shop?subcategory=contemporary",
        subtypes: ["Indo-Western Drape", "Modern Geometric Paithani", "Pastel Fusion", "Contemporary Drape"],
      },
      {
        id: "sub-paithani-art-silk",
        name: "Art Silk",
        slug: "art-silk",
        route: "/paithani/shop?subcategory=art-silk",
        subtypes: ["Semi-Paithani", "Lightweight Art Silk", "Poly Silk Paithani"],
      },
    ],
  },
  {
    id: "cat-designer-default",
    name: "Designer Sarees",
    slug: "designer",
    type: "main",
    prefix: "DS",
    displayOrder: 2,
    description: "Glamorous runway silhouettes, couture embroidery, sequins, georgette, and modern cocktail drapes for high fashion celebrations.",
    coverImage: "/images/hero-designer-1.png",
    bannerImage: "/images/hero-designer-banner.png",
    subcategories: [
      {
        id: "cat-bollywood-default",
        name: "Bollywood",
        slug: "bollywood",
        route: "/bollywood",
        subtypes: ["Celebrity Inspired", "Bollywood Party Wear", "Red Carpet Look", "Bollywood Saree"],
      },
      {
        id: "cat-contemporary-silk-main",
        name: "Contemporary Silk",
        slug: "contemporary-silk-main",
        route: "/contemporary-silk-main",
        subtypes: ["Modern Contemporary Silk", "Fusion Silk", "Digital Print Silk", "Art Silk Designer"],
      },
      {
        id: "cat-party-default",
        name: "Party Wear",
        slug: "party",
        route: "/party",
        subtypes: ["Cocktail Party Sarees", "Evening Glam", "Reception Drapes", "Sangeet Special"],
      },
      {
        id: "sub-designer-embroidered",
        name: "Embroidered",
        slug: "embroidered",
        route: "/designer/shop?subcategory=embroidered",
        subtypes: ["Zardozi Handwork", "Resham Thread Embroidery", "Gota Patti", "Aari Work", "Cutwork Embroidery"],
      },
      {
        id: "sub-designer-sequin",
        name: "Sequin",
        slug: "sequin",
        route: "/designer/shop?subcategory=sequin",
        subtypes: ["Dual-Tone Shimmer", "Ombre Sequin Sheet", "Matte Sequin Border", "Geometric Sequin Jaal"],
      },
      {
        id: "sub-designer-georgette",
        name: "Georgette",
        slug: "georgette",
        route: "/designer/shop?subcategory=georgette",
        subtypes: ["Pure Viscose Georgette", "Heavy Embroidered Georgette", "Pleated Georgette", "Printed Georgette"],
      },
      {
        id: "sub-designer-organza",
        name: "Organza",
        slug: "organza",
        route: "/designer/shop?subcategory=organza",
        subtypes: ["Hand-Painted Floral Organza", "Scalloped Border Organza", "Mirror Work Organza", "Metallic Organza"],
      },
      {
        id: "sub-designer-chiffon",
        name: "Chiffon",
        slug: "chiffon",
        route: "/designer/shop?subcategory=chiffon",
        subtypes: ["Pure Silk Chiffon", "Ombre Dyed Chiffon", "Delicate Pearl Border Chiffon"],
      },
      {
        id: "sub-designer-net",
        name: "Net",
        slug: "net",
        route: "/designer/shop?subcategory=net",
        subtypes: ["Heavy Flare Net", "Butterfly Net with Crystals", "Applique Work Net"],
      },
      {
        id: "sub-designer-satin",
        name: "Satin",
        slug: "satin",
        route: "/designer/shop?subcategory=satin",
        subtypes: ["Liquid Satin", "Crepe Satin with Crystal Border", "Dual-Tone Gloss Satin"],
      },
      {
        id: "sub-designer-silk-designer",
        name: "Silk Designer",
        slug: "silk-designer",
        route: "/designer/shop?subcategory=silk-designer",
        subtypes: ["Modern Raw Silk Fusion", "Tussar Designer Embellished", "Matka Silk Contemporary"],
      },
      {
        id: "sub-designer-ruffle",
        name: "Ruffle",
        slug: "ruffle",
        route: "/designer/shop?subcategory=ruffle",
        subtypes: ["Tiered Ruffle Border", "Cascade Flare Ruffle", "Pleated Ruffle Pallu"],
      },
      {
        id: "sub-designer-pre-stitched",
        name: "Pre-Stitched",
        slug: "pre-stitched",
        route: "/designer/shop?subcategory=pre-stitched",
        subtypes: ["1-Minute Ready-to-Wear", "Pant Style Drape", "Dhoti Saree Drape", "Belted Modern Drape"],
      },
      {
        id: "sub-designer-printed",
        name: "Printed",
        slug: "printed",
        route: "/designer/shop?subcategory=printed",
        subtypes: ["Digital Abstract Print", "Vintage Botanical Print", "Geometric Monogram Print"],
      },
      {
        id: "sub-designer-party-wear",
        name: "Party Wear (Classic)",
        slug: "party-wear",
        route: "/party",
        subtypes: ["Cocktail Evening Saree", "Sangeet Glam Saree", "Farewell Special"],
      },
      {
        id: "sub-designer-bridal",
        name: "Bridal",
        slug: "designer-bridal",
        route: "/designer/shop?subcategory=bridal",
        subtypes: ["Heavy Velvet Bridal Saree", "Red & Crimson Trousseau", "Couture Reception Saree"],
      },
    ],
  },
  {
    id: "cat-gadwal-default",
    name: "Gadwal Sarees",
    slug: "gadwal",
    type: "main",
    prefix: "GS",
    displayOrder: 3,
    description: "Famous for the Kuppadam interlocking weft technique, lightweight cotton bodies, and contrasting pure silk borders with rich zari pallus.",
    coverImage: "/images/hero-gadwal-1.png",
    bannerImage: "/images/hero-gadwal-banner.png",
    subcategories: [
      { id: "sub-gadwal-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Gadwal Silk Saree", "Kuppadam Silk", "Heavy Zari Gadwal", "Temple Border Silk"] },
      { id: "sub-gadwal-cotton", name: "Cotton", slug: "cotton", subtypes: ["Gadwal Handloom Cotton", "Cotton Body Silk Border", "Fine Count Gadwal Cotton"] },
      { id: "sub-gadwal-sico", name: "Sico", slug: "sico", subtypes: ["Silk Cotton Sico Gadwal", "Zari Border Sico", "Lightweight Festive Sico"] },
      { id: "sub-gadwal-kuppadam", name: "Kuppadam", slug: "kuppadam", subtypes: ["Authentic Kuppadam Weave", "Three-Shuttle Kuppadam", "Contrast Kuppadam Border"] },
      { id: "sub-gadwal-brocade", name: "Brocade", slug: "brocade", subtypes: ["Gadwal Brocade Pallu", "All-Over Buti Brocade", "Tissue Zari Border"] },
      { id: "sub-gadwal-meenakari", name: "Meenakari", slug: "meenakari", subtypes: ["Meenakari Butis", "Floral Meenakari Border", "Coloured Resham & Zari Detailing"] },
    ],
  },
  {
    id: "cat-banarasi-default",
    name: "Banarasi Sarees",
    slug: "banarasi",
    type: "main",
    prefix: "BN",
    displayOrder: 4,
    description: "The crown jewel of Indian weaving from Varanasi. Masterpieces in pure Katan silk, elaborate Mughal-inspired gold and silver zari brocades.",
    coverImage: "/images/hero-banarasi-1.png",
    bannerImage: "/images/hero-banarasi-banner.png",
    subcategories: [
      { id: "sub-banarasi-katan", name: "Katan", slug: "katan", subtypes: ["Pure Katan Silk", "Katan Zari Brocade", "Katan Butidar", "Royal Katan Bridal"] },
      { id: "sub-banarasi-organza", name: "Organza", slug: "organza", subtypes: ["Banarasi Kora Organza", "Zari Jaal Organza", "Sheer Handloom Kora", "Tissue Banarasi"] },
      { id: "sub-banarasi-georgette", name: "Georgette", slug: "georgette", subtypes: ["Banarasi Khaddi Georgette", "Cutwork Georgette", "Handloom Bandhani Georgette"] },
      { id: "sub-banarasi-shattir", name: "Shattir", slug: "shattir", subtypes: ["Shattir Silk", "Contemporary Shattir Weave", "Lightweight Banarasi Drape"] },
      { id: "sub-banarasi-brocade", name: "Brocade", slug: "brocade", subtypes: ["Heavy Gold Zari Brocade", "Silver Brocade (Rupa)", "Ganga-Jamuna Brocade", "Shikargah Brocade"] },
    ],
  },
  {
    id: "cat-kanjivaram-default",
    name: "Kanjivaram Sarees",
    slug: "kanjivaram",
    type: "main",
    prefix: "KS",
    displayOrder: 5,
    description: "South India's most celebrated textile treasure handwoven in triple-ply pure mulberry silk and pure gold zari with Korvai contrast borders.",
    coverImage: "/images/hero-kanjivaram-1.png",
    bannerImage: "/images/hero-kanjivaram-banner.png",
    subcategories: [
      { id: "sub-kanjivaram-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Pure Handloom Kanchipuram", "Heavy Weight Kanjivaram", "Classic Mulberry Drape"] },
      { id: "sub-kanjivaram-korvai", name: "Korvai", slug: "korvai", subtypes: ["Traditional Korvai Interlock", "Two-Shuttle Korvai Border", "Muthu Seer Korvai"] },
      { id: "sub-kanjivaram-bridal", name: "Bridal", slug: "bridal", subtypes: ["Muhurtham Special", "Royal Red Bridal Kanjivaram", "Gold Brocade Bridal Drape"] },
      { id: "sub-kanjivaram-temple-border", name: "Temple Border", slug: "temple-border", subtypes: ["Gopuram Temple Border", "Pyramidal Kumbha Peaks", "Contrast Border Weave"] },
      { id: "sub-kanjivaram-checks", name: "Checks", slug: "checks", subtypes: ["Koorai Kadu Checks", "Palum Pazhamum Checks", "Kottadi Checks"] },
    ],
  },
  {
    id: "cat-chanderi-default",
    name: "Chanderi Sarees",
    slug: "chanderi",
    type: "main",
    prefix: "CH",
    displayOrder: 6,
    description: "Feather-light sheer drapes from Madhya Pradesh woven with shimmering gold zari butis and fine silk-cotton yarn.",
    coverImage: "/images/hero-chanderi-1.png",
    bannerImage: "/images/hero-chanderi-banner.png",
    subcategories: [
      { id: "sub-chanderi-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Pure Chanderi Silk", "Fine Warp Silk", "Eknaliya Handloom Silk"] },
      { id: "sub-chanderi-cotton-silk", name: "Cotton Silk", slug: "cotton-silk", subtypes: ["Authentic Sico Chanderi", "Summer Festive Chanderi", "Handloom Cotton-Silk Blend"] },
      { id: "sub-chanderi-zari-buti", name: "Zari Buti", slug: "zari-buti", subtypes: ["Ashrafi Gold Buti", "Paan Buti", "Chatai Motif", "Floral Buti"] },
    ],
  },
  {
    id: "cat-bandhani-default",
    name: "Bandhani Sarees",
    slug: "bandhani",
    type: "main",
    prefix: "BD",
    displayOrder: 7,
    description: "Vibrant tie-dye artistry of Gujarat and Rajasthan with intricate dots, floral clusters, and auspicious ceremonial patterns.",
    coverImage: "/images/hero-bandhani-1.png",
    bannerImage: "/images/hero-bandhani-banner.png",
    subcategories: [
      { id: "sub-bandhani-gujarati", name: "Gujarati Bandhani", slug: "gujarati-bandhani", subtypes: ["Jamnagar Bandhani", "Kutch Hand Tie-Dye", "Gharchola Bandhani"] },
      { id: "sub-bandhani-rajasthani", name: "Rajasthani Bandhani", slug: "rajasthani-bandhani", subtypes: ["Jaipuri Bandhej", "Jodhpur Mothra", "Bikaner Tie-Dye"] },
      { id: "sub-bandhani-gaji-silk", name: "Gaji Silk", slug: "gaji-silk", subtypes: ["Pure Gaji Silk Bandhani", "Glazed Gaji Satin Drape", "Heavy Gaji Bandhani"] },
      { id: "sub-bandhani-leheriya", name: "Leheriya", slug: "leheriya", subtypes: ["Pachrangi Leheriya", "Mothra Criss-Cross", "Samudra Lehar Ripple Drape"] },
    ],
  },
  {
    id: "cat-mysore-silk-default",
    name: "Mysore Silk Sarees",
    slug: "mysore-silk",
    type: "main",
    prefix: "MS",
    displayOrder: 8,
    description: "World-renowned pure crepe silk with pure gold zari borders, non-crush drape, and smooth luxurious sheen.",
    coverImage: "/images/hero-mysore-1.png",
    bannerImage: "/images/hero-mysore-banner.png",
    subcategories: [
      { id: "sub-mysore-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Pure Crepe Silk", "Georgette Mysore Silk", "Solid Dyed Crepe"] },
      { id: "sub-mysore-crepe-silk", name: "Crepe Silk", slug: "crepe-silk", subtypes: ["Heavy GSM Crepe Silk", "Classic Crepe Handloom", "Plain Dyed Crepe"] },
      { id: "sub-mysore-zari-border", name: "Zari Border", slug: "zari-border", subtypes: ["Pure Gold Zari Border", "Kasuti Embroidered Border", "Tissue Zari Pallu"] },
    ],
  },
  {
    id: "cat-ikat-default",
    name: "Ikat Sarees",
    slug: "ikat",
    type: "main",
    prefix: "IK",
    displayOrder: 9,
    description: "Mesmerizing geometric precision in tie-dye resist weaving from Pochampally, Patan Patola, and Sambalpur.",
    coverImage: "/images/hero-ikat-1.png",
    bannerImage: "/images/hero-ikat-banner.png",
    subcategories: [
      { id: "sub-ikat-pochampally", name: "Pochampally", slug: "pochampally", subtypes: ["Pochampally Silk Ikat", "Telangana Handloom Ikat", "Cotton Pochampally"] },
      { id: "sub-ikat-patola", name: "Patola", slug: "patola", subtypes: ["Patan Double Ikat", "Rajkot Single Ikat Patola", "Navratna Patola"] },
      { id: "sub-ikat-sambalpuri", name: "Sambalpuri", slug: "sambalpuri", subtypes: ["Sambalpuri Silk Bandha", "Pasapalli Chessboard Drape", "Bomkai Handloom Ikat"] },
      { id: "sub-ikat-double-ikat", name: "Double Ikat", slug: "double-ikat", subtypes: ["Double Warp & Weft Resist", "Master Artisan Double Ikat"] },
    ],
  },
  {
    id: "cat-cotton-default",
    name: "Cotton Sarees",
    slug: "cotton",
    type: "main",
    prefix: "CT",
    displayOrder: 10,
    description: "Breathable natural Indian cottons from Bengal Tant, Kota Doria, Mangalagiri, and artisanal handloom clusters.",
    coverImage: "/images/hero-cotton-1.png",
    bannerImage: "/images/hero-cotton-banner.png",
    subcategories: [
      { id: "sub-cotton-bengal", name: "Bengal Cotton", slug: "bengal-cotton", subtypes: ["Shantipur Handloom", "Phulia Fine Tant", "Dhakai Jamdani Cotton"] },
      { id: "sub-cotton-tant", name: "Tant", slug: "tant", subtypes: ["Classic Bengal Tant", "Zari Border Tant Cotton", "Summer Crisp Tant"] },
      { id: "sub-cotton-khadi", name: "Khadi", slug: "khadi", subtypes: ["Hand-Spun Pure Khadi", "Organic Khadi Cotton", "Khadi Silk Blend"] },
      { id: "sub-cotton-jamdani", name: "Jamdani", slug: "jamdani", subtypes: ["Fine Muslin Jamdani", "Floral Geometric Jamdani Weave"] },
      { id: "sub-cotton-kota", name: "Kota", slug: "kota", subtypes: ["Kota Doria Cotton", "Zari Khat Checks Kota", "Hand Block Printed Kota"] },
      { id: "sub-cotton-mangalagiri", name: "Mangalagiri", slug: "mangalagiri", subtypes: ["Nizam Border Mangalagiri", "Fine Combed Cotton"] },
      { id: "sub-cotton-chettinad", name: "Chettinad", slug: "chettinad", subtypes: ["Contrast Border Chettinad", "Bold Stripes Cotton"] },
      { id: "sub-cotton-handloom", name: "Handloom Cotton", slug: "handloom-cotton", subtypes: ["Natural Vegetable Dyed", "South Handloom Cotton", "Daily Breathable Cotton"] },
    ],
  },
  {
    id: "cat-silk-default",
    name: "Silk Sarees",
    slug: "silk",
    type: "main",
    prefix: "SK",
    displayOrder: 11,
    description: "The richness of Indian wild silks and mulberry varieties — Tussar, Muga, Eri, Katan, and soft silk handlooms.",
    coverImage: "/images/hero-silk-1.png",
    bannerImage: "/images/hero-silk-banner.png",
    subcategories: [
      { id: "sub-silk-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["100% Mulberry Handloom Silk", "Silk Mark Certified Pure Silk"] },
      { id: "sub-silk-katan", name: "Katan", slug: "katan", subtypes: ["Pure Twisted Yarn Katan", "Traditional Handloom Katan"] },
      { id: "sub-silk-tussar", name: "Tussar", slug: "tussar", subtypes: ["Wild Forest Tussar Silk", "Bhagalpuri Handwoven Tussar", "Kantha Stitched Tussar"] },
      { id: "sub-silk-muga", name: "Muga", slug: "muga", subtypes: ["Assam Golden Muga Silk", "Rare Natural Gold Thread Silk"] },
      { id: "sub-silk-eri", name: "Eri", slug: "eri", subtypes: ["Peace Silk / Ahimsa Eri Silk", "Soft Thermal Assam Eri Drape"] },
      { id: "sub-silk-mulberry", name: "Mulberry", slug: "mulberry", subtypes: ["Filature Mulberry Silk", "Charkha Reeled Pure Silk"] },
      { id: "sub-silk-art-silk", name: "Art Silk", slug: "art-silk", subtypes: ["Affordable Poly-Silk Drape", "Silky Finish Festive Blend"] },
      { id: "sub-silk-soft-silk", name: "Soft Silk", slug: "soft-silk", subtypes: ["Lightweight Soft Silk Handloom", "Flowy Contemporary Silk"] },
      { id: "sub-silk-raw-silk", name: "Raw Silk", slug: "raw-silk", subtypes: ["Textured Raw Silk Saree", "Matka Slub Texture Silk"] },
    ],
  },
  {
    id: "cat-other-traditional-default",
    name: "Other Traditional Sarees",
    slug: "other-traditional",
    type: "main",
    prefix: "OT",
    displayOrder: 12,
    description: "Regional masterpieces across India — Narayan Peth, Nauvari 9-yard, Himroo, Maheshwari, and Kerala Kasavu.",
    coverImage: "/images/hero-traditional-1.png",
    bannerImage: "/images/hero-traditional-banner.png",
    subcategories: [
      { id: "sub-trad-narayan-peth", name: "Narayan Peth", slug: "narayan-peth", subtypes: ["Solapur Narayan Peth", "Rudraksha Border", "Traditional Contrast Pallu"] },
      { id: "sub-trad-nauvari", name: "Nauvari", slug: "nauvari", subtypes: ["Traditional Maharashtrian 9-Yard Kashta", "Yeola Peshwai Nauvari", "Brahmani Style 9-Yard"] },
      { id: "sub-trad-himroo", name: "Himroo", slug: "himroo", subtypes: ["Aurangabad Himroo Brocade", "Persian Style Handloom"] },
      { id: "sub-trad-maheshwari", name: "Maheshwari", slug: "maheshwari", subtypes: ["Maheshwar Fort Border", "Reversible Border Handloom", "Narmada Wave Silk Cotton"] },
      { id: "sub-trad-uppada", name: "Uppada", slug: "uppada", subtypes: ["Uppada Jamdani Pure Silk", "Lightweight Translucent Weave"] },
      { id: "sub-trad-kerala-kasavu", name: "Kerala Kasavu", slug: "kerala-kasavu", subtypes: ["Pure Gold Zari Kasavu", "Traditional Set Saree", "Mural Painted Kasavu", "Onam Special Kasavu"] },
    ],
  },
];

export const ALL_KNOWN_CATEGORIES: CatalogCategory[] = [
  ...CATALOG_CATEGORIES,
  ...PRESERVED_SAREE_CATEGORIES,
];

export const ALLOWED_CATEGORY_NAMES = CATALOG_CATEGORIES.map((c) => c.name);
export const ALLOWED_CATEGORY_SLUGS = CATALOG_CATEGORIES.map((c) => c.slug);

export function normalizeCategoryString(str: string): string {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Finds a catalog category definition by either name, slug, or ID.
 * Resolves both the 6 main categories and legacy saree categories.
 */
export function findCategoryDefinition(input?: string | null): CatalogCategory | null {
  if (!input) return null;
  const raw = String(input).trim();
  const slug = normalizeCategoryString(raw);

  // 1. Direct match in the 6 official main categories
  for (const cat of CATALOG_CATEGORIES) {
    if (
      cat.id.toLowerCase() === raw.toLowerCase() ||
      cat.slug === slug ||
      cat.name.toLowerCase() === raw.toLowerCase() ||
      normalizeCategoryString(cat.name) === slug
    ) {
      return cat;
    }
  }

  // 2. Direct match in preserved traditional saree categories
  for (const cat of PRESERVED_SAREE_CATEGORIES) {
    if (
      cat.id.toLowerCase() === raw.toLowerCase() ||
      cat.slug === slug ||
      cat.name.toLowerCase() === raw.toLowerCase() ||
      normalizeCategoryString(cat.name) === slug
    ) {
      return cat;
    }
  }

  // 3. Common aliases for the 6 main categories
  if (slug === "saree" || slug === "sarees" || slug === "sari" || slug === "saris") {
    return CATALOG_CATEGORIES[0];
  }
  if (slug === "kurti" || slug === "kurtis" || slug === "kurta" || slug === "kurtas") {
    return CATALOG_CATEGORIES[1];
  }
  if (slug === "kurta-set" || slug === "kurta-sets" || slug === "kurti-set" || slug === "kurti-sets" || slug === "kurta-suit") {
    return CATALOG_CATEGORIES[2];
  }
  if (slug === "ethnic-dress" || slug === "ethnic-dresses" || slug === "ethnic-gown" || slug === "anarkali-gown") {
    return CATALOG_CATEGORIES[3];
  }
  if (slug === "western-dress" || slug === "western-dresses" || slug === "dress" || slug === "dresses") {
    return CATALOG_CATEGORIES[4];
  }
  if (slug === "winter-wear" || slug === "winter" || slug === "winterwear" || slug === "winter-fashion") {
    return CATALOG_CATEGORIES[5];
  }
  if (slug === "tops" || slug === "top" || slug === "ladies-tops" || slug === "womens-tops" || slug === "girls-tops" || slug === "ladies-and-girls-tops") {
    return CATALOG_CATEGORIES[6];
  }

  // 4. Legacy saree aliases
  if (slug === "designer-saree" || slug === "designer-sarees" || slug === "bollywood" || slug === "bollywood-sarees") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "designer") || null;
  }
  if (slug === "paithani-saree" || slug === "paithani-sarees" || slug === "wedding-paithani" || slug === "western-paithani") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "paithani") || null;
  }
  if (slug === "gadwal-saree" || slug === "gadwal-sarees") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "gadwal") || null;
  }
  if (slug === "banarasi-saree" || slug === "banarasi-sarees" || slug === "varanasi-silk") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "banarasi") || null;
  }
  if (slug === "kanjivaram-saree" || slug === "kanjivaram-sarees" || slug === "kancheepuram" || slug === "kanchipuram") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "kanjivaram") || null;
  }
  if (slug === "chanderi-saree" || slug === "chanderi-sarees") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "chanderi") || null;
  }
  if (slug === "bandhani-saree" || slug === "bandhani-sarees" || slug === "bandhej") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "bandhani") || null;
  }
  if (slug === "mysore-silk-saree" || slug === "mysore-silk-sarees" || slug === "mysore") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "mysore-silk") || null;
  }
  if (slug === "ikat-saree" || slug === "ikat-sarees" || slug === "pochampally" || slug === "patola") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "ikat") || null;
  }
  if (slug === "cotton-saree" || slug === "cotton-sarees") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "cotton") || null;
  }
  if (slug === "silk-saree" || slug === "silk-sarees" || slug === "contemporary-silk") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "silk") || null;
  }
  if (slug === "other-traditional-saree" || slug === "other-traditional-sarees" || slug === "traditional-sarees" || slug === "traditional") {
    return PRESERVED_SAREE_CATEGORIES.find((c) => c.slug === "other-traditional") || null;
  }

  return null;
}

/**
 * Gets the valid subcategories for a given category.
 */
export function getValidSubcategoriesForCategory(catInput?: string | null): CatalogSubcategory[] {
  const cat = findCategoryDefinition(catInput);
  return cat ? cat.subcategories : [];
}

/**
 * Gets the valid subtypes for a given category and subcategory.
 */
export function getSubtypesForSubcategory(catInput?: string | null, subcatInput?: string | null): string[] {
  const sub = findSubcategoryDefinition(catInput, subcatInput);
  return sub ? sub.subtypes || [] : [];
}

export const SUBCATEGORY_LEGACY_ALIASES: Record<string, Record<string, string>> = {
  sarees: {
    paithani: "Paithani",
    designer: "Designer",
    gadwal: "Gadwal",
    banarasi: "Banarasi",
    kanjivaram: "Kanjivaram",
    chanderi: "Chanderi",
    bandhani: "Bandhani",
    "mysore-silk": "Mysore Silk",
    ikat: "Ikat",
    cotton: "Cotton",
    silk: "Silk",
    "other-traditional": "Other Traditional",
    bridal: "Paithani",
    weddings: "Paithani",
    western: "Paithani",
    bollywood: "Designer",
    "contemporary-silk": "Designer",
    "party-wear": "Designer",
    party: "Designer",
  },
  paithani: {
    bridal: "Bridal",
    "bridal-paithani": "Bridal",
    wedding: "Weddings",
    weddings: "Weddings",
    "wedding-paithani": "Weddings",
    "wedding-paithani-main": "Weddings",
    western: "Western",
    "western-paithani": "Western",
    "western-paithani-main": "Western",
    traditional: "Traditional",
    "traditional-yeola": "Traditional",
    "pure-silk": "Pure Silk",
    muniya: "Muniya",
    kadiyal: "Kadiyal",
    brocade: "Brocade",
    motif: "Motif",
    border: "Border",
    occasion: "Occasion",
    contemporary: "Contemporary",
    "art-silk": "Art Silk",
  },
  designer: {
    bollywood: "Bollywood",
    "bollywood-sarees": "Bollywood",
    contemporary: "Contemporary Silk",
    "contemporary-silk": "Contemporary Silk",
    "contemporary-silk-main": "Contemporary Silk",
    wedding: "Bridal",
    bridal: "Bridal",
    party: "Party Wear",
    "party-wear": "Party Wear",
    embroidered: "Embroidered",
    sequin: "Sequin",
    georgette: "Georgette",
    organza: "Organza",
    chiffon: "Chiffon",
    net: "Net",
    satin: "Satin",
    ruffle: "Ruffle",
    "pre-stitched": "Pre-Stitched",
  },
  kurtis: {
    straight: "Straight Kurti",
    "straight-kurti": "Straight Kurti",
    "a-line": "A-Line Kurti",
    "a-line-kurti": "A-Line Kurti",
    anarkali: "Anarkali Kurti",
    "anarkali-kurti": "Anarkali Kurti",
    angrakha: "Angrakha Kurti",
    "angrakha-kurti": "Angrakha Kurti",
    flared: "Flared Kurti",
    "flared-kurti": "Flared Kurti",
    asymmetrical: "Asymmetrical Kurti",
    "asymmetrical-kurti": "Asymmetrical Kurti",
    kaftan: "Kaftan Kurti",
    "kaftan-kurti": "Kaftan Kurti",
    short: "Short Kurti",
    "short-kurti": "Short Kurti",
    long: "Long Kurti",
    "long-kurti": "Long Kurti",
    "high-low": "High-Low Kurti",
    "high-low-kurti": "High-Low Kurti",
    pakistani: "Pakistani Style Kurti",
    "pakistani-style-kurti": "Pakistani Style Kurti",
    shirt: "Shirt-Style Kurti",
    "shirt-style-kurti": "Shirt-Style Kurti",
    "front-slit": "Front-Slit Kurti",
    "front-slit-kurti": "Front-Slit Kurti",
    jacket: "Jacket-Style Kurti",
    "jacket-style-kurti": "Jacket-Style Kurti",
    cape: "Cape-Style Kurti",
    "cape-style-kurti": "Cape-Style Kurti",
  },
  "kurta-sets": {
    palazzo: "Kurti with Palazzo",
    "kurti-with-palazzo": "Kurti with Palazzo",
    "straight-pants": "Kurti with Straight Pants",
    "kurti-with-straight-pants": "Kurti with Straight Pants",
    "cigarette-pants": "Kurti with Cigarette Pants",
    "kurti-with-cigarette-pants": "Kurti with Cigarette Pants",
    sharara: "Kurti with Sharara",
    "kurti-with-sharara": "Kurti with Sharara",
    gharara: "Kurti with Gharara",
    "kurti-with-gharara": "Kurti with Gharara",
    dhoti: "Kurti with Dhoti Pants",
    "kurti-with-dhoti-pants": "Kurti with Dhoti Pants",
    skirt: "Kurti with Skirt",
    "kurti-with-skirt": "Kurti with Skirt",
    dupatta: "Kurti with Dupatta",
    "kurti-with-dupatta": "Kurti with Dupatta",
    "2-piece": "2-Piece Kurta Set",
    "2-piece-kurta-set": "2-Piece Kurta Set",
    "3-piece": "3-Piece Kurta Set",
    "3-piece-kurta-set": "3-Piece Kurta Set",
  },
  "ethnic-dresses": {
    anarkali: "Anarkali Gown",
    "anarkali-gown": "Anarkali Gown",
    maxi: "Ethnic Maxi Dress",
    "ethnic-maxi-dress": "Ethnic Maxi Dress",
    midi: "Ethnic Midi Dress",
    "ethnic-midi-dress": "Ethnic Midi Dress",
    "a-line": "Ethnic A-Line Dress",
    "ethnic-a-line-dress": "Ethnic A-Line Dress",
    "indo-western": "Indo-Western Dress",
    "indo-western-dress": "Indo-Western Dress",
    "floor-length": "Floor-Length Ethnic Gown",
    "floor-length-ethnic-gown": "Floor-Length Ethnic Gown",
    jacket: "Jacket-Style Ethnic Dress",
    "jacket-style-ethnic-dress": "Jacket-Style Ethnic Dress",
    kaftan: "Kaftan Dress",
    "kaftan-dress": "Kaftan Dress",
    festive: "Festive Ethnic Dress",
    "festive-ethnic-dress": "Festive Ethnic Dress",
    "party-wear": "Party-Wear Ethnic Dress",
    "party-wear-ethnic-dress": "Party-Wear Ethnic Dress",
  },
  "western-dresses": {
    "a-line": "A-Line Dress",
    "a-line-dress": "A-Line Dress",
    "fit-and-flare": "Fit and Flare Dress",
    "fit-and-flare-dress": "Fit and Flare Dress",
    bodycon: "Bodycon Dress",
    "bodycon-dress": "Bodycon Dress",
    maxi: "Maxi Dress",
    "maxi-dress": "Maxi Dress",
    midi: "Midi Dress",
    "midi-dress": "Midi Dress",
    mini: "Mini Dress",
    "mini-dress": "Mini Dress",
    shirt: "Shirt Dress",
    "shirt-dress": "Shirt Dress",
    wrap: "Wrap Dress",
    "wrap-dress": "Wrap Dress",
    skater: "Skater Dress",
    "skater-dress": "Skater Dress",
    tiered: "Tiered Dress",
    "tiered-dress": "Tiered Dress",
    slip: "Slip Dress",
    "slip-dress": "Slip Dress",
    "co-ord": "Co-Ord Dress",
    "co-ord-dress": "Co-Ord Dress",
    denim: "Denim Dress",
    "denim-dress": "Denim Dress",
    floral: "Floral Dress",
    "floral-dress": "Floral Dress",
    ruffle: "Ruffle Dress",
    "ruffle-dress": "Ruffle Dress",
    party: "One-Piece Party Dress",
    "one-piece-party-dress": "One-Piece Party Dress",
  },
  "winter-wear": {
    dresses: "Winter Dresses",
    "winter-dresses": "Winter Dresses",
    sweater: "Sweater Dresses",
    "sweater-dresses": "Sweater Dresses",
    woolen: "Woolen Dresses",
    "woolen-dresses": "Woolen Dresses",
    ethnic: "Winter Ethnic Wear",
    "winter-ethnic-wear": "Winter Ethnic Wear",
    western: "Winter Western Wear",
    "winter-western-wear": "Winter Western Wear",
    velvet: "Velvet Dresses",
    "velvet-dresses": "Velvet Dresses",
    party: "Winter Party Wear",
    "winter-party-wear": "Winter Party Wear",
    "co-ord": "Winter Co-ord Sets",
    "winter-co-ord-sets": "Winter Co-ord Sets",
    jackets: "Winter Jackets & Coats",
    "winter-jackets-coats": "Winter Jackets & Coats",
    casual: "Winter Casual Wear",
    "winter-casual-wear": "Winter Casual Wear",
  },
  tops: {
    "womens-tops": "Casual Tops",
    "girls-tops": "Girls Casual Tops",
    "seasonal-tops": "Winter Tops",
    casual: "Casual Tops",
    "casual-tops": "Casual Tops",
    crop: "Crop Tops",
    "crop-tops": "Crop Tops",
    peplum: "Peplum Tops",
    "peplum-tops": "Peplum Tops",
    tunic: "Tunic Tops",
    "tunic-tops": "Tunic Tops",
    shirt: "Shirt Style Tops",
    "shirt-style": "Shirt Style Tops",
    "shirt-style-tops": "Shirt Style Tops",
    blouse: "Blouse Tops",
    "blouse-tops": "Blouse Tops",
    tank: "Tank Tops",
    "tank-tops": "Tank Tops",
    sleeveless: "Sleeveless Tops",
    "sleeveless-tops": "Sleeveless Tops",
    "off-shoulder": "Off-Shoulder Tops",
    "off-shoulder-tops": "Off-Shoulder Tops",
    "one-shoulder": "One-Shoulder Tops",
    "one-shoulder-tops": "One-Shoulder Tops",
    "halter-neck": "Halter Neck Tops",
    "halter-neck-tops": "Halter Neck Tops",
    "cold-shoulder": "Cold-Shoulder Tops",
    "cold-shoulder-tops": "Cold-Shoulder Tops",
    wrap: "Wrap Tops",
    "wrap-tops": "Wrap Tops",
    ruffle: "Ruffle Tops",
    "ruffle-tops": "Ruffle Tops",
    "tie-up": "Tie-Up Tops",
    "tie-up-tops": "Tie-Up Tops",
    printed: "Printed Tops",
    "printed-tops": "Printed Tops",
    embroidered: "Embroidered Tops",
    "embroidered-tops": "Embroidered Tops",
    lace: "Lace Tops",
    "lace-tops": "Lace Tops",
    party: "Party Wear Tops",
    "party-wear": "Party Wear Tops",
    "party-wear-tops": "Party Wear Tops",
    formal: "Formal Tops",
    "formal-tops": "Formal Tops",
    long: "Long Tops",
    "long-tops": "Long Tops",
    short: "Short Tops",
    "short-tops": "Short Tops",
    "high-low": "High-Low Tops",
    "high-low-tops": "High-Low Tops",
    solid: "Basic / Solid Tops",
    basic: "Basic / Solid Tops",
    "basic-solid-tops": "Basic / Solid Tops",
    "girls-casual": "Girls Casual Tops",
    "girls-casual-tops": "Girls Casual Tops",
    "girls-printed": "Girls Printed Tops",
    "girls-printed-tops": "Girls Printed Tops",
    "girls-graphic": "Girls Graphic Tops",
    "girls-graphic-tops": "Girls Graphic Tops",
    "girls-crop": "Girls Crop Tops",
    "girls-crop-tops": "Girls Crop Tops",
    "girls-ruffle": "Girls Ruffle Tops",
    "girls-ruffle-tops": "Girls Ruffle Tops",
    "girls-peplum": "Girls Peplum Tops",
    "girls-peplum-tops": "Girls Peplum Tops",
    "girls-party": "Girls Party Wear Tops",
    "girls-party-wear": "Girls Party Wear Tops",
    "girls-party-wear-tops": "Girls Party Wear Tops",
    "girls-embroidered": "Girls Embroidered Tops",
    "girls-embroidered-tops": "Girls Embroidered Tops",
    "girls-sleeveless": "Girls Sleeveless Tops",
    "girls-sleeveless-tops": "Girls Sleeveless Tops",
    "girls-full-sleeve": "Girls Full-Sleeve Tops",
    "girls-full-sleeve-tops": "Girls Full-Sleeve Tops",
    "girls-off-shoulder": "Girls Off-Shoulder Tops",
    "girls-off-shoulder-tops": "Girls Off-Shoulder Tops",
    "girls-tunic": "Girls Tunic Tops",
    "girls-tunic-tops": "Girls Tunic Tops",
    "girls-solid": "Girls Basic / Solid Tops",
    "girls-basic-solid-tops": "Girls Basic / Solid Tops",
    winter: "Winter Tops",
    "winter-tops": "Winter Tops",
    sweatshirt: "Sweatshirt Tops",
    "sweatshirt-tops": "Sweatshirt Tops",
    sweater: "Sweater Tops",
    "sweater-tops": "Sweater Tops",
    thermal: "Thermal Tops",
    "thermal-tops": "Thermal Tops",
    "full-sleeve": "Full-Sleeve Tops",
    "full-sleeve-tops": "Full-Sleeve Tops",
  },
};

const dynamicSubcategoriesMap = new Map<string, CatalogSubcategory[]>();

export function registerDynamicSubcategory(parentSlugOrId?: string | null, sub?: CatalogSubcategory | null): void {
  if (!parentSlugOrId || !sub) return;
  const parent = findCategoryDefinition(parentSlugOrId);
  const normKey = parent ? parent.slug : normalizeCategoryString(parentSlugOrId);
  const list = dynamicSubcategoriesMap.get(normKey) || [];
  if (!list.some(s => s.id === sub.id || s.slug === sub.slug || s.name.toLowerCase() === sub.name.toLowerCase())) {
    list.push(sub);
    dynamicSubcategoriesMap.set(normKey, list);
  }
}

export function getDynamicSubcategories(parentSlugOrId?: string | null): CatalogSubcategory[] {
  if (!parentSlugOrId) return [];
  const parent = findCategoryDefinition(parentSlugOrId);
  const normKey = parent ? parent.slug : normalizeCategoryString(parentSlugOrId);
  return dynamicSubcategoriesMap.get(normKey) || [];
}

/**
 * Finds a valid subcategory definition under a given parent category.
 */
export function findSubcategoryDefinition(
  catInput?: string | null,
  subcatInput?: string | null
): CatalogSubcategory | null {
  if (!catInput || !subcatInput) return null;
  const cat = findCategoryDefinition(catInput);
  if (!cat) return null;

  const rawSub = String(subcatInput).trim();
  const subSlug = normalizeCategoryString(rawSub);

  // 1. Direct match by id, slug, or name in static categories
  for (const sub of cat.subcategories) {
    if (
      sub.id.toLowerCase() === rawSub.toLowerCase() ||
      sub.slug === subSlug ||
      sub.name.toLowerCase() === rawSub.toLowerCase() ||
      normalizeCategoryString(sub.name) === subSlug
    ) {
      return sub;
    }
  }

  // 2. Direct match in dynamic subcategories registered under this parent
  const dynamicSubs = getDynamicSubcategories(cat.slug);
  for (const sub of dynamicSubs) {
    if (
      sub.id.toLowerCase() === rawSub.toLowerCase() ||
      sub.slug === subSlug ||
      sub.name.toLowerCase() === rawSub.toLowerCase() ||
      normalizeCategoryString(sub.name) === subSlug
    ) {
      return sub;
    }
  }

  // 3. Safe alias mapping
  const aliasName = SUBCATEGORY_LEGACY_ALIASES[cat.slug]?.[subSlug];
  if (aliasName) {
    const aliasSub = cat.subcategories.find(
      (s) => s.name.toLowerCase() === aliasName.toLowerCase() || s.slug === normalizeCategoryString(aliasName)
    );
    if (aliasSub) return aliasSub;
  }

  // 4. If parent is "sarees", also check if the subcategory matches any preserved traditional saree category
  if (cat.slug === "sarees") {
    const matchedPreserved = PRESERVED_SAREE_CATEGORIES.find(
      (p) => p.slug === subSlug || normalizeCategoryString(p.name) === subSlug
    );
    if (matchedPreserved) {
      return {
        id: matchedPreserved.id,
        name: matchedPreserved.name.replace(/ Sarees$/i, ""),
        slug: matchedPreserved.slug,
        route: `/sarees?subcategory=${matchedPreserved.slug}`,
        subtypes: matchedPreserved.subcategories.map(s => s.name),
      };
    }
  }

  return null;
}

/**
 * Resolves the canonical human-readable name of a subcategory if valid for the category.
 */
export function resolveCanonicalSubcategoryName(
  catInput?: string | null,
  subcatInput?: string | null
): string {
  if (!subcatInput || !String(subcatInput).trim()) return "";
  const sub = findSubcategoryDefinition(catInput, subcatInput);
  return sub ? sub.name : "";
}

/**
 * Checks if a subcategory is valid for a given category.
 */
export function isValidSubcategoryForCategory(
  catInput?: string | null,
  subcatInput?: string | null
): boolean {
  if (!subcatInput || !String(subcatInput).trim()) return true;
  return Boolean(findSubcategoryDefinition(catInput, subcatInput));
}

/**
 * Validates a category and subcategory combination.
 */
export function validateCategoryAndSubcategory(
  catInput?: string | null,
  subcatInput?: string | null
): {
  valid: boolean;
  error?: string;
  categoryDef?: CatalogCategory;
  subcategoryDef?: CatalogSubcategory | null;
} {
  const cat = findCategoryDefinition(catInput);
  if (!cat) {
    return {
      valid: false,
      error: `Invalid category: "${catInput}". Available categories are: ${ALLOWED_CATEGORY_NAMES.join(", ")}.`,
    };
  }

  if (!subcatInput || !String(subcatInput).trim()) {
    return { valid: true, categoryDef: cat, subcategoryDef: null };
  }

  const sub = findSubcategoryDefinition(cat.slug, subcatInput);
  if (!sub) {
    const validNames = cat.subcategories.map((s) => s.name).join(", ");
    return {
      valid: false,
      error: `Invalid subcategory "${subcatInput}" for category "${cat.name}". Valid subcategories are: ${validNames}.`,
    };
  }

  return { valid: true, categoryDef: cat, subcategoryDef: sub };
}

/**
 * Resolves authoritative category and subcategory persistence data.
 */
export function resolveCategoryData(
  catInput?: string | null,
  subcatInput?: string | null,
  subtypeInput?: string | null
): {
  categoryId: string;
  categoryName: string;
  category: string;
  categorySlug: string;
  parentCategoryId: string;
  parentCategoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  subcategory: string | null;
  subcategorySlug: string | null;
  subtype: string | null;
  subtypeId: string | null;
  childCategoryId?: string | null;
} {
  const cat = findCategoryDefinition(catInput) || CATALOG_CATEGORIES[0];
  const sub = findSubcategoryDefinition(cat.slug, subcatInput);

  let validSubtype: string | null = null;
  if (sub && subtypeInput && String(subtypeInput).trim()) {
    const stClean = String(subtypeInput).trim();
    const matched = (sub.subtypes || []).find(
      (st) => st.toLowerCase() === stClean.toLowerCase() || normalizeCategoryString(st) === normalizeCategoryString(stClean)
    );
    validSubtype = matched || stClean;
  }

  const subSlug = sub?.slug || (subcatInput ? normalizeCategoryString(String(subcatInput).trim()) : null);
  const subName = sub?.name || (subcatInput ? String(subcatInput).trim() : null);
  const subId = sub?.id || (subSlug ? `sub-${cat.slug}-${subSlug}` : null);
  const subtypeId = validSubtype ? normalizeCategoryString(validSubtype) : null;

  return {
    categoryId: cat.id,
    categoryName: cat.name,
    category: cat.slug,
    categorySlug: cat.slug,
    parentCategoryId: cat.id,
    parentCategoryName: cat.name,
    subcategoryId: subId,
    subcategoryName: subName,
    subcategory: subName,
    subcategorySlug: subSlug,
    subtype: validSubtype,
    subtypeId: subtypeId,
    childCategoryId: subtypeId,
  };
}
