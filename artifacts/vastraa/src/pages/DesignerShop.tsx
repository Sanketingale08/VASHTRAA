import React from "react";
import { ProductsListing } from "./ProductsListing";

export default function DesignerShop() {
  return (
    <ProductsListing
      category="designer"
      title="Designer Sarees"
      subtitle="Haute Couture & Contemporary Elegance"
      description="Modern silhouettes, Bollywood glamour, and artisan embellishments curated for celebrations, galas, and festive moments."
      hideHero={true}
    />
  );
}



