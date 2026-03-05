document.addEventListener("DOMContentLoaded", async () => {
  const db = firebase.firestore();

  // ===============================
  // 1️⃣ LẤY SLUG / ID TỪ URL
  // ===============================
  function getProductKeyFromURL() {
    // URL đẹp: /product/slug-san-pham
    const parts = window.location.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("product");
    if (i !== -1 && parts[i + 1]) return decodeURIComponent(parts[i + 1]);

    // URL cũ: detail.html?id=...
    const sp = new URLSearchParams(window.location.search);
    return sp.get("slug") || sp.get("id") || "";
  }

  // ===============================
  // 2️⃣ LOAD SẢN PHẨM (SLUG ƯU TIÊN, ID DỰ PHÒNG)
  // ===============================
  async function loadProductByKey(key) {
    // thử coi key là slug
    const q = await db.collection("products")
      .where("slug", "==", key)
      .limit(1)
      .get();

    if (!q.empty) {
      return { id: q.docs[0].id, ...q.docs[0].data() };
    }

    // fallback: coi key là docId
    const d = await db.collection("products").doc(key).get();
    if (d.exists) {
      return { id: d.id, ...d.data() };
    }

    return null;
  }

  // ===============================
  // 3️⃣ SEO BASIC
  // ===============================
  function setSEOForProduct(p) {
    document.title = `${p.name} | Gundam Store`;

    const desc = (p.description || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);

    let md = document.querySelector('meta[name="description"]');
    if (!md) {
      md = document.createElement("meta");
      md.name = "description";
      document.head.appendChild(md);
    }
    md.content = desc;

    let c = document.querySelectordocument.querySelector("#add-to-cart").onclick = () => {
  addToCart(product);
};
    if (!c) {
      c = document.createElement("link");
      c.rel = "canonical";
      document.head.appendChild(c);
    }
    c.href = `${window.location.origin}/product/${encodeURIComponent(p.slug || p.id)}`;
  }

  // ===============================
  // 4️⃣ RENDER TỐI THIỂU (TEST)
  // ===============================
  function renderProduct(p) {
    // Tạm thời chỉ để TEST
    console.log("PRODUCT:", p);

    const title = document.querySelector("h1");
    if (title) title.textContent = p.name;
  }

  // ===============================
  // 🚀 CHẠY
  // ===============================
  const key = getProductKeyFromURL();
  if (!key) {
    alert("Thiếu mã sản phẩm!");
    return;
  }

  const product = await loadProductByKey(key);
  if (!product) {
    alert("Không tìm thấy sản phẩm!");
    return;
  }

  setSEOForProduct(product);
  renderProduct(product);
});
