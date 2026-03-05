document.addEventListener("DOMContentLoaded", () => {
  // 1) loginStatus mặc định
  if (!localStorage.getItem("loginStatus")) {
    localStorage.setItem("loginStatus", "logged_out");
  }

  // 2) Render topbar (Cập nhật cấu trúc HTML để hỗ trợ Dropdown)
  const topbarHTML = `
    <div class="topbar" style="position: relative;">
      <div class="logo">
        <a href="index.html">
          <img src="/images/news/news.jpg" alt="Logo" />SHOP MÔ HÌNH
        </a>
      </div>

      <div class="search-bar" style="position: relative;">
        <input type="text" id="search-input" placeholder="Bạn đang tìm gì..." autocomplete="off" />
        <button id="search-btn" type="button" aria-label="Tìm kiếm"><i class="fas fa-search"></i></button>
        <ul id="search-suggestions"></ul>
      </div>

      <div class="topbar-right" style="display:flex; align-items:center; gap:2vw;">
        <a href="cart.html" style="font-size: 1.2vw; display:flex; align-items:center; gap:0.5vw; text-decoration:none; color:inherit;">
          <i class="fas fa-shopping-cart"></i> Giỏ hàng
        </a>

        <div id="user-info" style="position: relative;">
          <a href="login.html" style="text-decoration:none; color:inherit;">Đăng nhập</a> /
          <a href="register.html" style="text-decoration:none; color:inherit;">Đăng ký</a>
        </div>
      </div>
    </div>
  `;

  const placeholder = document.getElementById("topbar-container");
  if (!placeholder) return;
  placeholder.innerHTML = topbarHTML;

  // 3) Hiển thị avatar & Bubble Menu nếu đã login
  const userInfoSpan = document.getElementById("user-info");
  const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || "null");

  if (loggedInUser && localStorage.getItem("loginStatus") === "logged_in") {
    const firstLetter = (loggedInUser.username || "U").charAt(0).toUpperCase();

    // Render Avatar và Bubble Menu
    userInfoSpan.innerHTML = `
      <div class="user-menu-wrapper" id="userMenuTrigger" style="cursor:pointer; display:flex; align-items:center;">
        <div class="topbar-avatar">${firstLetter}</div>
        
        <div class="user-dropdown-bubble" id="topbarBubble">
          <div class="bubble-header">
            <strong>${loggedInUser.username}</strong>
            <small>ID: ${String(loggedInUser.userId).substring(0, 8)}</small>
          </div>
          <div class="bubble-divider"></div>
          <a href="profile.html"><i class="fa-solid fa-circle-user"></i> Thông tin tài khoản</a>
          <a href="track-order.html"><i class="fa-solid fa-box-open"></i> Đơn hàng của tôi</a>
          <a href="profile.html"><i class="fa-solid fa-shield-halved"></i> Bảo mật</a>
          <div class="bubble-divider"></div>
          <a href="javascript:void(0)" id="topbarLogout" style="color:#ef4444;">
            <i class="fa-solid fa-right-from-bracket"></i> Đăng xuất
          </a>
        </div>
      </div>
    `;

    // Logic đóng/mở Bubble
    const trigger = document.getElementById("userMenuTrigger");
    const bubble = document.getElementById("topbarBubble");

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      bubble.classList.toggle("active");
    });

    // Logout logic
    document.getElementById("topbarLogout").addEventListener("click", () => {
      if (confirm("Bạn có chắc muốn đăng xuất?")) {
        localStorage.removeItem("loggedInUser");
        localStorage.setItem("loginStatus", "logged_out");
        window.location.href = "index.html";
      }
    });
  }

  // Đóng dropdown khi click ra ngoài
  document.addEventListener("click", () => {
    const bubble = document.getElementById("topbarBubble");
    if (bubble) bubble.classList.remove("active");
  });
  // ================= SEARCH =================
  const searchInput = document.getElementById("search-input");
  const suggestionsBox = document.getElementById("search-suggestions");
  const searchBtn = document.getElementById("search-btn");
  if (!searchInput || !suggestionsBox) return;

  // Helper: escape HTML
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }

  // Điều hướng
  function goToProduct(id) {
    if (!id) return;
    if (typeof window.redirect === "function") {
      window.redirect(id);
    } else {
      window.location.href = `detail.html?id=${encodeURIComponent(id)}`;
    }
  }

  // ✅ Quan trọng: Lazy-load products (đỡ phụ thuộc firebase-init load sớm hay muộn)
  let preprocessed = [];
  let isLoadingProducts = false;
  let loadedOnce = false;

  async function waitForDb(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.db) return window.db;

      if (window.firebase && firebase.apps && firebase.apps.length) {
        try {
          const _db = firebase.firestore();
          window.db = _db;
          return _db;
        } catch { }
      }
      await new Promise(r => setTimeout(r, 120));
    }
    return null;
  }

  function pickName(p) {
    // fallback field name cho chắc
    return p.name || p.title || p.productName || p.ten || "";
  }

  function pickImage(p) {
    return p.image || p.img || p.thumbnail || p.cover || "/images/default.png";
  }

  function pickPrice(p) {
    const n = Number(p.price ?? p.gia ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  async function loadProductsIfNeeded() {
    if (loadedOnce || isLoadingProducts) return;
    isLoadingProducts = true;

    // ✅ Cache nhẹ để lần sau mở trang nhanh (sessionStorage)
    try {
      const cached = sessionStorage.getItem("products_cache_v1");
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length) {
          preprocessed = arr.map(p => ({
            ...p,
            __name: (pickName(p) || "").toLowerCase()
          }));
          loadedOnce = true;
          isLoadingProducts = false;
          return;
        }
      }
    } catch { }

    const db = await waitForDb();
    if (!db) {
      console.warn("Search: chưa init được Firestore (firebase-init lỗi hoặc chưa load).");
      isLoadingProducts = false;
      return;
    }

    try {
      const snapshot = await db.collection("products").get();
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      preprocessed = products.map(p => ({
        ...p,
        __name: (pickName(p) || "").toLowerCase()
      }));

      loadedOnce = true;

      // cache
      try {
        sessionStorage.setItem("products_cache_v1", JSON.stringify(products));
      } catch { }
    } catch (err) {
      // ❗ Nếu rules chặn đọc, bạn sẽ rơi vào đây
      console.error("Search: Không thể lấy dữ liệu products:", err);
    } finally {
      isLoadingProducts = false;
    }
  }

  function hideSuggest() {
    suggestionsBox.style.display = "none";
    suggestionsBox.innerHTML = "";
  }

  function renderSuggest(list) {
    suggestionsBox.innerHTML = "";
    if (!list.length) return hideSuggest();

    const frag = document.createDocumentFragment();
    list.slice(0, 6).forEach(p => {
      const li = document.createElement("li");
      li.style.cssText = `
        display:flex; align-items:center; gap:10px;
        padding:10px; cursor:pointer; border-bottom:1px solid #eee;
        color:#111; background:#fff;
      `;

      const name = pickName(p) || "Sản phẩm";
      const price = pickPrice(p);
      const img = pickImage(p);

      li.innerHTML = `
        <img src="${escapeHtml(img)}" alt="${escapeHtml(name)}"
          onerror="this.src='/images/default.png'"
          style="width:64px; height:44px; object-fit:cover; border-radius:10px; border:1px solid #e5e7eb;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-size:14px; font-weight:800;">${escapeHtml(name)}</span>
          <span style="font-size:12px; color:#6b7280;">
            ${price.toLocaleString("vi-VN")}₫
          </span>
        </div>
      `;

      li.addEventListener("click", () => goToProduct(p.id));
      li.addEventListener("mouseenter", () => li.style.background = "#f6f7fb");
      li.addEventListener("mouseleave", () => li.style.background = "#fff");
      frag.appendChild(li);
    });

    suggestionsBox.appendChild(frag);
    suggestionsBox.style.display = "block";
  }

  let debounceTimer;

  async function doSearch() {
    const q = (searchInput.value || "").trim().toLowerCase();

    if (!q) return hideSuggest();

    // ✅ đảm bảo có data trước khi lọc
    await loadProductsIfNeeded();

    if (!preprocessed.length) {
      // Không có data (có thể do rules hoặc collection rỗng)
      hideSuggest();
      return;
    }

    const matched = preprocessed.filter(p => (p.__name || "").includes(q));
    renderSuggest(matched);
  }

  // Focus lần đầu sẽ tự load products
  searchInput.addEventListener("focus", () => {
    loadProductsIfNeeded();
    if ((searchInput.value || "").trim()) doSearch();
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 120);
  });

  // Enter: đi sản phẩm đầu
  searchInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await loadProductsIfNeeded();
      const q = (searchInput.value || "").trim().toLowerCase();
      const first = preprocessed.find(p => (p.__name || "").includes(q));
      if (first) goToProduct(first.id);
      hideSuggest();
    }
  });

  // Click nút search: như Enter
  if (searchBtn) {
    searchBtn.addEventListener("click", async () => {
      await loadProductsIfNeeded();
      const q = (searchInput.value || "").trim().toLowerCase();
      const first = preprocessed.find(p => (p.__name || "").includes(q));
      if (first) goToProduct(first.id);
      hideSuggest();
    });
  }

  // click ra ngoài -> ẩn
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-bar")) hideSuggest();
  });
});
