export interface Product {
  id: string;
  name: string;
  vendor: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  image: string;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
}

export const mockProducts: Product[] = [
  {
    id: "p1",
    name: "Royal Peacock Paithani Saree",
    vendor: "Yeola Weavers",
    price: 18500,
    rating: 4.9,
    reviews: 124,
    image: "/images/product-1.png",
    isBestSeller: true,
  },
  {
    id: "p2",
    name: "Midnight Blue Sequined Designer Saree",
    vendor: "Glam Drape",
    price: 22000,
    originalPrice: 25000,
    rating: 4.8,
    reviews: 89,
    image: "/images/product-2.png",
  },
  {
    id: "p3",
    name: "Magenta Kanjivaram Fusion Saree",
    vendor: "Silk Heritage",
    price: 15499,
    rating: 4.7,
    reviews: 210,
    image: "/images/product-3.png",
    isNewArrival: true,
  },
  {
    id: "p4",
    name: "Emerald Green Banarasi Silk",
    vendor: "Royal Silks",
    price: 19999,
    rating: 4.9,
    reviews: 56,
    image: "/images/product-4.png",
  },
  {
    id: "p5",
    name: "Pastel Pink Embroidered Party Wear",
    vendor: "Drapes Stories",
    price: 12999,
    originalPrice: 16000,
    rating: 4.6,
    reviews: 145,
    image: "/images/product-5.png",
  },
  {
    id: "p6",
    name: "Deep Red Bridal Paithani Saree",
    vendor: "Paithani Tradition",
    price: 24500,
    rating: 5.0,
    reviews: 312,
    image: "/images/product-6.png",
    isBestSeller: true,
  },
  {
    id: "p7",
    name: "Cream Floral Designer Saree",
    vendor: "Glam Drape",
    price: 14500,
    rating: 4.5,
    reviews: 67,
    image: "/images/product-7.png",
    isNewArrival: true,
  },
  {
    id: "p8",
    name: "Classic Yellow Parrot Motif Paithani",
    vendor: "Yeola Weavers",
    price: 16800,
    rating: 4.8,
    reviews: 98,
    image: "/images/product-8.png",
  },
  {
    id: "p9",
    name: "Ruby Handloom Silk Saree",
    vendor: "Silk Heritage",
    price: 17500,
    rating: 4.9,
    reviews: 140,
    image: "/images/product-1.png",
    isBestSeller: true,
  },
  {
    id: "p10",
    name: "Silver Zari Work Designer",
    vendor: "Glam Drape",
    price: 28000,
    originalPrice: 32000,
    rating: 4.9,
    reviews: 215,
    image: "/images/product-2.png",
  },
  {
    id: "p11",
    name: "Golden Glow Tissue Silk",
    vendor: "Royal Silks",
    price: 21000,
    rating: 4.8,
    reviews: 90,
    image: "/images/product-3.png",
  },
  {
    id: "p12",
    name: "Mint Green Tulle Saree",
    vendor: "Drapes Stories",
    price: 16500,
    rating: 4.7,
    reviews: 112,
    image: "/images/product-4.png",
    isNewArrival: true,
  }
];

export const artisanStories = [
  {
    id: "a1",
    name: "Ramesh Weavemaster",
    region: "Yeola, Maharashtra",
    quote: "Every thread carries the legacy of my ancestors. We don't just weave silk; we weave stories.",
    image: "/images/artisan-1.png",
  },
  {
    id: "a2",
    name: "Govind Karigar",
    region: "Paithan, Maharashtra",
    quote: "The gold zari work requires patience. A masterpiece cannot be rushed, much like a beautiful life.",
    image: "/images/artisan-2.png",
  },
  {
    id: "a3",
    name: "Anil Shilpkar",
    region: "Varanasi, UP",
    quote: "Preserving this art is my life's mission. When a bride wears our creation, she wears our dedication.",
    image: "/images/artisan-3.png",
  }
];

export interface Vendor {
  id: string;
  name: string;
  location: string;
  rating: number;
  sareesCount: number;
  avatar: string;
}

export const vendors: Vendor[] = [
  { id: "v1", name: "Yeola Weavers", location: "Yeola, Maharashtra", rating: 4.9, sareesCount: 1240, avatar: "/images/artisan-1.png" },
  { id: "v2", name: "Glam Drape", location: "Mumbai, Maharashtra", rating: 4.8, sareesCount: 850, avatar: "/images/artisan-2.png" },
  { id: "v3", name: "Silk Heritage", location: "Kanchipuram, Tamil Nadu", rating: 4.7, sareesCount: 2100, avatar: "/images/artisan-3.png" },
  { id: "v4", name: "Royal Silks", location: "Varanasi, UP", rating: 4.9, sareesCount: 560, avatar: "/images/artisan-1.png" },
];

export const lookbooks = [
  { id: "l1", name: "Deepika's Reception", image: "/images/hero-designer-1.png" },
  { id: "l2", name: "Alia's Haldi", image: "/images/hero-designer-2.png" },
  { id: "l3", name: "Royal Wedding", image: "/images/hero-paithani-1.png" },
  { id: "l4", name: "Festive Glam", image: "/images/hero-paithani-3.png" },
];
