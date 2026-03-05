const fs = require("fs");

const products = JSON.parse(fs.readFileSync("./public/mock/product.json", "utf8"));

function baseNoExt(p) {
  return (p || "").replace(/\.(png|jpg|jpeg|webp)$/i, "");
}

const out = products.map(p => {
  const base = baseNoExt(p.image);
  return {
    ...p,
    images: p.images && p.images.length ? p.images : [
      `${base} (1).jpg`,
      `${base} (2).jpg`,
      `${base} (3).jpg`,
    ]
  };
});

fs.writeFileSync("./public/mock/product.json", JSON.stringify(out, null, 2), "utf8");
console.log("✅ Done: added images[] for all products");
