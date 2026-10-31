import React from "react";
import { ProductsListing } from "./ProductsListing";

export default function Paithani() {
  return (
    <ProductsListing
      category="paithani"
      topBannerImage="/images/hero-paithani-banner.png"
      hideHero={true}
    />
  );
}

