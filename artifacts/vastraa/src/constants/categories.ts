/**
 * Authoritative Catalog Categories, Subcategories, Subtypes, and Product Attributes for VASTRAA
 *
 * Defines the complete 6 official main women's fashion categories:
 * 1. Sarees
 * 2. Kurtis
 * 3. Kurta Sets
 * 4. Ethnic Dresses
 * 5. Western Dresses
 * 6. Winter Wear
 *
 * And preserves all traditional saree categories, subcategories, weaves, and product attributes
 * for backward compatibility, deep heritage filtering, and seamless catalog management.
 */

export interface CatalogSubcategoryItem {
  id: string;
  name: string;
  slug: string;
  route?: string;
  group?: string;
  subtypes: string[];
  coverImage?: string | null;
  image?: string | null;
  imageUpdatedAt?: Date | string | null;
  imageVersion?: number | string | null;
}

export interface CatalogCategoryItem {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  displayOrder: number;
  description: string;
  coverImage: string;
  bannerImage: string;
  imageUpdatedAt?: Date | string | null;
  imageVersion?: number | string | null;
  subcategories: CatalogSubcategoryItem[];
}

// ─── OFFICIAL 6 MAIN CATALOG CATEGORIES ──────────────────────────────────────

export const CATALOG_CATEGORIES: CatalogCategoryItem[] = [
  // 1. SAREES
  {
    id: "cat-sarees-default",
    name: "Sarees",
    slug: "sarees",
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

  // 7. TOPS (Tops - 46 official subcategories across Women's, Girls', and Seasonal)
  {
    id: "cat-tops-default",
    name: "Tops",
    slug: "tops",
    prefix: "TP",
    displayOrder: 7,
    description: "Chic, contemporary, and everyday tops for women and girls — crop tops, peplums, tunics, shirts, blouses, party wear, and seasonal knits.",
    coverImage: "/images/product-4.png",
    bannerImage: "/images/hero-designer-banner.png",
    subcategories: [
      // Primary Subcategories for Tops Profile Cards & Management
      {
        id: "sub-tops-all",
        name: "All Tops",
        slug: "all-tops",
        route: "/tops?category=tops",
        group: "All Tops",
        coverImage: "/images/product-4.png",
        subtypes: ["All Tops Styles", "Women's & Girls' Tops", "Seasonal Ensembles"],
      },
      {
        id: "sub-tops-womens",
        name: "Women's Tops",
        slug: "womens-tops",
        route: "/tops?category=tops&subcategory=womens-tops",
        group: "Women's Tops",
        coverImage: "/images/product-4.png",
        subtypes: ["Casual Tops", "Crop Tops", "Peplum Tops", "Tunic Tops", "Shirt Style Tops", "Blouse Tops", "Tank Tops", "Party Wear Tops"],
      },
      {
        id: "sub-tops-girls",
        name: "Girls' Tops",
        slug: "girls-tops",
        route: "/tops?category=tops&subcategory=girls-tops",
        group: "Girls' Tops",
        coverImage: "/images/product-3.png",
        subtypes: ["Girls Casual Tops", "Girls Printed Tops", "Girls Graphic Tops", "Girls Crop Tops", "Girls Party Wear Tops"],
      },
      {
        id: "sub-tops-seasonal",
        name: "Seasonal Tops",
        slug: "seasonal-tops",
        route: "/tops?category=tops&subcategory=seasonal-tops",
        group: "Seasonal Tops",
        coverImage: "/images/product-2.png",
        subtypes: ["Winter Tops", "Sweatshirt Tops", "Sweater Tops", "Thermal Tops", "Full-Sleeve Tops"],
      },

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

export const PRESERVED_SAREE_CATEGORIES: CatalogCategoryItem[] = [
  {
    id: "cat-paithani-default",
    name: "Paithani Sarees",
    slug: "paithani",
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

export const CATEGORY_DROPDOWN_OPTIONS = CATALOG_CATEGORIES.map((c) => ({
  value: c.slug,
  label: c.name,
  id: c.id,
  prefix: c.prefix,
}));

export function normalizeCategoryKey(key?: string | null): string {
  return String(key || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function findCategoryBySlugOrName(val?: string | null): CatalogCategoryItem | null {
  if (!val) return null;
  const norm = normalizeCategoryKey(val);

  // 1. Check official 6 main categories
  for (const cat of CATALOG_CATEGORIES) {
    if (cat.slug === norm || normalizeCategoryKey(cat.name) === norm || cat.id === val) {
      return cat;
    }
  }

  // 2. Check preserved saree categories
  for (const cat of PRESERVED_SAREE_CATEGORIES) {
    if (cat.slug === norm || normalizeCategoryKey(cat.name) === norm || cat.id === val) {
      return cat;
    }
  }

  // 3. Aliases for 6 main categories
  if (norm === "saree" || norm === "sarees" || norm === "sari" || norm === "saris") return CATALOG_CATEGORIES[0];
  if (norm === "kurti" || norm === "kurtis" || norm === "kurta" || norm === "kurtas") return CATALOG_CATEGORIES[1];
  if (norm === "kurta-set" || norm === "kurta-sets" || norm === "kurti-set" || norm === "kurti-sets") return CATALOG_CATEGORIES[2];
  if (norm === "ethnic-dress" || norm === "ethnic-dresses" || norm === "ethnic-gown") return CATALOG_CATEGORIES[3];
  if (norm === "western-dress" || norm === "western-dresses" || norm === "dress" || norm === "dresses") return CATALOG_CATEGORIES[4];
  if (norm === "winter-wear" || norm === "winter" || norm === "winterwear") return CATALOG_CATEGORIES[5];
  if (norm === "tops" || norm === "top" || norm === "ladies-tops" || norm === "womens-tops" || norm === "girls-tops" || norm === "ladies-and-girls-tops") return CATALOG_CATEGORIES[6];

  // 4. Aliases for legacy sarees
  if (norm.includes("paithani")) return PRESERVED_SAREE_CATEGORIES[0];
  if (norm.includes("designer") || norm.includes("bollywood")) return PRESERVED_SAREE_CATEGORIES[1];
  if (norm.includes("gadwal")) return PRESERVED_SAREE_CATEGORIES[2];
  if (norm.includes("banarasi")) return PRESERVED_SAREE_CATEGORIES[3];
  if (norm.includes("kanjivaram") || norm.includes("kanchipuram")) return PRESERVED_SAREE_CATEGORIES[4];
  if (norm.includes("chanderi")) return PRESERVED_SAREE_CATEGORIES[5];
  if (norm.includes("bandhani") || norm.includes("bandhej")) return PRESERVED_SAREE_CATEGORIES[6];
  if (norm.includes("mysore")) return PRESERVED_SAREE_CATEGORIES[7];
  if (norm.includes("ikat") || norm.includes("pochampally") || norm.includes("patola")) return PRESERVED_SAREE_CATEGORIES[8];
  if (norm.includes("cotton") || norm.includes("tant")) return PRESERVED_SAREE_CATEGORIES[9];
  if (norm.includes("silk") || norm.includes("tussar") || norm.includes("katan")) return PRESERVED_SAREE_CATEGORIES[10];
  if (norm.includes("traditional") || norm.includes("nauvari") || norm.includes("himroo")) return PRESERVED_SAREE_CATEGORIES[11];

  return null;
}

const clientDynamicSubcategoriesMap = new Map<string, CatalogSubcategoryItem[]>();

export function registerClientDynamicSubcategory(parentSlugOrId?: string | null, sub?: CatalogSubcategoryItem | null): void {
  if (!parentSlugOrId || !sub) return;
  const parent = findCategoryBySlugOrName(parentSlugOrId);
  const normKey = parent ? parent.slug : normalizeCategoryKey(parentSlugOrId);
  const list = clientDynamicSubcategoriesMap.get(normKey) || [];
  if (!list.some(s => s.id === sub.id || s.slug === sub.slug || s.name.toLowerCase() === sub.name.toLowerCase())) {
    list.push(sub);
    clientDynamicSubcategoriesMap.set(normKey, list);
  }
}

export function getClientDynamicSubcategories(parentSlugOrId?: string | null): CatalogSubcategoryItem[] {
  if (!parentSlugOrId) return [];
  const parent = findCategoryBySlugOrName(parentSlugOrId);
  const normKey = parent ? parent.slug : normalizeCategoryKey(parentSlugOrId);
  return clientDynamicSubcategoriesMap.get(normKey) || [];
}

export function getSubcategoriesForCategory(catVal?: string | null, dbCategories?: any[]): CatalogSubcategoryItem[] {
  const cat = findCategoryBySlugOrName(catVal);
  const staticSubs: CatalogSubcategoryItem[] = cat ? [...cat.subcategories] : [];

  // If dbCategories passed from /api/categories query, merge subcategories for this category
  if (dbCategories && Array.isArray(dbCategories) && catVal) {
    const norm = normalizeCategoryKey(catVal);
    const parentDef = cat;
    for (const c of dbCategories) {
      if (!c) continue;
      // If c is the parent category with subcategories array
      if ((c.slug === norm || normalizeCategoryKey(c.name) === norm || (parentDef && (c.id === parentDef.id || c.slug === parentDef.slug))) && Array.isArray(c.subcategories)) {
        for (const sub of c.subcategories) {
          const match = staticSubs.find((s) => s.id === sub.id || s.slug === sub.slug || s.name.toLowerCase() === sub.name?.toLowerCase());
          if (match) {
            if (sub.coverImage !== undefined) {
              match.coverImage = sub.coverImage;
              match.image = sub.coverImage;
            }
            if (sub.imageUpdatedAt) match.imageUpdatedAt = sub.imageUpdatedAt;
            if (sub.imageVersion) match.imageVersion = sub.imageVersion;
          } else {
            staticSubs.push({
              id: sub.id || sub.slug,
              name: sub.name,
              slug: sub.slug,
              coverImage: sub.coverImage || null,
              image: sub.coverImage || null,
              imageUpdatedAt: sub.imageUpdatedAt || sub.updatedAt || null,
              imageVersion: sub.imageVersion || null,
              route: sub.route || `/${parentDef?.slug || norm}?subcategory=${sub.slug}`,
              group: sub.group,
              subtypes: sub.subtypes || [],
            });
          }
        }
      }
      // If c is a child subcategory document pointing to parentId
      if (c.parentId && (c.parentId === norm || (parentDef && (c.parentId === parentDef.id || c.parentId === parentDef.slug)))) {
        const match = staticSubs.find((s) => s.id === c.id || s.slug === c.slug || s.name.toLowerCase() === c.name?.toLowerCase());
        if (match) {
          if (c.coverImage !== undefined) {
            match.coverImage = c.coverImage;
            match.image = c.coverImage;
          }
          if (c.imageUpdatedAt) match.imageUpdatedAt = c.imageUpdatedAt;
          if (c.imageVersion) match.imageVersion = c.imageVersion;
        } else {
          staticSubs.push({
            id: c.id || c.slug,
            name: c.name,
            slug: c.slug,
            coverImage: c.coverImage || null,
            image: c.coverImage || null,
            imageUpdatedAt: c.imageUpdatedAt || c.updatedAt || null,
            imageVersion: c.imageVersion || null,
            route: c.route || `/${parentDef?.slug || norm}?subcategory=${c.slug}`,
            group: c.group,
            subtypes: c.subtypes || [],
          });
        }
      }
    }
  }

  // Also include in-memory registered client dynamic subcategories
  if (cat) {
    const dyn = getClientDynamicSubcategories(cat.slug);
    for (const sub of dyn) {
      if (!staticSubs.some((s) => s.id === sub.id || s.slug === sub.slug || s.name.toLowerCase() === sub.name.toLowerCase())) {
        staticSubs.push(sub);
      }
    }
  }

  return staticSubs;
}

export function getSubtypesForSubcategory(catVal?: string | null, subcatVal?: string | null): string[] {
  if (!catVal || !subcatVal) return [];
  const cat = findCategoryBySlugOrName(catVal);
  if (!cat) return [];

  const normSub = normalizeCategoryKey(subcatVal);
  const sub = cat.subcategories.find(
    (s) => s.slug === normSub || normalizeCategoryKey(s.name) === normSub || s.id === subcatVal
  );
  if (sub) return sub.subtypes;

  const dyn = getClientDynamicSubcategories(cat.slug);
  const dynSub = dyn.find(
    (s) => s.slug === normSub || normalizeCategoryKey(s.name) === normSub || s.id === subcatVal
  );
  return dynSub ? dynSub.subtypes : [];
}

export const SUBCATEGORY_LEGACY_ALIASES: Record<string, Record<string, string>> = {
  sarees: {
    paithani: "paithani",
    designer: "designer",
    gadwal: "gadwal",
    banarasi: "banarasi",
    kanjivaram: "kanjivaram",
    chanderi: "chanderi",
    bandhani: "bandhani",
    "mysore-silk": "mysore-silk",
    ikat: "ikat",
    cotton: "cotton",
    silk: "silk",
    "other-traditional": "other-traditional",
    bridal: "paithani",
    weddings: "paithani",
    western: "paithani",
    bollywood: "designer",
    "contemporary-silk": "designer",
    "party-wear": "designer",
    party: "designer",
  },
  paithani: {
    bridal: "bridal",
    "bridal-paithani": "bridal",
    wedding: "wedding-paithani-main",
    weddings: "wedding-paithani-main",
    "wedding-paithani": "wedding-paithani-main",
    "wedding-paithani-main": "wedding-paithani-main",
    western: "western-paithani-main",
    "western-paithani": "western-paithani-main",
    "western-paithani-main": "western-paithani-main",
    festival: "traditional",
    festive: "traditional",
    "festival-paithani": "traditional",
    contemporary: "contemporary",
    "contemporary-silk": "contemporary",
    "contemporary-silk-paithani": "contemporary",
    yeola: "wedding-paithani-main",
    "traditional-yeola": "wedding-paithani-main",
    muniya: "muniya",
    kadiyal: "kadiyal",
    brocade: "brocade",
  },
  designer: {
    bollywood: "bollywood",
    "bollywood-sarees": "bollywood",
    contemporary: "contemporary-silk-main",
    "contemporary-silk": "contemporary-silk-main",
    "contemporary-silk-main": "contemporary-silk-main",
    party: "party",
    "party-wear": "party",
    bridal: "designer-bridal",
    wedding: "designer-bridal",
    "wedding-designer": "designer-bridal",
    sequin: "sequin",
    organza: "organza",
    georgette: "georgette",
  },
  kurtis: {
    straight: "straight-kurti",
    "straight-kurti": "straight-kurti",
    "a-line": "a-line-kurti",
    "a-line-kurti": "a-line-kurti",
    anarkali: "anarkali-kurti",
    "anarkali-kurti": "anarkali-kurti",
    angrakha: "angrakha-kurti",
    "angrakha-kurti": "angrakha-kurti",
    flared: "flared-kurti",
    "flared-kurti": "flared-kurti",
    asymmetrical: "asymmetrical-kurti",
    "asymmetrical-kurti": "asymmetrical-kurti",
    kaftan: "kaftan-kurti",
    "kaftan-kurti": "kaftan-kurti",
    short: "short-kurti",
    "short-kurti": "short-kurti",
    long: "long-kurti",
    "long-kurti": "long-kurti",
    "high-low": "high-low-kurti",
    "high-low-kurti": "high-low-kurti",
    pakistani: "pakistani-style-kurti",
    "pakistani-style-kurti": "pakistani-style-kurti",
    shirt: "shirt-style-kurti",
    "shirt-style-kurti": "shirt-style-kurti",
    "front-slit": "front-slit-kurti",
    "front-slit-kurti": "front-slit-kurti",
    jacket: "jacket-style-kurti",
    "jacket-style-kurti": "jacket-style-kurti",
    cape: "cape-style-kurti",
    "cape-style-kurti": "cape-style-kurti",
  },
  "kurta-sets": {
    palazzo: "kurti-with-palazzo",
    "kurti-with-palazzo": "kurti-with-palazzo",
    "straight-pants": "kurti-with-straight-pants",
    "kurti-with-straight-pants": "kurti-with-straight-pants",
    "cigarette-pants": "kurti-with-cigarette-pants",
    "kurti-with-cigarette-pants": "kurti-with-cigarette-pants",
    sharara: "kurti-with-sharara",
    "kurti-with-sharara": "kurti-with-sharara",
    gharara: "kurti-with-gharara",
    "kurti-with-gharara": "kurti-with-gharara",
    dhoti: "kurti-with-dhoti-pants",
    "kurti-with-dhoti-pants": "kurti-with-dhoti-pants",
    skirt: "kurti-with-skirt",
    "kurti-with-skirt": "kurti-with-skirt",
    dupatta: "kurti-with-dupatta",
    "kurti-with-dupatta": "kurti-with-dupatta",
    "2-piece": "2-piece-kurta-set",
    "2-piece-kurta-set": "2-piece-kurta-set",
    "3-piece": "3-piece-kurta-set",
    "3-piece-kurta-set": "3-piece-kurta-set",
  },
  "ethnic-dresses": {
    anarkali: "anarkali-gown",
    "anarkali-gown": "anarkali-gown",
    maxi: "ethnic-maxi-dress",
    "ethnic-maxi-dress": "ethnic-maxi-dress",
    midi: "ethnic-midi-dress",
    "ethnic-midi-dress": "ethnic-midi-dress",
    "a-line": "ethnic-a-line-dress",
    "ethnic-a-line-dress": "ethnic-a-line-dress",
    "indo-western": "indo-western-dress",
    "indo-western-dress": "indo-western-dress",
    "floor-length": "floor-length-ethnic-gown",
    "floor-length-ethnic-gown": "floor-length-ethnic-gown",
    jacket: "jacket-style-ethnic-dress",
    "jacket-style-ethnic-dress": "jacket-style-ethnic-dress",
    kaftan: "kaftan-dress",
    "kaftan-dress": "kaftan-dress",
    festive: "festive-ethnic-dress",
    "festive-ethnic-dress": "festive-ethnic-dress",
    "party-wear": "party-wear-ethnic-dress",
    "party-wear-ethnic-dress": "party-wear-ethnic-dress",
  },
  "western-dresses": {
    "a-line": "a-line-dress",
    "a-line-dress": "a-line-dress",
    "fit-and-flare": "fit-and-flare-dress",
    "fit-and-flare-dress": "fit-and-flare-dress",
    bodycon: "bodycon-dress",
    "bodycon-dress": "bodycon-dress",
    maxi: "maxi-dress",
    "maxi-dress": "maxi-dress",
    midi: "midi-dress",
    "midi-dress": "midi-dress",
    mini: "mini-dress",
    "mini-dress": "mini-dress",
    shirt: "shirt-dress",
    "shirt-dress": "shirt-dress",
    wrap: "wrap-dress",
    "wrap-dress": "wrap-dress",
    skater: "skater-dress",
    "skater-dress": "skater-dress",
    tiered: "tiered-dress",
    "tiered-dress": "tiered-dress",
    slip: "slip-dress",
    "slip-dress": "slip-dress",
    "co-ord": "co-ord-dress",
    "co-ord-dress": "co-ord-dress",
    denim: "denim-dress",
    "denim-dress": "denim-dress",
    floral: "floral-dress",
    "floral-dress": "floral-dress",
    ruffle: "ruffle-dress",
    "ruffle-dress": "ruffle-dress",
    party: "one-piece-party-dress",
    "one-piece-party-dress": "one-piece-party-dress",
  },
  "winter-wear": {
    dresses: "winter-dresses",
    "winter-dresses": "winter-dresses",
    sweater: "sweater-dresses",
    "sweater-dresses": "sweater-dresses",
    woolen: "woolen-dresses",
    "woolen-dresses": "woolen-dresses",
    ethnic: "winter-ethnic-wear",
    "winter-ethnic-wear": "winter-ethnic-wear",
    western: "winter-western-wear",
    "winter-western-wear": "winter-western-wear",
    velvet: "velvet-dresses",
    "velvet-dresses": "velvet-dresses",
    party: "winter-party-wear",
    "winter-party-wear": "winter-party-wear",
    "co-ord": "winter-co-ord-sets",
    "winter-co-ord-sets": "winter-co-ord-sets",
    jackets: "winter-jackets-coats",
    "winter-jackets-coats": "winter-jackets-coats",
    casual: "winter-casual-wear",
    "winter-casual-wear": "winter-casual-wear",
  },
};

export function findSubcategoryDefinition(
  catVal?: string | null,
  subcatVal?: string | null
): CatalogSubcategoryItem | null {
  if (!catVal || !subcatVal) return null;
  const cat = findCategoryBySlugOrName(catVal);
  if (!cat) return null;

  const rawSub = String(subcatVal).trim();
  const subSlug = normalizeCategoryKey(rawSub);

  for (const sub of cat.subcategories) {
    if (
      sub.id.toLowerCase() === rawSub.toLowerCase() ||
      sub.slug === subSlug ||
      sub.name.toLowerCase() === rawSub.toLowerCase() ||
      normalizeCategoryKey(sub.name) === subSlug
    ) {
      return sub;
    }
  }

  const dyn = getClientDynamicSubcategories(cat.slug);
  for (const sub of dyn) {
    if (
      sub.id.toLowerCase() === rawSub.toLowerCase() ||
      sub.slug === subSlug ||
      sub.name.toLowerCase() === rawSub.toLowerCase() ||
      normalizeCategoryKey(sub.name) === subSlug
    ) {
      return sub;
    }
  }

  const aliasSlug = SUBCATEGORY_LEGACY_ALIASES[cat.slug]?.[subSlug];
  if (aliasSlug) {
    const aliasSub = cat.subcategories.find((s) => s.slug === aliasSlug || s.name.toLowerCase() === aliasSlug.toLowerCase());
    if (aliasSub) return aliasSub;
  }

  return null;
}

export function resolveCanonicalSubcategoryName(
  catVal?: string | null,
  subcatVal?: string | null
): string {
  if (!subcatVal || !String(subcatVal).trim()) return "";
  const sub = findSubcategoryDefinition(catVal, subcatVal);
  return sub ? sub.name : String(subcatVal);
}

export function isValidSubcategoryForCategory(catVal?: string | null, subcatVal?: string | null): boolean {
  if (!subcatVal || !String(subcatVal).trim()) return true;
  return Boolean(findSubcategoryDefinition(catVal, subcatVal));
}

/**
 * Universal classifier for matching products to any of the 6 official categories or legacy sarees
 */
export function isCategoryProduct(p: any, targetCategorySlug: string): boolean {
  if (!p || !targetCategorySlug) return false;
  const target = normalizeCategoryKey(targetCategorySlug);

  const cat = String(p.category || "").toLowerCase().trim();
  const catSlug = normalizeCategoryKey(cat);
  const catId = String(p.categoryId || "").toLowerCase().trim();
  const parentId = String(p.parentCategoryId || p.parentId || "").toLowerCase().trim();
  const subcat = String(p.subcategory || p.subCategory || "").toLowerCase().trim();
  const subcatSlug = normalizeCategoryKey(subcat);
  const childCat = String(p.childCategory || "").toLowerCase().trim();
  const name = String(p.name || "").toLowerCase().trim();

  // Direct match
  if (catSlug === target || cat === target || catId === `cat-${target}-default`) return true;
  if (parentId === `cat-${target}-default` || parentId === target) return true;

  switch (target) {
    case "sarees":
    case "saree":
      return (
        catSlug === "sarees" ||
        catSlug === "saree" ||
        catId === "cat-sarees-default" ||
        cat.includes("saree") ||
        cat.includes("paithani") ||
        cat.includes("designer") ||
        cat.includes("banarasi") ||
        cat.includes("kanjivaram") ||
        cat.includes("chanderi") ||
        cat.includes("bandhani") ||
        cat.includes("mysore") ||
        cat.includes("ikat") ||
        cat.includes("gadwal") ||
        name.includes("saree")
      );

    case "kurtis":
    case "kurti":
      return (
        catSlug === "kurtis" ||
        catSlug === "kurti" ||
        catId === "cat-kurtis-default" ||
        cat.includes("kurti") ||
        cat.includes("kurta") ||
        subcat.includes("kurti") ||
        name.includes("kurti") ||
        name.includes("kurta")
      );

    case "kurta-sets":
    case "kurta-set":
      return (
        catSlug === "kurta-sets" ||
        catSlug === "kurta-set" ||
        catId === "cat-kurta-sets-default" ||
        cat.includes("kurta set") ||
        cat.includes("kurta-set") ||
        cat.includes("kurti set") ||
        subcat.includes("kurti with") ||
        subcat.includes("kurta set") ||
        name.includes("kurta set") ||
        name.includes("kurti set") ||
        name.includes("with palazzo") ||
        name.includes("with pants") ||
        name.includes("with sharara")
      );

    case "ethnic-dresses":
    case "ethnic-dress":
      return (
        catSlug === "ethnic-dresses" ||
        catSlug === "ethnic-dress" ||
        catId === "cat-ethnic-dresses-default" ||
        cat.includes("ethnic dress") ||
        cat.includes("ethnic-dress") ||
        subcat.includes("ethnic") ||
        subcat.includes("anarkali gown") ||
        name.includes("ethnic dress") ||
        name.includes("anarkali gown") ||
        name.includes("indo-western dress")
      );

    case "western-dresses":
    case "western-dress":
      return (
        catSlug === "western-dresses" ||
        catSlug === "western-dress" ||
        catId === "cat-western-dresses-default" ||
        cat.includes("western dress") ||
        cat.includes("western-dress") ||
        subcat.includes("bodycon") ||
        subcat.includes("fit and flare") ||
        subcat.includes("skater dress") ||
        name.includes("western dress") ||
        name.includes("bodycon") ||
        name.includes("wrap dress")
      );

    case "winter-wear":
    case "winter":
      return (
        catSlug === "winter-wear" ||
        catSlug === "winter" ||
        catId === "cat-winter-wear-default" ||
        cat.includes("winter") ||
        subcat.includes("winter") ||
        subcat.includes("sweater dress") ||
        subcat.includes("woolen") ||
        subcat.includes("velvet dress") ||
        name.includes("winter") ||
        name.includes("sweater dress") ||
        name.includes("woolen")
      );

    case "tops":
    case "top":
    case "ladies-tops":
    case "womens-tops":
    case "girls-tops":
      return (
        catSlug === "tops" ||
        catSlug === "top" ||
        catId === "cat-tops-default" ||
        cat.includes("tops") ||
        subcat.includes("top") ||
        name.includes("top") ||
        name.includes("tunic") ||
        name.includes("blouse") ||
        name.includes("peplum") ||
        name.includes("shirt")
      );

    // Legacy saree categories
    case "paithani":
      if (
        (cat.includes("designer") || catSlug.includes("designer") || catId.includes("designer")) &&
        !name.includes("paithani") && !cat.includes("paithani")
      ) {
        return false;
      }
      return (
        cat.includes("paithani") ||
        catSlug.includes("paithani") ||
        catId.includes("paithani") ||
        subcat.includes("paithani") ||
        subcatSlug.includes("paithani") ||
        childCat.includes("paithani") ||
        name.includes("paithani") ||
        name.includes("yeola")
      );

    case "designer":
      if (
        (cat.includes("paithani") || name.includes("paithani") || name.includes("yeola")) &&
        !cat.includes("designer")
      ) {
        return false;
      }
      return (
        cat.includes("designer") ||
        catSlug.includes("designer") ||
        catId.includes("designer") ||
        cat.includes("bollywood") ||
        subcat.includes("designer") ||
        subcat.includes("bollywood") ||
        name.includes("designer") ||
        name.includes("bollywood") ||
        name.includes("party wear")
      );

    case "gadwal":
      return cat.includes("gadwal") || catSlug.includes("gadwal") || subcat.includes("gadwal") || name.includes("gadwal");

    case "banarasi":
      return cat.includes("banarasi") || catSlug.includes("banarasi") || subcat.includes("banarasi") || name.includes("banarasi") || name.includes("katan");

    case "kanjivaram":
      return cat.includes("kanjivaram") || catSlug.includes("kanjivaram") || cat.includes("kanchipuram") || subcat.includes("kanjivaram") || name.includes("kanjivaram");

    case "chanderi":
      return cat.includes("chanderi") || catSlug.includes("chanderi") || subcat.includes("chanderi") || name.includes("chanderi");

    case "bandhani":
      return cat.includes("bandhani") || catSlug.includes("bandhani") || cat.includes("bandhej") || subcat.includes("bandhani") || name.includes("bandhani");

    case "mysore-silk":
      return cat.includes("mysore") || catSlug.includes("mysore") || subcat.includes("mysore") || name.includes("mysore");

    case "ikat":
      return cat.includes("ikat") || catSlug.includes("ikat") || cat.includes("pochampally") || cat.includes("patola") || subcat.includes("ikat") || name.includes("ikat");

    case "cotton":
      return cat.includes("cotton") || catSlug.includes("cotton") || subcat.includes("cotton") || name.includes("cotton");

    case "silk":
      return (
        cat === "silk" || catSlug === "silk" || catId === "cat-silk-default" ||
        (cat.includes("silk") && !cat.includes("paithani") && !cat.includes("designer") && !cat.includes("mysore")) ||
        subcat.includes("tussar") || subcat.includes("muga") || name.includes("tussar silk") || name.includes("raw silk")
      );

    case "other-traditional":
      return (
        cat.includes("traditional") || catSlug.includes("traditional") ||
        cat.includes("nauvari") || cat.includes("himroo") || cat.includes("narayan-peth") ||
        name.includes("nauvari") || name.includes("narayan peth") || name.includes("himroo") || name.includes("kasavu")
      );

    default:
      return catSlug === target || name.includes(target);
  }
}

export function isPaithaniProduct(p: any): boolean {
  return isCategoryProduct(p, "paithani");
}

export function isDesignerProduct(p: any): boolean {
  return isCategoryProduct(p, "designer");
}

// ─── PRODUCT ATTRIBUTE CHOICES ──────────────────────────────────────────────

export const FABRICS_OPTIONS = [
  "Pure Mulberry Silk",
  "Handloom Silk",
  "Katan Silk",
  "Tussar Silk",
  "Muga Silk",
  "Eri Silk",
  "Soft Silk",
  "Raw Silk",
  "Matka Silk",
  "Ghicha Silk",
  "Tissue Silk",
  "Crepe Silk",
  "Organza Silk",
  "Art Silk",
  "Cotton Silk (Sico)",
  "Pure Cotton",
  "Khadi Cotton",
  "Tant Cotton",
  "Mulmul Cotton",
  "Rayon",
  "Georgette",
  "Viscose Georgette",
  "Chiffon",
  "Net",
  "Satin",
  "Velvet",
  "Linen",
  "Denim",
  "Wool / Wool Blend",
  "Cashmere Blend",
];

export const WEAVING_TECHNIQUES_OPTIONS = [
  "Handloom (Authentic Pitloom/Frame Loom)",
  "Kadiyal (Interlocking Weft)",
  "Kuppadam (Three-Shuttle Interlock)",
  "Korvai (Contrast Body & Border)",
  "Katan Weave",
  "Tanchoi Weave",
  "Jamdani Weave",
  "Eknaliya Weave",
  "Double Ikat (Patola/Pochampally)",
  "Single Ikat (Bandha)",
  "Tie & Dye (Bandhani/Bandhej)",
  "Leheriya Ripple Dye",
  "Powerloom / Machine Weave",
  "Jacquard Weave",
];

export const WORK_TYPES_OPTIONS = [
  "Pure Gold Zari Work",
  "Silver Zari Work",
  "Tested Gold Zari",
  "Zardozi Hand Embroidery",
  "Resham Thread Embroidery",
  "Gota Patti Work",
  "Aari Work",
  "Sequin & Shimmer Work",
  "Cutwork Embroidery",
  "Mirror Work",
  "Chikankari Work",
  "Meenakari Detailing",
  "Digital Print",
  "Hand Block Print",
  "Kalamkari Hand Painting",
  "Plain / Minimal",
];

export const BORDER_TYPES_OPTIONS = [
  "Narali Border (Coconut Pattern)",
  "Pankha Border (Fan Pattern)",
  "Muniya Border (Single/Double Parrot)",
  "Temple Border (Kumbha/Gopuram)",
  "Kadiyal Contrast Border",
  "Kuppadam Interlock Border",
  "Broad Zari Kaddi Border",
  "Ganga-Jamuna (Dual Contrast) Border",
  "Scalloped Cutwork Border",
  "Ruffle Border",
  "Zari Ribbon / Lagdi Patta Border",
  "Tissue Shimmer Border",
  "Sleek Piping Border",
];

export const PALLU_DESIGNS_OPTIONS = [
  "Mor Bangadi (Peacock in Ring)",
  "Asavali (Flowering Vine)",
  "Muniyan (Parrot Cluster)",
  "Hans (Swan Pattern)",
  "Kamal (Lotus Motifs)",
  "Heavy Brocade Gold Zari Jaal",
  "Shikargah (Hunting Scene)",
  "Kumbha Pyramidal Rows",
  "Geometric Bandha Diamond",
  "Tassels with Zari Stripes",
  "Floral Botanical Vines",
  "Minimal Contrast Lines",
];

export const OCCASIONS_OPTIONS = [
  "Bridal & Muhurtham",
  "Wedding Reception",
  "Sangeet & Haldi",
  "Festive & Diwali",
  "Puja & Rituals",
  "Cocktail & Evening Gala",
  "Party Wear",
  "Formal & Office Wear",
  "Casual & Summer Wear",
  "Everyday Traditional",
  "Winter Holiday & Travel",
];

export const ORIGINS_OPTIONS = [
  "Yeola, Maharashtra",
  "Paithan, Maharashtra",
  "Varanasi, Uttar Pradesh",
  "Kanchipuram, Tamil Nadu",
  "Gadwal, Telangana",
  "Chanderi, Madhya Pradesh",
  "Pochampally, Telangana",
  "Patan & Jamnagar, Gujarat",
  "Jaipur, Rajasthan",
  "Mysuru, Karnataka",
  "Sambalpur & Nuapatna, Odisha",
  "Shantipur & Phulia, West Bengal",
  "Bhagalpur, Bihar",
  "Assam Handlooms",
  "Chettinad, Tamil Nadu",
  "Mangalagiri, Andhra Pradesh",
  "Balaramapuram, Kerala",
  "Solapur & Sholapur, Maharashtra",
  "Maheshwar, Madhya Pradesh",
  "Surat, Gujarat",
  "Delhi / NCR",
  "Mumbai, Maharashtra",
];

export const SAREE_LENGTHS_OPTIONS = [
  "5.5 Metres (Standard Saree)",
  "6.2 Metres (With Attached Blouse Piece)",
  "6.3 Metres (Extended Draping)",
  "8.2 Metres (Nauvari / 9-Yard Kashta)",
  "9.0 Metres (Traditional Maharashtrian 9-Yard)",
];

export const COLORS_OPTIONS = [
  "Red",
  "Maroon",
  "Wine",
  "Pink",
  "Baby Pink",
  "Magenta",
  "Rani Pink",
  "Royal Blue",
  "Navy Blue",
  "Sky Blue",
  "Peacock Blue",
  "Emerald Green",
  "Bottle Green",
  "Parrot Green",
  "Pista Green",
  "Yellow",
  "Mustard Yellow",
  "Turmeric Gold",
  "Orange",
  "Rust Orange",
  "Peach",
  "Purple",
  "Lavender",
  "Gold",
  "Rose Gold",
  "Silver",
  "Copper",
  "Black",
  "Grey",
  "Beige",
  "Cream",
  "Off-White",
  "White",
  "Multi-Color / Dual Tone",
];

// ─── WOMEN'S FASHION CATEGORY-SPECIFIC ATTRIBUTES ───────────────────────────

export const KURTI_LENGTHS_OPTIONS = [
  "Short (Hip Length)",
  "Knee Length",
  "Calf Length",
  "Ankle Length",
  "Floor Length",
];

export const KURTI_FITS_OPTIONS = [
  "Straight Fit",
  "A-Line",
  "Anarkali Flare",
  "Flared",
  "Asymmetrical",
  "Kaftan Loose Fit",
  "Relaxed Fit",
  "Slim Fit",
];

export const SLEEVE_LENGTHS_OPTIONS = [
  "Sleeveless",
  "Cap Sleeve",
  "Short Sleeve",
  "Three-Quarter Sleeve (3/4th)",
  "Full Sleeve",
  "Cape Sleeve",
  "Bell Sleeve",
];

export const NECK_TYPES_OPTIONS = [
  "Round Neck",
  "V-Neck",
  "Mandarin / Chinese Collar",
  "Boat Neck",
  "Sweetheart Neck",
  "Square Neck",
  "Keyhole Neck",
  "Angrakha Wrap Neck",
  "Shirt Collar",
  "Cowl Neck",
  "Halter Neck",
  "Off-Shoulder",
];

export const KURTA_SET_PIECES_OPTIONS = [
  "2-Piece Set (Kurta + Bottom)",
  "3-Piece Set (Kurta + Bottom + Dupatta)",
];

export const BOTTOM_TYPES_OPTIONS = [
  "Palazzo Pants",
  "Straight Pants",
  "Cigarette Pants",
  "Sharara Pants",
  "Gharara",
  "Dhoti Pants",
  "Flared Skirt",
  "Churidar",
  "Salwar",
];

export const DUPATTA_TYPES_OPTIONS = [
  "Chiffon Dupatta",
  "Organza Dupatta",
  "Silk Blend Dupatta",
  "Pure Cotton Dupatta",
  "Banarasi Zari Dupatta",
  "Bandhani Dupatta",
  "Net Embellished Dupatta",
  "Without Dupatta",
];

export const DRESS_LENGTHS_OPTIONS = [
  "Mini (Above Knee)",
  "Knee-Length",
  "Midi (Calf Length)",
  "Maxi (Ankle Length)",
  "Floor-Length Gown",
];

export const WESTERN_DRESS_FITS_OPTIONS = [
  "Bodycon (Fitted)",
  "Fit and Flare",
  "A-Line",
  "Shift / Straight",
  "Skater",
  "Slip Dress",
  "Wrap Dress",
  "Tiered / Smocked",
  "Shirt Dress",
];

export const WINTER_GARMENT_TYPES_OPTIONS = [
  "Winter Dress",
  "Sweater Dress",
  "Woolen Dress",
  "Winter Ethnic Wear",
  "Winter Western Wear",
  "Velvet Dress",
  "Winter Party Wear",
  "Winter Co-ord Set",
  "Winter Jacket & Coat",
  "Winter Casual Wear",
];

export const WINTER_WARMTH_LEVELS_OPTIONS = [
  "Mild Winter / Light Warmth",
  "Moderate Winter / Medium Warmth",
  "Heavy Winter / Extreme Cold Warmth",
];

// ─── TOPS (WOMEN'S & GIRLS') ATTRIBUTES ────────────────────────────────────

export const WOMENS_TOPS_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
export const GIRLS_TOPS_SIZES = [
  "2-3Y", "3-4Y", "4-5Y", "5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"
];
export const ALL_TOPS_SIZES = [...WOMENS_TOPS_SIZES, ...GIRLS_TOPS_SIZES];

export const TOPS_NECK_TYPES = [
  "Round Neck",
  "V-Neck",
  "Collar / Shirt Collar",
  "Boat Neck",
  "Square Neck",
  "Sweetheart Neck",
  "Halter Neck",
  "Off-Shoulder",
  "One-Shoulder",
  "Cold Shoulder",
  "Cowl Neck",
  "Keyhole Neck",
  "Mandarin / Chinese Collar",
  "High Neck / Turtleneck",
  "Tie-Up / Bow Neck",
];

export const TOPS_SLEEVE_LENGTHS = [
  "Sleeveless",
  "Cap Sleeve",
  "Short Sleeve",
  "Three-Quarter Sleeve (3/4th)",
  "Full Sleeve",
  "Bell Sleeve",
  "Roll-Up Sleeve",
  "Flounce / Ruffle Sleeve",
  "Cold Shoulder",
  "Off-Shoulder",
];

export const TOPS_FITS = [
  "Regular Fit",
  "Slim Fit",
  "Relaxed / Loose Fit",
  "Oversized",
  "Cropped",
  "Peplum / Flared",
  "Boxy Fit",
  "Bodycon",
];

export const TOPS_PATTERNS = [
  "Solid / Plain",
  "Floral Print",
  "Geometric Print",
  "Striped",
  "Polka Dot",
  "Abstract Print",
  "Graphic / Slogan Print",
  "Embroidered",
  "Lace Detailing",
  "Tie-Dye / Ombre",
  "Animal Print",
  "Sequin / Shimmer",
];

export const EXCLUDED_MAIN_CATEGORY_SLUGS = new Set([
  "bollywood",
  "cat-bollywood-default",
  "bollywood-handcrafted",
  "bridal",
  "cat-bridal-default",
  "bridal-handcrafted",
  "contemporary-silk-main",
  "cat-contemporary-silk-main",
  "contemporary-silk-handcrafted",
  "contemporary-silk",
  "party",
  "cat-party-default",
  "party-wear-handcrafted",
  "wedding-paithani-main",
  "cat-wedding-paithani-main",
  "wedding-paithani-handcrafted",
  "weddings",
  "western-paithani-main",
  "cat-western-paithani-main",
  "western-paithani-handcrafted",
  "western",
]);

export function isMainCatalogCategory(c: any): boolean {
  if (!c) return false;
  if (c.parentId) return false;
  if (c.type === "subcategory") return false;
  if (EXCLUDED_MAIN_CATEGORY_SLUGS.has(c.slug) || EXCLUDED_MAIN_CATEGORY_SLUGS.has(c.id)) return false;
  return true;
}
