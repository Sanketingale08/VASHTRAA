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

export const mockProducts: Product[] = [];


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
