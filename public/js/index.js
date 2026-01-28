/* =========================================================
   Gundam Store - index.js (Optimized + FIX Discount Price)
   - Show discounted final price on homepage (NEW/HOT)
   - Show old price + badge -% when discount > 0
   - Reduce Firestore reads: only compute stars for displayed items
   - Cache stars + product cache
   - Banner slider smooth + pause on tab hidden
   - Fix redirect URL: use /detail.html?id=
   - Quick View modal support (#quickModal)
   - Toast helper (window.__toast)
========================================================= */

(function () {
  "use strict";

  // --- Firebase db reference (expects firebase-init.js created window.db or firebase.firestore())
  const db = window.db || (window.firebase && window.firebase.firestore && window.firebase.firestore());
  if (!db) console.error("Firestore db not found. Check firebase-init.js");

  // --- DOM helpers
  const $ = (sel, root = document) => root.querySelector(sel);

  // --- UI refs
  const elBanner = $("#banner-container");
  const elNewList = $("#new-product-list");
  const elHotList = $("#hot-product-list");
  const elNewEmpty = $("#new-empty");
  const elHotEmpty = $("#hot-empty");
  const elNews = $("#news-container");
  const elReview = $("#review-container");

  const elModal = $("#quickModal");
  const elModalBody = $("#quickModalBody");

  // --- State
  const STAR_CACHE = new Map(); // productId -> starsHtml
  const PRODUCT_CACHE = new Map(); // productId -> productData

  let bannerTimer = null;
  let bannerIndex = 0;
  let bannerData = [];

  // --- Boot
  document.addEventListener("DOMContentLoaded", () => {
    Promise.allSettled([loadBanners(), loadProducts(), loadNews(), loadReviews()]).catch(() => {});

    // modal close fallback (overlay + close button uses data-close="1")
    if (elModal) {
      elModal.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute("data-close") === "1") elModal.hidden = true;
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") elModal.hidden = true;
      });
    }

    // pause/resume banner on tab hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopBanner();
      else startBanner();
    });
  });

  /* =========================
     UTILITIES
  ========================= */

  function toast(title, desc) {
    if (typeof window.__toast === "function") window.__toast(title, desc);
  }

  function escapeHtml(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function formatVND(n) {
    const num = Number(n || 0);
    try {
      return num.toLocaleString("vi-VN") + "₫";
    } catch {
      return String(num) + "₫";
    }
  }

  function clampDiscount(d) {
    const x = Number(d || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(99, x));
  }

  function calcFinalPrice(price, discount) {
    const p = Number(price || 0);
    const d = clampDiscount(discount);
    if (!d) return p;
    return Math.round(p * (1 - d / 100));
  }

  function toDateValue(x) {
    if (!x) return 0;
    if (typeof x === "number") return x;
    if (typeof x === "string") {
      const t = Date.parse(x);
      return Number.isFinite(t) ? t : 0;
    }
    if (x instanceof Date) return x.getTime();
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    return 0;
  }

  function renderStars(rating = 0) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const rounded = Math.round(r);
    let html = "";
    for (let i = 1; i <= 5; i++) {
      html += `<i class="fa${i <= rounded ? "s" : "r"} fa-star" style="color:#ffcc00;"></i>`;
    }
    return html;
  }

  /* =========================
     BANNERS
  ========================= */

  function stopBanner() {
    if (bannerTimer) clearInterval(bannerTimer);
    bannerTimer = null;
  }

  function startBanner() {
    if (!elBanner) return;
    if (!bannerData || bannerData.length <= 1) return;
    if (bannerTimer) return;

    bannerTimer = setInterval(() => {
      bannerIndex = (bannerIndex + 1) % bannerData.length;
      renderBannerAt(bannerIndex);
    }, 3500);
  }

  function renderBannerAt(i) {
    const b = bannerData[i];
    if (!b || !b.path) return;
    const alt = escapeHtml(b.key || "Banner");

    // wrapper for fade (CSS: .banner-img)
    elBanner.innerHTML = `
      <img class="banner-img" src="${b.path}" alt="${alt}" loading="eager" decoding="async">
    `;
  }

  async function loadBanners() {
    if (!db || !elBanner) return;

    try {
      const snap = await db.collection("banners").get();
      bannerData = snap.docs.map((d) => d.data()).filter((b) => b && b.path);

      if (!bannerData.length) {
        stopBanner();
        elBanner.innerHTML = `<div class="empty-state__mini">Không có banner nào.</div>`;
        return;
      }

      stopBanner();
      bannerIndex = 0;
      renderBannerAt(bannerIndex);
      startBanner();

    } catch (err) {
      console.error("Lỗi tải banners:", err);
      stopBanner();
      elBanner.innerHTML = `<div class="empty-state__mini">Không thể tải banner.</div>`;
    }
  }

  /* =========================
     PRODUCTS
  ========================= */

  async function loadProducts() {
    if (!db) return;

    try {
      const snap = await db.collection("products").get();
      const products = snap.docs.map((d) => {
        const data = d.data() || {};
        const id = String(d.id);
        const p = { ...data, id };
        PRODUCT_CACHE.set(id, p);
        return p;
      });

      // New: sort by releaseDate desc; if missing releaseDate -> fallback createdAt
      const newProducts = products
        .slice()
        .sort((a, b) => {
          const tb = toDateValue(b.releaseDate) || toDateValue(b.createdAt);
          const ta = toDateValue(a.releaseDate) || toDateValue(a.createdAt);
          return tb - ta;
        })
        .slice(0, 8);

      // Hot: sort by sold desc
      const hotProducts = products
        .slice()
        .sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0))
        .slice(0, 4);

      if (elNewList) {
        if (!newProducts.length) {
          elNewList.innerHTML = "";
          if (elNewEmpty) elNewEmpty.hidden = false;
        } else {
          if (elNewEmpty) elNewEmpty.hidden = true;
          elNewList.innerHTML = await renderProductCards(newProducts, true);
        }
      }

      if (elHotList) {
        if (!hotProducts.length) {
          elHotList.innerHTML = "";
          if (elHotEmpty) elHotEmpty.hidden = false;
        } else {
          if (elHotEmpty) elHotEmpty.hidden = true;
          elHotList.innerHTML = await renderProductCards(hotProducts, false);
        }
      }
    } catch (err) {
      console.error("Lỗi khi load sản phẩm:", err);
      toast("Lỗi", "Không thể tải danh sách sản phẩm.");
    }
  }

  async function loadAverageStars(productId) {
    const id = String(productId || "");
    if (!db || !id) return renderStars(0);

    if (STAR_CACHE.has(id)) return STAR_CACHE.get(id);

    try {
      const snap = await db.collection("products").doc(id).collection("reviews").get();
      const total = snap.docs.reduce((sum, d) => sum + Number(d.data().rating || 0), 0);
      const avg = snap.size ? total / snap.size : 0;
      const html = renderStars(avg);
      STAR_CACHE.set(id, html);
      return html;
    } catch (e) {
      console.warn("Không thể load stars:", e);
      const html = renderStars(0);
      STAR_CACHE.set(id, html);
      return html;
    }
  }

  async function renderProductCards(list, addViewMore) {
    // Only query stars for these items (12 items max on home)
    const cards = await Promise.all(
      list.map(async (p) => {
        const id = String(p.id);
        const name = escapeHtml(p.name || "Sản phẩm");
        const img = escapeHtml(p.image || "/images/placeholder.png");
        const price = Number(p.price || 0);
        const discount = clampDiscount(p.discount);
        const finalPrice = calcFinalPrice(price, discount);

        // ✅ PRICE HTML (FIX: show final price not original)
        const priceHtml = discount > 0
          ? `
            <div class="price-wrap">
              <span class="price-final">${formatVND(finalPrice)}</span>
              <span class="price-old" style="text-decoration:line-through;opacity:.7">${formatVND(price)}</span>
            </div>
          `
          : `
            <div class="price-wrap">
              <span class="price-final">${formatVND(finalPrice)}</span>
            </div>
          `;

        const stars = await loadAverageStars(id);

        // Badges
        const badgeDiscount = discount > 0 ? `<span class="discount-badge">-${discount}%</span>` : "";

        return `
          <div class="product-card" role="button" tabindex="0"
               onclick="safeRedirect('${id}')"
               onkeydown="cardKeyNav(event,'${id}')">
            <div class="product-image-container">
              <img src="${img}" alt="${name}" loading="lazy" decoding="async">
              ${badgeDiscount}
              <button class="quickview-btn" type="button"
                      onclick="openQuickView(event,'${id}')"
                      aria-label="Xem nhanh">
                <i class="fa-regular fa-eye"></i>
              </button>
            </div>

            <div class="product-info">
              <h3 class="product-name" title="${name}">${name}</h3>
              <div class="product-meta">
                <span class="product-price">${priceHtml}</span>
                <span class="product-rating" aria-label="Đánh giá">${stars}</span>
              </div>
            </div>
          </div>
        `;
      })
    );

    const viewMore = addViewMore
      ? `
        <div class="view-more-container">
          <button class="view-more-btn" type="button" onclick="goToCategory('all')">
            Xem thêm <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>`
      : "";

    return cards.join("") + viewMore;
  }

  /* =========================
     REDIRECT + QUICKVIEW
  ========================= */

  // Expose helpers used in inline HTML events
  window.safeRedirect = function (id) {
    try {
      const pid = encodeURIComponent(String(id));
      // ưu tiên redirect.js nếu có
      if (typeof window.redirect === "function") return window.redirect(String(id));
      // ✅ FIX: đúng link detail của bạn
      window.location.href = `/detail.html?id=${pid}`;
    } catch (e) {
      console.warn(e);
    }
  };

  window.cardKeyNav = function (e, id) {
    if (!e) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      window.safeRedirect(id);
    }
  };

  window.openQuickView = async function (ev, productId) {
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();

    if (!elModal || !elModalBody) {
      window.safeRedirect(productId);
      return;
    }

    const id = String(productId || "");
    const p = PRODUCT_CACHE.get(id) || null;

    elModal.hidden = false;

    if (!p) {
      elModalBody.innerHTML = `<div class="empty-state__mini">Không tìm thấy sản phẩm.</div>`;
      return;
    }

    const name = escapeHtml(p.name || "Sản phẩm");
    const img = escapeHtml(p.image || "/images/placeholder.png");
    const price = Number(p.price || 0);
    const discount = clampDiscount(p.discount);
    const finalPrice = calcFinalPrice(price, discount);
    const stars = await loadAverageStars(id);

    const cate = escapeHtml(p.category1 || p.category || "—");
    const grade = escapeHtml(p.grade || "—");

    const priceLine = discount > 0
      ? `
        <div class="quickview__price">
          <span class="qv-final">${formatVND(finalPrice)}</span>
          <span class="qv-old" style="text-decoration:line-through;opacity:.7">${formatVND(price)}</span>
          <span class="qv-off">-${discount}%</span>
        </div>
      `
      : `<div class="quickview__price"><span class="qv-final">${formatVND(finalPrice)}</span></div>`;

    elModalBody.innerHTML = `
      <div class="quickview">
        <div class="quickview__media">
          <img src="${img}" alt="${name}" loading="eager" decoding="async">
        </div>
        <div class="quickview__info">
          <h3 class="quickview__title">${name}</h3>
          <div class="quickview__rating">${stars}</div>
          ${priceLine}

          <div class="quickview__meta">
            <div><span>Danh mục:</span> <b>${cate}</b></div>
            <div><span>Grade:</span> <b>${grade}</b></div>
          </div>

          <div class="quickview__actions">
            <button class="btn btn--primary" type="button" onclick="safeRedirect('${id}')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Xem chi tiết
            </button>
            <button class="btn btn--ghost" type="button" data-close="1">Đóng</button>
          </div>
        </div>
      </div>
    `;
  };

  /* =========================
     REVIEWS
  ========================= */

  async function loadReviews() {
    if (!db || !elReview) return;

    try {
      const productSnaps = await db.collection("products").get();

      const tasks = [];
      productSnaps.forEach((productDoc) => {
        const productId = String(productDoc.id);
        const productData = productDoc.data() || {};
        PRODUCT_CACHE.set(productId, { ...productData, id: productId });

        tasks.push(
          db.collection("products")
            .doc(productId)
            .collection("reviews")
            .get()
            .then((reviewSnap) =>
              reviewSnap.docs.map((doc) => {
                const r = doc.data() || {};
                return {
                  reviewId: doc.id,
                  productId,
                  productImage: productData.image || "/images/placeholder.png",
                  title: r.title || "",
                  content: r.content || "",
                  rating: Number(r.rating || 0),
                  createdAt: toDateValue(r.createdAt),
                };
              })
            )
        );
      });

      const reviewGroups = await Promise.all(tasks);
      const allReviews = reviewGroups.flat().filter(Boolean);

      const sorted = allReviews.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const top4 = sorted.slice(0, 4);

      if (!top4.length) {
        elReview.innerHTML = `<p class="muted-loading">Chưa có đánh giá nào.</p>`;
        return;
      }

      const [first, ...rest] = top4;

      elReview.innerHTML = `
        <div class="review-top" data-product="${first.productId}" role="button" tabindex="0">
          <img src="${escapeHtml(first.productImage)}" alt="product" loading="lazy" decoding="async" />
          <div class="review-info">
            <h3>${escapeHtml(first.title || "Không có tiêu đề")}</h3>
            <p class="meta">
              <span>${formatReviewDate(first.createdAt)}</span>
              <span aria-label="Đánh giá">${renderStars(first.rating)}</span>
            </p>
            <p>${escapeHtml(truncateTextSafe(first.content, 90))}</p>
          </div>
        </div>

        <div class="review-bottom">
          ${rest.map(r => `
            <div class="review-small" data-product="${r.productId}" role="button" tabindex="0">
              <img src="${escapeHtml(r.productImage)}" alt="product" loading="lazy" decoding="async" />
              <div class="review-info">
                <h4>${escapeHtml(r.title || "Không có tiêu đề")}</h4>
                <p class="meta">
                  <span>${formatReviewDate(r.createdAt)}</span>
                  <span aria-label="Đánh giá">${renderStars(r.rating)}</span>
                </p>
                <p>${escapeHtml(truncateTextSafe(r.content, 80))}</p>
              </div>
            </div>
          `).join("")}
        </div>
      `;

      // click delegation
      elReview.onclick = (e) => {
        const card = e.target.closest("[data-product]");
        if (!card) return;
        safeRedirect(card.getAttribute("data-product"));
      };
      elReview.onkeydown = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const card = e.target.closest("[data-product]");
        if (!card) return;
        e.preventDefault();
        safeRedirect(card.getAttribute("data-product"));
      };
    } catch (e) {
      console.error("Lỗi khi tải review:", e);
      elReview.innerHTML = `<p class="muted-loading">Không thể tải đánh giá.</p>`;
    }
  }

  function formatReviewDate(ms) {
    if (!ms) return "Không xác định";
    try {
      return new Date(ms).toLocaleDateString("vi-VN");
    } catch {
      return "Không xác định";
    }
  }

  function truncateTextSafe(text, maxLen) {
    try {
      if (typeof window.truncateText === "function") return window.truncateText(text, maxLen);
    } catch {}
    const s = (text ?? "").toString();
    if (s.length <= maxLen) return s;
    return s.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
  }

  /* =========================
     NEWS
  ========================= */

  async function loadNews() {
    if (!db || !elNews) return;

    try {
      const newsSnap = await db.collection("news").orderBy("date", "desc").get();

      if (newsSnap.empty) {
        elNews.innerHTML = `<p class="muted-loading">Chưa có tin tức nào.</p>`;
        return;
      }

      const allNews = newsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      const top4 = allNews.slice(0, 4);
      const [first, ...rest] = top4;

      elNews.innerHTML = `
        <div class="news-top" data-news="${first.id}" role="button" tabindex="0">
          <img src="${escapeHtml(first.image || "/images/placeholder.png")}" alt="news" loading="lazy" decoding="async" />
          <div class="news-info">
            <h3>${escapeHtml(first.title || "Không có tiêu đề")}</h3>
            <p class="meta"><span>${formatNewsDate(first.date)}</span></p>
            <p>${escapeHtml(truncateTextSafe(first.content, 90))}</p>
          </div>
        </div>

        <div class="news-bottom">
          ${rest.map(n => `
            <div class="news-small" data-news="${n.id}" role="button" tabindex="0">
              <img src="${escapeHtml(n.image || "/images/placeholder.png")}" alt="news" loading="lazy" decoding="async" />
              <div class="news-info">
                <h4>${escapeHtml(n.title || "Không có tiêu đề")}</h4>
                <p class="meta"><span>${formatNewsDate(n.date)}</span></p>
                <p>${escapeHtml(truncateTextSafe(n.content, 80))}</p>
              </div>
            </div>
          `).join("")}
        </div>
      `;

      elNews.onclick = (e) => {
        const card = e.target.closest("[data-news]");
        if (!card) return;
        openNews(card.getAttribute("data-news"));
      };
      elNews.onkeydown = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const card = e.target.closest("[data-news]");
        if (!card) return;
        e.preventDefault();
        openNews(card.getAttribute("data-news"));
      };
    } catch (e) {
      console.error("Lỗi khi tải tin tức:", e);
      elNews.innerHTML = `<p class="muted-loading">Không thể tải tin tức.</p>`;
    }
  }

  function formatNewsDate(dateVal) {
    const ms = toDateValue(dateVal);
    if (!ms) return "Không xác định";
    try {
      return new Date(ms).toLocaleDateString("vi-VN");
    } catch {
      return "Không xác định";
    }
  }

  window.openNews = function (newsId) {
    if (!newsId) return;
    window.location.href = `news-detail.html?id=${encodeURIComponent(String(newsId))}`;
  };

})();
