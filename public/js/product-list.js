/* =========================================================
   product-list.js — All Products Page (Gundam Store)
   + TỒN KHO
   + HẾT HÀNG → DISABLE CLICK
========================================================= */
let allProducts = [];

(function () {
  "use strict";

  const db =
    window.db ||
    (window.firebase && window.firebase.firestore && window.firebase.firestore());

  const $ = (s, root = document) => root.querySelector(s);

  const elList = $("#product-list");
  const elEmpty = $("#emptyState");
  const elPager = $("#pager");
  const elPagerInfo = $("#pagerInfo");
  const btnPrev = $("#prevPage");
  const btnNext = $("#nextPage");

  const elQ = $("#q");
  const elCategory = $("#category-filter");
  const elGrade = $("#grade-filter");
  const elSort = $("#sort");
  const elPriceMax = $("#priceMax");
  const elChips = $("#chips");
  const elClearAll = $("#clearAll");
  const elResultCount = $("#resultCount");

  let ALL = [];
  let filtered = [];

  const PAGE_SIZE = 20;
  let page = 1;

  function escapeHtml(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, c =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])
    );
  }

  function formatVND(n) {
    return Number(n || 0).toLocaleString("vi-VN") + "đ";
  }

  function finalPrice(p) {
    const price = Number(p.price || 0);
    const discount = Number(p.discount || 0);
    return discount > 0 ? Math.round(price * (1 - discount / 100)) : price;
  }

  function goDetail(id) {
    window.location.href = `detail.html?id=${encodeURIComponent(id)}`;
  }

  function render() {
    const total = filtered.length;
    elResultCount.textContent = total ? `${total} sản phẩm` : "0 sản phẩm";

    if (!total) {
      elList.innerHTML = "";
      elEmpty.hidden = false;
      elPager.hidden = true;
      return;
    }

    elEmpty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, totalPages);

    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    elList.innerHTML = pageItems.map(p => {
      const stock = Number(p.stock || 0);
      const out = stock <= 0;

      return `
        <div class="product-card ${out ? "out-of-stock" : ""}"
             data-id="${p.id}"
             ${out ? "" : 'role="button" tabindex="0"'}>
          <div class="product-image-container">
            <img src="${escapeHtml(p.image || "/images/placeholder.png")}"
                 alt="${escapeHtml(p.name)}" loading="lazy" />

            ${p.discount ? `<span class="discount-badge">-${p.discount}%</span>` : ""}

            <span class="stock-badge ${out ? "stock-out" : "stock-ok"}">
              ${out ? "Hết hàng" : `Còn ${stock}`}
            </span>
          </div>

          <div class="product-info">
            <h3 class="product-name">${escapeHtml(p.name)}</h3>
            <div class="product-meta">
              <span class="product-price">${formatVND(finalPrice(p))}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    elList.onclick = e => {
      const card = e.target.closest(".product-card");
      if (!card || card.classList.contains("out-of-stock")) return;
      goDetail(card.dataset.id);
    };

    elPager.hidden = totalPages <= 1;
    btnPrev.disabled = page <= 1;
    btnNext.disabled = page >= totalPages;
    elPagerInfo.textContent = `Trang ${page}/${totalPages}`;
  }

  function apply() {
    const q = elQ.value.trim().toLowerCase();
    const category = elCategory.value;
    const grade = elGrade.value;
    const sort = elSort.value;
    const priceMax = elPriceMax.value ? Number(elPriceMax.value) : null;

    filtered = ALL.filter(p => {
      if (q && !p.name?.toLowerCase().includes(q)) return false;
      if (category !== "all" && p.category1 !== category && p.category2 !== category) return false;
      if (grade && p.grade !== grade) return false;
      if (priceMax && finalPrice(p) > priceMax) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === "hot") return (b.sold || 0) - (a.sold || 0);
      if (sort === "price_asc") return finalPrice(a) - finalPrice(b);
      if (sort === "price_desc") return finalPrice(b) - finalPrice(a);
      return 0;
    });

    render();
  }

  async function loadAll() {
    const snap = await db.collection("products").get();
    ALL = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    apply();
  }

  function bind() {
    elQ.addEventListener("input", () => { page = 1; apply(); });
    elCategory.addEventListener("change", () => { page = 1; apply(); });
    elGrade.addEventListener("change", () => { page = 1; apply(); });
    elSort.addEventListener("change", () => { page = 1; apply(); });
    elPriceMax.addEventListener("change", () => { page = 1; apply(); });

    elClearAll.addEventListener("click", () => {
      elQ.value = "";
      elCategory.value = "all";
      elGrade.value = "";
      elSort.value = "new";
      elPriceMax.value = "";
      page = 1;
      apply();
    });

    btnPrev.onclick = () => { if (page > 1) { page--; render(); } };
    btnNext.onclick = () => { page++; render(); };
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    loadAll();
  });
})();
