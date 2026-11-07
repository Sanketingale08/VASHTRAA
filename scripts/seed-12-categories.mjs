import { MongoClient } from "mongodb";

const uri = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";

const CATEGORIES_DATA = [
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
      { id: "sub-paithani-traditional", name: "Traditional", slug: "traditional", subtypes: ["Yeola Traditional", "Classic Handloom", "Royal Peshwai", "Vintage Asavali"] },
      { id: "sub-paithani-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Pure Handloom Silk", "Double Warp Pure Silk", "Fine Mulberry Silk", "Charkha Silk"] },
      { id: "sub-paithani-kadiyal", name: "Kadiyal", slug: "kadiyal", subtypes: ["Interlocking Border", "Contrast Kadiyal Weave", "Three-Shuttle Kadiyal"] },
      { id: "sub-paithani-muniya", name: "Muniya", slug: "muniya", subtypes: ["Single Muniya Border", "Double Muniya Border", "Triple Muniya Border", "Parrot Muniya"] },
      { id: "sub-paithani-brocade", name: "Brocade", slug: "brocade", subtypes: ["All-Over Brocade", "All-Over Zari Jaal", "Heavy Brocade Pallu", "Tissue Brocade"] },
      { id: "sub-paithani-motif", name: "Motif", slug: "motif", subtypes: ["Mor Bangadi (Peacock)", "Asavali (Flowering Vine)", "Muniya (Parrot)", "Kamal (Lotus)", "Hans (Swan)"] },
      { id: "sub-paithani-border", name: "Border", slug: "border", subtypes: ["Narali Border (Coconut)", "Pankha Border", "Broad Temple Border", "Kadiyal Contrast Border"] },
      { id: "sub-paithani-occasion", name: "Occasion", slug: "occasion", subtypes: ["Bridal Paithani", "Wedding Reception", "Festive Celebrations", "Puja & Rituals"] },
      { id: "sub-paithani-contemporary", name: "Contemporary", slug: "contemporary", subtypes: ["Pastel Contemporary", "Fusion Drape Paithani", "Modern Geometric Motif", "Lightweight Festive"] },
      { id: "sub-paithani-art-silk", name: "Art Silk", slug: "art-silk", subtypes: ["Budget Semi-Paithani", "Machine Loom Paithani", "Art Silk Festive"] },
    ],
  },
  {
    id: "cat-designer-default",
    name: "Designer Sarees",
    slug: "designer",
    prefix: "DS",
    displayOrder: 2,
    description: "Trendsetting contemporary haute couture drapes featuring intricate embroidery, shimmering sequins, fluid organza, and modern silhouettes.",
    coverImage: "/images/hero-designer-1.png",
    bannerImage: "/images/hero-designer-banner.png",
    subcategories: [
      { id: "sub-designer-embroidered", name: "Embroidered", slug: "embroidered", subtypes: ["Zardozi Handwork", "Resham Thread Embroidery", "Gota Patti", "Aari Work", "Cutwork Embroidery"] },
      { id: "sub-designer-sequin", name: "Sequin", slug: "sequin", subtypes: ["Dual-Tone Shimmer", "Ombre Sequin Sheet", "Matte Sequin Border", "Geometric Sequin Jaal"] },
      { id: "sub-designer-georgette", name: "Georgette", slug: "georgette", subtypes: ["Pure Viscose Georgette", "Heavy Embroidered Georgette", "Pleated Georgette", "Printed Georgette"] },
      { id: "sub-designer-organza", name: "Organza", slug: "organza", subtypes: ["Hand-Painted Floral Organza", "Scalloped Border Organza", "Mirror Work Organza", "Metallic Organza"] },
      { id: "sub-designer-chiffon", name: "Chiffon", slug: "chiffon", subtypes: ["Pure Silk Chiffon", "Ombre Dyed Chiffon", "Delicate Pearl Border Chiffon"] },
      { id: "sub-designer-net", name: "Net", slug: "net", subtypes: ["Heavy Flare Net", "Butterfly Net with Crystals", "Applique Work Net"] },
      { id: "sub-designer-satin", name: "Satin", slug: "satin", subtypes: ["Liquid Satin", "Crepe Satin with Crystal Border", "Dual-Tone Gloss Satin"] },
      { id: "sub-designer-silk-designer", name: "Silk Designer", slug: "silk-designer", subtypes: ["Modern Raw Silk Fusion", "Tussar Designer Embellished", "Matka Silk Contemporary"] },
      { id: "sub-designer-ruffle", name: "Ruffle", slug: "ruffle", subtypes: ["Tiered Ruffle Border", "Cascade Flare Ruffle", "Pleated Ruffle Pallu"] },
      { id: "sub-designer-pre-stitched", name: "Pre-Stitched", slug: "pre-stitched", subtypes: ["1-Minute Ready-to-Wear", "Pant Style Drape", "Dhoti Saree Drape", "Belted Modern Drape"] },
      { id: "sub-designer-printed", name: "Printed", slug: "printed", subtypes: ["Digital Abstract Print", "Vintage Botanical Print", "Geometric Monogram Print"] },
      { id: "sub-designer-party-wear", name: "Party Wear", slug: "party-wear", subtypes: ["Cocktail Evening Saree", "Sangeet Glam Saree", "Farewell Special"] },
      { id: "sub-designer-bridal", name: "Bridal", slug: "bridal", subtypes: ["Heavy Velvet Bridal Saree", "Red & Crimson Trousseau", "Couture Reception Saree"] },
    ],
  },
  {
    id: "cat-gadwal-default",
    name: "Gadwal Sarees",
    slug: "gadwal",
    prefix: "GD",
    displayOrder: 3,
    description: "Renowned Telanganite handlooms celebrated for their contrast silk borders attached via the iconic interlocking Kuppadam weaving technique.",
    coverImage: "/images/hero-gadwal-1.png",
    bannerImage: "/images/hero-gadwal-banner.png",
    subcategories: [
      { id: "sub-gadwal-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Gadwal Pure Silk (Pattu)", "Heavy Gold Zari Gadwal", "Contrast Body Pattu"] },
      { id: "sub-gadwal-cotton", name: "Cotton", slug: "cotton", subtypes: ["Fine Handloom Cotton Body", "Zari Border Cotton Gadwal", "Summer Daily Luxury"] },
      { id: "sub-gadwal-sico", name: "Sico", slug: "sico", subtypes: ["Silk-Cotton Blend (Sico)", "Dual Shade Sico", "Lightweight Festive Sico"] },
      { id: "sub-gadwal-brocade", name: "Brocade", slug: "brocade", subtypes: ["Rich Brocade Pallu", "Gold Silver Brocade Zari", "Intricate Buti Body"] },
      { id: "sub-gadwal-kuppadam", name: "Kuppadam", slug: "kuppadam", subtypes: ["Authentic Kuppadam Interlock Weave", "Three-Shuttle Kuppadam", "Contrast Kuppadam Border"] },
      { id: "sub-gadwal-meenakari", name: "Meenakari", slug: "meenakari", subtypes: ["Enamelled Floral Meena", "Multi-Color Meenakari Buti", "Silver-Gold Ganga-Jamuna Meena"] },
      { id: "sub-gadwal-border", name: "Border", slug: "border", subtypes: ["Temple Border (Kumbha)", "Broad Kaddi Border", "Ganga-Jamuna Contrast Border"] },
      { id: "sub-gadwal-pattern", name: "Pattern", slug: "pattern", subtypes: ["Coin (Kasu) Buti", "Peacock (Mayil) Weave", "Checks & Stripes Pattern"] },
      { id: "sub-gadwal-occasion", name: "Occasion", slug: "occasion", subtypes: ["Bridal Gadwal", "Festive Temple Visit", "Formal Cultural Gathering"] },
    ],
  },
  {
    id: "cat-banarasi-default",
    name: "Banarasi Sarees",
    slug: "banarasi",
    prefix: "BN",
    displayOrder: 4,
    description: "Varanasi's legendary regal weaves crafted with fine gold and silver zari, intricate floral jaals, and Mughal-inspired motifs.",
    coverImage: "/images/hero-banarasi-1.png",
    bannerImage: "/images/hero-banarasi-banner.png",
    subcategories: [
      { id: "sub-banarasi-katan", name: "Katan", slug: "katan", subtypes: ["Pure Katan Silk", "Katan Shikargah Weave", "Katan Jangla Jaal", "Katan Butidar"] },
      { id: "sub-banarasi-organza", name: "Organza", slug: "organza", subtypes: ["Kora Organza with Zari", "Tissue Organza", "Embroidered Organza Banarasi"] },
      { id: "sub-banarasi-georgette", name: "Georgette", slug: "georgette", subtypes: ["Khaddi Georgette", "Bandhani on Banarasi Georgette", "Cutwork Georgette"] },
      { id: "sub-banarasi-shattir", name: "Shattir", slug: "shattir", subtypes: ["Contemporary Shattir Weave", "Lightweight Everyday Banarasi", "Modern Graphic Shattir"] },
      { id: "sub-banarasi-brocade", name: "Brocade", slug: "brocade", subtypes: ["Raktambari Brocade", "Tanchoi Silk Weave", "Jamdani Banarasi", "Tissue Brocade Gold/Silver"] },
    ],
  },
  {
    id: "cat-kanjivaram-default",
    name: "Kanjivaram Sarees",
    slug: "kanjivaram",
    prefix: "KJ",
    displayOrder: 5,
    description: "The Queen of Silks from Kanchipuram, renowned for weighty pure mulberry silk, Korvai contrast borders, and timeless temple motifs.",
    coverImage: "/images/hero-kanjivaram-1.png",
    bannerImage: "/images/hero-kanjivaram-banner.png",
    subcategories: [
      { id: "sub-kanjivaram-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Heavy 3-Ply Pure Mulberry Silk", "Gold Dipped Zari Pattu", "Vaira Oosi (Diamond Needle)"] },
      { id: "sub-kanjivaram-korvai", name: "Korvai", slug: "korvai", subtypes: ["Traditional Contrast Korvai Weave", "Double Side Korvai Border", "Multi-Shuttle Interlocking"] },
      { id: "sub-kanjivaram-bridal", name: "Bridal", slug: "bridal", subtypes: ["Muhurtham Red/Maroon Pattu", "Heavy Gold Tissue Bridal", "Koorai Nadu Bridal Silk"] },
      { id: "sub-kanjivaram-temple-border", name: "Temple Border", slug: "temple-border", subtypes: ["Kumbha Gopuram Border", "Thazhampoo (Kewra Flower) Border", "Traditional Pyramidal Motifs"] },
      { id: "sub-kanjivaram-checks", name: "Checks", slug: "checks", subtypes: ["Palum Pazhamum Check", "Koorai Checks with Zari Buta", "Muthu Kattam (Pearl Checks)"] },
    ],
  },
  {
    id: "cat-chanderi-default",
    name: "Chanderi Sarees",
    slug: "chanderi",
    prefix: "CH",
    displayOrder: 6,
    description: "Ethereal gossamer weaves from Madhya Pradesh, blending fine silk and cotton with shimmering gold zari butis and airy drape.",
    coverImage: "/images/hero-chanderi-1.png",
    bannerImage: "/images/hero-chanderi-banner.png",
    subcategories: [
      { id: "sub-chanderi-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Pure Handloom Chanderi Silk", "Eknaliya Silk Weave", "Danalakshmi Pure Silk"] },
      { id: "sub-chanderi-cotton-silk", name: "Cotton Silk", slug: "cotton-silk", subtypes: ["Classic Sico Handloom", "Soft Translucent Summer Drape", "Pastel Festive Blend"] },
      { id: "sub-chanderi-zari-buti", name: "Zari Buti", slug: "zari-buti", subtypes: ["Ashrafi (Gold Coin) Buti", "Paan Buti", "Chatai Border with Floral Butis", "Jangla Chanderi"] },
    ],
  },
  {
    id: "cat-bandhani-default",
    name: "Bandhani Sarees",
    slug: "bandhani",
    prefix: "BD",
    displayOrder: 7,
    description: "Intricate artisanal tie-dye textiles from Gujarat and Rajasthan, famous for sacred auspicious colours and delicate dotted patterns.",
    coverImage: "/images/hero-bandhani-1.png",
    bannerImage: "/images/hero-bandhani-banner.png",
    subcategories: [
      { id: "sub-bandhani-gujarati", name: "Gujarati Bandhani", slug: "gujarati-bandhani", subtypes: ["Jamnagar Authentic Tie-Dye", "Gharchola Traditional Grid", "Panetar Wedding Drape"] },
      { id: "sub-bandhani-rajasthani", name: "Rajasthani Bandhani", slug: "rajasthani-bandhani", subtypes: ["Jaipur Ekdali Weave", "Shikari Pattern Bandhej", "Mothra Criss-Cross"] },
      { id: "sub-bandhani-gaji-silk", name: "Gaji Silk", slug: "gaji-silk", subtypes: ["Heavy Glazed Gaji Silk Bandhani", "Zari Border Gaji Silk", "Bandhej with Lagdi Patta"] },
      { id: "sub-bandhani-leheriya", name: "Leheriya", slug: "leheriya", subtypes: ["Pachranga Leheriya (5 Colours)", "Samandar Leher Leheriya", "Gandadar Ripple Pattern"] },
    ],
  },
  {
    id: "cat-mysore-silk-default",
    name: "Mysore Silk Sarees",
    slug: "mysore-silk",
    prefix: "MS",
    displayOrder: 8,
    description: "Silky smoothness and pure gold zari borders crafted under royal Karnataka tradition, offering lightweight regal comfort.",
    coverImage: "/images/hero-mysore-1.png",
    bannerImage: "/images/hero-mysore-banner.png",
    subcategories: [
      { id: "sub-mysore-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["KSIC Certified Pure Silk", "100% Mulberry Handloom", "Plain Classic Silk Body"] },
      { id: "sub-mysore-crepe-silk", name: "Crepe Silk", slug: "crepe-silk", subtypes: ["Heavy Mysore Crepe De Chine", "Soft Fall Georgette Crepe", "Embossed Crepe Silk"] },
      { id: "sub-mysore-zari-border", name: "Zari Border", slug: "zari-border", subtypes: ["Single Line Gold Zari (Kasuti)", "Rich Broad Zari Border", "Contrast Ganga-Jamuna Border"] },
    ],
  },
  {
    id: "cat-ikat-default",
    name: "Ikat Sarees",
    slug: "ikat",
    prefix: "IK",
    displayOrder: 9,
    description: "Precision resist-dyeing mastery spanning Pochampally, Patola, and Sambalpuri geometries woven into mesmerising artisan fabrics.",
    coverImage: "/images/hero-ikat-1.png",
    bannerImage: "/images/hero-ikat-banner.png",
    subcategories: [
      { id: "sub-ikat-pochampally", name: "Pochampally", slug: "pochampally", subtypes: ["Pochampally Pure Silk Ikat", "Pochampally Sico Handloom", "Geometric Diamond Chevron"] },
      { id: "sub-ikat-patola", name: "Patola", slug: "patola", subtypes: ["Rajkot Patola Silk", "Patan Double Patola", "Nari Kunjar (Elephant-Parrot)"] },
      { id: "sub-ikat-sambalpuri", name: "Sambalpuri", slug: "sambalpuri", subtypes: ["Sambalpuri Silk Bandha", "Pasapalli Chessboard Weave", "Bomkai Motif Handloom"] },
      { id: "sub-ikat-double-ikat", name: "Double Ikat", slug: "double-ikat", subtypes: ["Warp & Weft Synchronized Dye", "Heritage Collector's Double Ikat", "Bespoke Masterpiece"] },
    ],
  },
  {
    id: "cat-cotton-default",
    name: "Cotton Sarees",
    slug: "cotton",
    prefix: "CT",
    displayOrder: 10,
    description: "Breathable, graceful handloom cottons from India's greatest weaving clusters — Bengal Tant, Khadi, Jamdani, Chettinad, and Kota.",
    coverImage: "/images/hero-cotton-1.png",
    bannerImage: "/images/hero-cotton-banner.png",
    subcategories: [
      { id: "sub-cotton-bengal-cotton", name: "Bengal Cotton", slug: "bengal-cotton", subtypes: ["Dhaniakhali Handloom", "Phulia Bengal Fine Cotton", "Begampur Weave"] },
      { id: "sub-cotton-tant", name: "Tant", slug: "tant", subtypes: ["Traditional Crisp Bengal Tant", "Kolkata Printed Tant", "Zari Border Tant"] },
      { id: "sub-cotton-khadi", name: "Khadi", slug: "khadi", subtypes: ["Pure Handspun Khadi", "Khadi Silk Blend", "Natural Dye Organic Khadi"] },
      { id: "sub-cotton-jamdani", name: "Jamdani", slug: "jamdani", subtypes: ["Dhakai Cotton Jamdani", "Floral Muslin Jamdani", "Geometric Fine Handloom Jamdani"] },
      { id: "sub-cotton-kota", name: "Kota", slug: "kota", subtypes: ["Kota Doria Checkered Weave", "Zari Border Kota", "Printed Summer Kota Doria"] },
      { id: "sub-cotton-mangalagiri", name: "Mangalagiri", slug: "mangalagiri", subtypes: ["Nizam Border Mangalagiri", "Plain Body Contrast Zari", "Handloom Pattu Border"] },
      { id: "sub-cotton-chettinad", name: "Chettinad", slug: "chettinad", subtypes: ["Kandangi Bold Check Cotton", "Thalapu Border Chettinad", "Earthy Contrast Weave"] },
      { id: "sub-cotton-chanderi", name: "Chanderi", slug: "chanderi", subtypes: ["Handloom Cotton Chanderi", "Tissue Chanderi Cotton", "Zari Buti Pure Cotton"] },
      { id: "sub-cotton-handloom-cotton", name: "Handloom Cotton", slug: "handloom-cotton", subtypes: ["Mulmul Soft Daily Wear", "Kalamkari Printed Cotton", "Ilkal Cotton Saree"] },
    ],
  },
  {
    id: "cat-silk-default",
    name: "Silk Sarees",
    slug: "silk",
    prefix: "SK",
    displayOrder: 11,
    description: "Exquisite pure silks from across the subcontinent: golden Assam Muga, wild Tussar, Katan, Mulberry, Raw Silk, and featherlight Organza.",
    coverImage: "/images/hero-silk-1.png",
    bannerImage: "/images/hero-silk-banner.png",
    subcategories: [
      { id: "sub-silk-pure-silk", name: "Pure Silk", slug: "pure-silk", subtypes: ["Pure Mulberry Silk", "Double Warp Handloom Silk", "Government Silk Mark Certified"] },
      { id: "sub-silk-katan", name: "Katan", slug: "katan", subtypes: ["Pure Katan Warp & Weft", "Embossed Katan Silk", "Heavy Festive Katan"] },
      { id: "sub-silk-tussar", name: "Tussar", slug: "tussar", subtypes: ["Bhagalpuri Tussar", "Kantha Stitch Tussar", "Tribal Hand-Painted Tussar"] },
      { id: "sub-silk-muga", name: "Muga", slug: "muga", subtypes: ["Assam Golden Muga Silk", "Heritage Handwoven Muga", "Muga Silk with Meenakari"] },
      { id: "sub-silk-eri", name: "Eri", slug: "eri", subtypes: ["Peace / Ahimsa Eri Silk", "Natural Soft Eri Drape", "Vegetable Dyed Eri"] },
      { id: "sub-silk-mulberry", name: "Mulberry", slug: "mulberry", subtypes: ["Bengal Mulberry Silk", "Murshidabad Silk", "Fine Filature Silk"] },
      { id: "sub-silk-art-silk", name: "Art Silk", slug: "art-silk", subtypes: ["Poly-Silk Festive", "Modal Silk Blend", "Affordable Glaze Silk"] },
      { id: "sub-silk-soft-silk", name: "Soft Silk", slug: "soft-silk", subtypes: ["Lightweight South Soft Silk", "Pastel Soft Silk", "Minimal Zari Soft Silk"] },
      { id: "sub-silk-raw-silk", name: "Raw Silk", slug: "raw-silk", subtypes: ["Textured Slub Raw Silk", "Matte Finished Raw Silk", "Zardozi Border Raw Silk"] },
      { id: "sub-silk-matka", name: "Matka", slug: "matka", subtypes: ["Handspun Matka Silk", "Linen Matka Fusion", "Applique Work Matka"] },
      { id: "sub-silk-ghicha", name: "Ghicha", slug: "ghicha", subtypes: ["Wild Ghicha Textured Silk", "Contrast Border Ghicha", "Block Printed Ghicha"] },
      { id: "sub-silk-tissue", name: "Tissue", slug: "tissue", subtypes: ["Gold Zari Metallic Tissue", "Silver Moon Tissue", "Rose Gold Shimmer Tissue"] },
      { id: "sub-silk-crepe", name: "Crepe", slug: "crepe", subtypes: ["Pure Silk Crepe", "Printed Satin Crepe", "French Crepe Silk"] },
      { id: "sub-silk-organza-silk", name: "Organza Silk", slug: "organza-silk", subtypes: ["Pure Organza Silk", "Embroidered Organza Silk", "Hand-Painted Floral Organza"] },
    ],
  },
  {
    id: "cat-other-traditional-default",
    name: "Other Traditional Sarees",
    slug: "other-traditional",
    prefix: "TR",
    displayOrder: 12,
    description: "Timeless regional artisanal weaves celebrating India's rich handloom diversity — Narayan Peth, Nauvari, Himroo, Solapuri, Maheshwari, Uppada, and Kerala Kasavu.",
    coverImage: "/images/hero-traditional-1.png",
    bannerImage: "/images/hero-traditional-banner.png",
    subcategories: [
      { id: "sub-traditional-narayan-peth", name: "Narayan Peth", slug: "narayan-peth", subtypes: ["Sholapur Narayan Peth", "Contrast Rudraksha Border", "Pure Silk Handloom Narayan Peth"] },
      { id: "sub-traditional-nauvari", name: "Nauvari", slug: "nauvari", subtypes: ["9-Yard Kashta Paithani", "Brahmani Nauvari", "Maratha Style 9-Yard Handloom"] },
      { id: "sub-traditional-himroo", name: "Himroo", slug: "himroo", subtypes: ["Aurangabad Himroo Weave", "Persian Floral Brocade Himroo", "Silk-Cotton Royal Shawl/Saree"] },
      { id: "sub-traditional-solapur", name: "Solapur", slug: "solapur", subtypes: ["Solapuri Jacquard Handloom", "Chanderi Weft Solapur", "Solapuri Cotton Saree"] },
      { id: "sub-traditional-maheshwari", name: "Maheshwari", slug: "maheshwari", subtypes: ["Narmada Ghat Border", "Reversible Zari Border Maheshwari", "Pure Silk-Cotton Maheshwari"] },
      { id: "sub-traditional-uppada", name: "Uppada", slug: "uppada", subtypes: ["Uppada Jamdani Pure Silk", "Lightweight Translucent Uppada", "Gold Zari Floral Uppada"] },
      { id: "sub-traditional-dharmavaram", name: "Dharmavaram", slug: "dharmavaram", subtypes: ["Broad Double Border Dharmavaram", "Gold Brocade South Silk", "Bridal Dharmavaram Pattu"] },
      { id: "sub-traditional-sambalpuri", name: "Sambalpuri", slug: "sambalpuri", subtypes: ["Odisha Handloom Bandha", "Shankha & Chakra Motif", "Pasapalli Traditional Weave"] },
      { id: "sub-traditional-bomkai", name: "Bomkai", slug: "bomkai", subtypes: ["Bomkai Silk Sonepuri", "Bomkai Cotton Handloom", "Intricate Tribal Pallu Bomkai"] },
      { id: "sub-traditional-baluchari", name: "Baluchari", slug: "baluchari", subtypes: ["Mythological Scene Weave", "Swarnachari (Gold Zari)", "Bishnupur Pure Silk Baluchari"] },
      { id: "sub-traditional-tant", name: "Tant", slug: "tant", subtypes: ["Fulia Heritage Tant", "Tangail Bengal Handloom", "Fine Cotton Tant"] },
      { id: "sub-traditional-patola", name: "Patola", slug: "patola", subtypes: ["Rajkot Single Ikat Patola", "Silk Patola Geometric", "Heritage Elephant Motif Patola"] },
      { id: "sub-traditional-ajrakh", name: "Ajrakh", slug: "ajrakh", subtypes: ["Kutch Ajrakh Block Print on Modal", "Natural Indigo Ajrakh", "Ajrakh on Tussar Silk"] },
      { id: "sub-traditional-kota-doria", name: "Kota Doria", slug: "kota-doria", subtypes: ["Pure Handloom Khat Weave", "Zari Border Kota Handloom", "Hand Block Printed Kota"] },
      { id: "sub-traditional-kerala-kasavu", name: "Kerala Kasavu", slug: "kerala-kasavu", subtypes: ["Balaramapuram Pure Kasavu", "Mundum Neriyathum Saree", "Golden Zari Temple Kasavu"] },
    ],
  },
];

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas!");
    const db = client.db("VASTRAA");
    const col = db.collection("product_categories");

    for (const cat of CATEGORIES_DATA) {
      console.log(`Processing Main Category: ${cat.name} (${cat.slug})...`);
      const existing = await col.findOne({
        $or: [{ id: cat.id }, { slug: cat.slug }]
      });

      const mainDoc = {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        type: "main",
        createdBy: "system",
        status: "approved",
        parentId: null,
        active: true,
        displayOrder: cat.displayOrder,
        description: cat.description,
        coverImage: existing?.coverImage || cat.coverImage,
        bannerImage: existing?.bannerImage || cat.bannerImage,
        subcategoriesCount: cat.subcategories.length,
        subtypesCount: cat.subcategories.reduce((acc, s) => acc + s.subtypes.length, 0),
        updatedAt: new Date(),
      };

      if (existing) {
        await col.updateOne({ _id: existing._id }, { $set: mainDoc });
        console.log(`  -> Updated existing category record.`);
      } else {
        await col.insertOne({ ...mainDoc, createdAt: new Date() });
        console.log(`  -> Inserted new category record.`);
      }

      // Process subcategories
      for (let i = 0; i < cat.subcategories.length; i++) {
        const sub = cat.subcategories[i];
        const subSlug = `${cat.slug}-${sub.slug}`;
        const existingSub = await col.findOne({
          $or: [{ id: sub.id }, { slug: subSlug }, { $and: [{ parentId: cat.id }, { slug: sub.slug }] }]
        });

        const subDoc = {
          id: sub.id,
          name: sub.name,
          slug: subSlug,
          type: "subcategory",
          createdBy: "system",
          status: "approved",
          parentId: cat.id,
          active: true,
          displayOrder: i + 1,
          description: `${sub.name} under ${cat.name}`,
          subtypes: sub.subtypes,
          subtypesCount: sub.subtypes.length,
          updatedAt: new Date(),
        };

        if (existingSub) {
          await col.updateOne({ _id: existingSub._id }, { $set: subDoc });
        } else {
          await col.insertOne({ ...subDoc, createdAt: new Date() });
        }
      }
    }

    console.log("Category seeding complete!");
    const count = await col.countDocuments();
    console.log(`Total categories in collection: ${count}`);
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.close();
  }
}

run();
