/* ==========================
   admin-functions.js (FULL) — FIXED + STABLE
   - Products / Orders / Accounts / Tools
   - ✅ Added Stock column (Tồn kho) in product list + editable
   - ✅ Accounts save: chặn field undefined
   - ✅ Orders status: canonical lowercase + normalize legacy UPPERCASE
   - Orders update status via SERVER API
========================== */

(() => {
  // ===== CONFIG =====
  const API_BASE = "http://localhost:3000";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ===== STATE =====
  let editingRow = null;
  let originalRowData = null;
  let editingDocId = null;

  let allProductsData = [];
  let _productsBound = false;

  // ===== DOM =====
  const productTbody = $("#productTable tbody");
  const accountTbody = $("#accountTable tbody");
  const statusEl = $("#status");
  const toolsStatusEl = $("#toolsStatus");
  const editControls = $("#edit-controls");

  // ===== UTIL =====
  function escapeHtml(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));
  }

  function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("ok", "err");
    statusEl.classList.add(ok ? "ok" : "err");
  }

  function setToolsStatus(msg, ok = true) {
    if (!toolsStatusEl) return;
    toolsStatusEl.textContent = msg || "";
    toolsStatusEl.classList.remove("ok", "err");
    toolsStatusEl.classList.add(ok ? "ok" : "err");
  }

  function vnd(n) {
    try {
      return Number(n || 0).toLocaleString("vi-VN") + "đ";
    } catch {
      return (n || 0) + "đ";
    }
  }

  function fmtDate(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("vi-VN");
  }

  function fmtTime(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN");
  }

  async function ensureDb() {
    // firebase-init.js nên set window.db = firebase.firestore()
    if (window.db) return window.db;
    if (window.firebase && firebase.apps && firebase.apps.length) {
      window.db = firebase.firestore();
      return window.db;
    }
    throw new Error("Chưa init Firebase/Firestore. Kiểm tra firebase-init.js");
  }

  // ===== MODALS =====
  function showAppDialog(msg, title = "Thông báo") {
    if (typeof window.showAppDialog === "function") return window.showAppDialog(msg, title);
    alert(`${title}\n\n${msg}`);
  }

  async function confirmApp(msg, title = "Xác nhận") {
    if (typeof window.confirmApp === "function") return await window.confirmApp(msg, title);
    return confirm(msg);
  }

  // ===== API HELPERS =====
  async function apiJson(url, options = {}) {
    const res = await fetch(url, options);

    let data = {};
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => "");
      data = { message: text };
    }

    if (!res.ok || data?.success === false) {
      const msg = data?.message || `HTTP ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return data;
  }

  async function apiPost(path, body) {
    return apiJson(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  // ===== CATEGORY / GRADE =====
  function bindCategoryCustom() {
    const c1 = $("#category1");
    const c2 = $("#category2");
    const cc1 = $("#customCategory1");
    const cc2 = $("#customCategory2");
    const grade = $("#grade");

    if (!c1 || !c2 || !cc1 || !cc2 || !grade) return;

    const syncGrade = () => {
      const v1 = c1.value || "";
      const v2 = c2.value || "";
      grade.disabled = !(v1 === "Gunpla" || v2 === "Gunpla");
      if (grade.disabled) grade.value = "";
    };

    c1.addEventListener("change", () => {
      const isCustom = c1.value === "__custom__";
      cc1.style.display = isCustom ? "block" : "none";
      if (!isCustom) cc1.value = "";
      syncGrade();
    });

    c2.addEventListener("change", () => {
      const isCustom = c2.value === "__custom__";
      cc2.style.display = isCustom ? "block" : "none";
      if (!isCustom) cc2.value = "";
      syncGrade();
    });

    syncGrade();
  }

  // ===== PRODUCTS =====
  async function fetchProducts() {
    const db = await ensureDb();
    if (!productTbody) return;

    productTbody.innerHTML = "";
    allProductsData = [];

    const snap = await db.collection("products").get();
    snap.forEach((doc) => {
      const p = doc.data() || {};
      p.id = doc.id;
      allProductsData.push(p);

      const tr = document.createElement("tr");
      tr.dataset.id = doc.id;

      const release = p.releaseDate?.toDate ? fmtDate(p.releaseDate) : (p.releaseDate || "");
      const stockVal = Number(p.stock ?? 0);

      // Columns:
      // 0 name, 1 cat1, 2 cat2, 3 price, 4 discount, 5 stock, 6 brand, 7 release, 8 image, 9 sold, 10 actions
      tr.innerHTML = `
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category1)}</td>
        <td>${escapeHtml(p.category2)}</td>
        <td>${escapeHtml(p.price)}</td>
        <td>${escapeHtml(p.discount)}</td>
        <td>${escapeHtml(stockVal)}</td>
        <td>${escapeHtml(p.brand)}</td>
        <td>${escapeHtml(release)}</td>
        <td>
          <img class="product-thumb" src="${escapeHtml(p.image || "/images/default.png")}"
               alt="${escapeHtml(p.name)}" onerror="this.src='/images/default.png'"/>
        </td>
        <td>${escapeHtml(p.sold)}</td>
        <td>
          <button class="editBtn" type="button">✏️ Edit</button><br/>
          <button class="deleteBtn" type="button">🗑️ Delete</button>
        </td>
      `;
      productTbody.appendChild(tr);
    });

    bindProductRowActions();
  }

  function bindProductRowActions() {
    if (_productsBound) return;

    productTbody?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const tr = btn.closest("tr");
      if (!tr) return;
      const id = tr.dataset.id;

      if (btn.classList.contains("deleteBtn")) {
        const ok = await confirmApp("Bạn có chắc muốn xóa sản phẩm này?", "Xóa sản phẩm");
        if (!ok) return;
        const db = await ensureDb();
        await db.collection("products").doc(id).delete();
        await fetchProducts();
        return;
      }

      if (btn.classList.contains("editBtn")) {
        if (editingRow) return;

        editingRow = tr;
        editingDocId = id;
        originalRowData = [...editingRow.children].map((td) => td.innerHTML);

        // Editable columns: 0..9 (skip image at 8). (actions at 10 not included)
        // 0 name,1 cat1,2 cat2,3 price,4 discount,5 stock,6 brand,7 release,8 image(skip),9 sold
        for (let i = 0; i < 10; i++) {
          if (i === 8) continue; // skip image col
          const td = editingRow.children[i];
          const value = td.textContent.trim();
          const isNumber = (i === 3 || i === 4 || i === 5 || i === 9);
          td.innerHTML = `<input type="${isNumber ? "number" : "text"}" value="${escapeHtml(value)}" style="width:100%" ${isNumber ? 'min="0"' : ""} />`;
        }

        editControls && (editControls.style.display = "flex");
        setStatus("✍️ Đang chỉnh sửa...", true);
      }
    });

    _productsBound = true;
  }

  function renderProductsFromList(list) {
    if (!productTbody) return;
    productTbody.innerHTML = "";

    list.forEach((p) => {
      const tr = document.createElement("tr");
      tr.dataset.id = p.id;

      const release = p.releaseDate?.toDate ? fmtDate(p.releaseDate) : (p.releaseDate || "");
      const stockVal = Number(p.stock ?? 0);

      tr.innerHTML = `
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category1)}</td>
        <td>${escapeHtml(p.category2)}</td>
        <td>${escapeHtml(p.price)}</td>
        <td>${escapeHtml(p.discount)}</td>
        <td>${escapeHtml(stockVal)}</td>
        <td>${escapeHtml(p.brand)}</td>
        <td>${escapeHtml(release)}</td>
        <td>
          <img class="product-thumb" src="${escapeHtml(p.image || "/images/default.png")}"
               alt="${escapeHtml(p.name)}" onerror="this.src='/images/default.png'"/>
        </td>
        <td>${escapeHtml(p.sold)}</td>
        <td>
          <button class="editBtn" type="button">✏️ Edit</button><br/>
          <button class="deleteBtn" type="button">🗑️ Delete</button>
        </td>
      `;
      productTbody.appendChild(tr);
    });
  }

  function bindProductSearch() {
    $("#searchInput")?.addEventListener("input", function () {
      const keyword = this.value.trim().toLowerCase();
      if (!keyword) return renderProductsFromList(allProductsData);

      const filtered = allProductsData.filter((p) => (
        (p.name || "").toLowerCase().includes(keyword) ||
        (p.category1 || "").toLowerCase().includes(keyword) ||
        (p.category2 || "").toLowerCase().includes(keyword) ||
        (p.brand || "").toLowerCase().includes(keyword)
      ));

      renderProductsFromList(filtered);
    });
  }

  function bindProductEditControls() {
    $("#saveBtn")?.addEventListener("click", async () => {
      if (!editingRow) return;

      // Inputs appear in editable cells: 0..7 and 9 (skip image 8)
      // inputs[0]=name, [1]=cat1, [2]=cat2, [3]=price, [4]=discount, [5]=stock, [6]=brand, [7]=release, [8]=sold
      const inputs = editingRow.querySelectorAll("input");
      const updatedData = {
        name: inputs[0]?.value || "",
        category1: inputs[1]?.value || "",
        category2: inputs[2]?.value || "",
        price: Math.max(0, parseInt(inputs[3]?.value || "0", 10) || 0),
        discount: Math.max(0, Math.min(99, parseInt(inputs[4]?.value || "0", 10) || 0)),
        stock: Math.max(0, parseInt(inputs[5]?.value || "0", 10) || 0),
        brand: inputs[6]?.value || "",
        releaseDate: inputs[7]?.value || "",
        sold: Math.max(0, parseInt(inputs[8]?.value || "0", 10) || 0),
      };

      try {
        const db = await ensureDb();
        await db.collection("products").doc(editingDocId).update(updatedData);
        setStatus("✅ Cập nhật thành công!", true);
      } catch (err) {
        console.error(err);
        setStatus(`❌ Lỗi khi cập nhật: ${err.message || err}`, false);
      }

      editingRow = null;
      editingDocId = null;
      originalRowData = null;
      if (editControls) editControls.style.display = "none";
      await fetchProducts();
    });

    $("#cancelBtn")?.addEventListener("click", () => {
      if (!editingRow || !originalRowData) return;
      originalRowData.forEach((html, i) => {
        editingRow.children[i].innerHTML = html;
      });
      editingRow = null;
      editingDocId = null;
      originalRowData = null;
      if (editControls) editControls.style.display = "none";
      setStatus("❎ Đã hủy chỉnh sửa.", true);
    });
  }

  function bindProductUpload() {
    $("#productForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const form = e.target;
      const fd = new FormData(form);

      // custom category
      const c1 = $("#category1");
      const c2 = $("#category2");
      if (c1?.value === "__custom__") fd.set("category1", $("#customCategory1")?.value || "");
      if (c2?.value === "__custom__") fd.set("category2", $("#customCategory2")?.value || "");

      // normalize numbers
      if (fd.has("price")) fd.set("price", String(Math.max(0, parseInt(fd.get("price") || "0", 10) || 0)));
      if (fd.has("discount")) fd.set("discount", String(Math.max(0, Math.min(99, parseInt(fd.get("discount") || "0", 10) || 0))));
      if (fd.has("sold")) fd.set("sold", String(Math.max(0, parseInt(fd.get("sold") || "0", 10) || 0)));
      if (fd.has("stock")) fd.set("stock", String(Math.max(0, parseInt(fd.get("stock") || "0", 10) || 0)));

      try {
        setStatus("⏳ Đang upload...", true);

        const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));

        if (data?.success) {
          setStatus("✅ Upload thành công!", true);
          form.reset();
          await fetchProducts();
        } else {
          setStatus(`❌ Upload thất bại. ${data?.message || ""}`.trim(), false);
        }
      } catch (err) {
        console.error(err);
        setStatus(`❌ Có lỗi xảy ra khi upload: ${err.message || err}`, false);
      }
    });
  }

  // ===== ACCOUNTS =====
  async function loadAccounts() {
    const db = await ensureDb();
    if (!accountTbody) return;

    accountTbody.innerHTML = "";
    const snap = await db.collection("accounts").get();

    snap.forEach((doc) => {
      const user = doc.data() || {};
      const id = doc.id;

      const tr = document.createElement("tr");
      tr.dataset.id = id;

      tr.innerHTML = `
        <td>${escapeHtml(user.userId || id)}</td>
        <td><input type="text" value="${escapeHtml(user.username || "")}" data-field="username" data-id="${escapeHtml(id)}" /></td>
        <td><input type="text" value="${escapeHtml(user.email || "")}" data-field="email" data-id="${escapeHtml(id)}" /></td>
        <td>
          <select data-field="level" data-id="${escapeHtml(id)}">
            <option value="0" ${String(user.level) === "0" ? "selected" : ""}>0</option>
            <option value="1" ${String(user.level) === "1" ? "selected" : ""}>1</option>
          </select>
        </td>
        <td>
          <button class="saveAcc" type="button" data-save="${escapeHtml(id)}">💾 Lưu</button>
          <button class="delAcc" type="button" data-del="${escapeHtml(id)}">🗑️ Xóa</button>
        </td>
      `;

      accountTbody.appendChild(tr);
    });
  }

  function bindAccountsActions() {
    accountTbody?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const saveId = btn.getAttribute("data-save");
      const delId = btn.getAttribute("data-del");

      if (saveId) {
        // ✅ chỉ lấy đúng các input/select có data-field
        const inputs = document.querySelectorAll(`[data-id="${saveId}"][data-field]`);
        const updated = {};

        inputs.forEach((el) => {
          const field = el?.dataset?.field;
          if (!field) return;

          let val = el.value ?? "";
          if (field === "level") {
            const n = parseInt(String(val), 10);
            val = Number.isFinite(n) ? n : 0;
          } else {
            val = String(val).trim();
          }

          // không cho undefined/null lọt vào update
          if (val === undefined || val === null) return;
          updated[field] = val;
        });

        if (!Object.keys(updated).length) {
          showAppDialog("❌ Không có dữ liệu hợp lệ để lưu.", "Accounts");
          return;
        }

        try {
          const db = await ensureDb();
          await db.collection("accounts").doc(saveId).update(updated);
          showAppDialog("✅ Đã lưu tài khoản!", "Accounts");
        } catch (err) {
          console.error(err);
          showAppDialog(`❌ Lỗi khi lưu tài khoản: ${err.message || err}`, "Accounts");
        }
      }

      if (delId) {
        const ok = await confirmApp("Bạn có chắc chắn muốn xóa tài khoản này?", "Xóa tài khoản");
        if (!ok) return;

        try {
          const db = await ensureDb();
          await db.collection("accounts").doc(delId).delete();
          showAppDialog("🗑️ Đã xóa tài khoản.", "Accounts");
          await loadAccounts();
        } catch (err) {
          console.error(err);
          showAppDialog(`❌ Lỗi khi xóa tài khoản: ${err.message || err}`, "Accounts");
        }
      }
    });

    $("#accountSearch")?.addEventListener("input", () => {
      const q = ($("#accountSearch").value || "").toLowerCase().trim();
      const rows = $("#accountTable tbody")?.querySelectorAll("tr") || [];
      rows.forEach((r) => {
        const text = (r.textContent || "").toLowerCase();
        r.style.display = text.includes(q) ? "" : "none";
      });
    });
  }

  // ===== ORDERS =====
  // ✅ Canonical statuses (khớp track-order.html)
  const STATUS_LABEL = {
    pending: "Chờ xác nhận",
    awaiting_payment: "Chờ thanh toán",
    payment_failed: "Thanh toán lỗi",
    confirmed: "Chờ lấy hàng",
    packing: "Đang đóng gói",
    shipping: "Đang giao",
    delivered: "Đã giao",
    cancel_requested: "Chờ duyệt huỷ",
    cancelled: "Đã huỷ",
    failed: "Giao thất bại",
    return: "Hoàn/Trả",
  };

  const STATUS_ORDER = [
    "pending",
    "awaiting_payment",
    "payment_failed",
    "confirmed",
    "packing",
    "shipping",
    "delivered",
    "cancel_requested",
    "cancelled",
    "failed",
    "return",
  ];

  // ✅ normalize legacy/uppercase → lowercase canonical
  function normalizeStatus(s) {
    const raw = (s || "").toString().trim();
    if (!raw) return "pending";

    const up = raw.toUpperCase();
    const legacy = {
      PENDING: "pending",
      PLACED: "pending",
      CONFIRMED: "confirmed",
      PACKING: "packing",
      SHIPPED: "shipping",
      SHIPPING: "shipping",
      DELIVERED: "delivered",
      CANCELLED: "cancelled",
      CANCEL_REQUESTED: "cancel_requested",
      FAILED: "failed",
      RETURNED: "return",
      RETURN: "return",
      AWAITING_PAYMENT: "awaiting_payment",
      PAYMENT_FAILED: "payment_failed",
    };
    if (legacy[up]) return legacy[up];

    const low = raw.toLowerCase();
    if (STATUS_LABEL[low]) return low;

    return low;
  }

  // ✅ update status via SERVER API
// ✅ map canonical(lowercase) -> server legacy (UPPERCASE)
function toServerStatus(st) {
  st = (st || "").toString().trim().toLowerCase();
  const MAP = {
    pending: "PLACED",                 // hoặc "PENDING" tùy server, nhưng đa số dùng PLACED
    awaiting_payment: "AWAITING_PAYMENT",
    payment_failed: "PAYMENT_FAILED",
    confirmed: "CONFIRMED",
    packing: "PACKING",
    shipping: "SHIPPING",              // server bạn có thể dùng SHIPPING hoặc SHIPPED
    delivered: "DELIVERED",
    cancel_requested: "CANCEL_REQUESTED",
    cancelled: "CANCELLED",
    failed: "FAILED",
    return: "RETURN",
  };
  return MAP[st] || st.toUpperCase();
}

// ✅ update status via SERVER API
async function updateOrderStatus(orderId, newStatus) {
  // newStatus trong UI là lowercase canonical
  const serverStatus = toServerStatus(newStatus);

  return apiPost(`/admin/orders/${encodeURIComponent(orderId)}/status`, {
    status: serverStatus,
    note: "Admin cập nhật",
    // (tuỳ chọn) gửi thêm để debug, server ignore cũng được
    clientStatus: newStatus,
  });
}
  


// ===== INVENTORY: RESTOCK WHEN ORDER CANCELLED / FAILED =====
// Rule:
// - Đơn được tạo ở cart → đã trừ kho trong products.
// - Nếu admin đổi trạng thái sang "cancelled" hoặc "failed" ⇒ cộng kho lại theo qty từng item.
// - Chỉ restock 1 lần bằng cờ order.inventory.restocked.
async function restockOrderIfNeeded(orderId, newStatus, prevStatus) {
  newStatus = (newStatus || "").toString().toLowerCase();
  prevStatus = (prevStatus || "").toString().toLowerCase();

  const NEED_RESTOCK = new Set(["cancelled", "failed"]);
  if (!NEED_RESTOCK.has(newStatus)) return;
  if (NEED_RESTOCK.has(prevStatus)) return; // đã ở trạng thái restock rồi

  const db = await ensureDb();

  await db.runTransaction(async (tx) => {
    const oRef = db.collection("orders").doc(String(orderId));
    const oDoc = await tx.get(oRef);
    if (!oDoc.exists) return;

    const o = oDoc.data() || {};
    const inv = o.inventory || {};

    // đã restock rồi thì bỏ qua (tránh + kho nhiều lần)
    if (inv.restocked === true) return;

    const items = Array.isArray(o.items) ? o.items : [];
    if (!items.length) return;

    for (const it of items) {
      const pid = String(it.id || it.productId || "");
      const qty = Number(it.quantity || 0);
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;

      const pRef = db.collection("products").doc(pid);
      tx.update(pRef, {
        stock: firebase.firestore.FieldValue.increment(qty),
        sold: firebase.firestore.FieldValue.increment(-qty),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    const invPatch = {
      inventory: {
        ...(typeof inv === "object" && inv ? inv : {}),
        restocked: true,
        restockedAt: firebase.firestore.FieldValue.serverTimestamp(),
        restockedBy: "admin",
      },
    };

    tx.update(oRef, invPatch);

    // cập nhật bản copy trong orderHistory (nếu có)
    const uid = o.userId || o.uid || o.buyerId;
    if (uid) {
      const hRef = db.collection("accounts").doc(String(uid)).collection("orderHistory").doc(String(orderId));
      tx.set(hRef, invPatch, { merge: true });
    }
  });
}
  async function approveCancel(orderId) {
    return apiPost(`/admin/orders/${encodeURIComponent(orderId)}/approve-cancel`, { note: "Admin duyệt huỷ" });
  }

  async function rejectCancel(orderId) {
    return apiPost(`/admin/orders/${encodeURIComponent(orderId)}/reject-cancel`, { note: "Admin từ chối huỷ" });
  }

  function renderOrderDetail(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const history = Array.isArray(order.history) ? order.history.slice() : [];

    history.sort((a, b) => {
      const ta = a.at?.toMillis ? a.at.toMillis() : new Date(a.at || 0).getTime();
      const tb = b.at?.toMillis ? b.at.toMillis() : new Date(b.at || 0).getTime();
      return ta - tb;
    });

    const shipping = order.shipping || {};
    const statusKey = normalizeStatus(order.status);
    const statusText = STATUS_LABEL[statusKey] || order.status || "—";

    const addr = order.address || {};
    const buyerName = order.buyerName || shipping.name || shipping.fullName || addr.fullname || addr.name || "—";
    const buyerPhone = order.buyerPhone || shipping.phone || addr.phone || "—";
    const buyerEmail = order.buyerEmail || shipping.email || addr.email || "—";
    const contact = buyerPhone !== "—" ? buyerPhone : buyerEmail;

    return `
      <div style="display:grid; gap:10px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <div><b>Mã đơn:</b> ${escapeHtml(order.orderId || order.id)}</div>
          <div><b>Trạng thái:</b> ${escapeHtml(statusText)}</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div><b>Khách:</b> ${escapeHtml(buyerName)}</div>
          <div><b>Liên hệ:</b> ${escapeHtml(contact || "—")}</div>
          <div><b>Tạo lúc:</b> ${escapeHtml(fmtTime(order.createdAt))}</div>
          <div><b>Cập nhật:</b> ${escapeHtml(fmtTime(order.updatedAt || order.createdAt))}</div>
          <div><b>Vận chuyển:</b> ${escapeHtml(shipping.carrier || "—")}</div>
          <div><b>Vận đơn:</b> ${escapeHtml(shipping.trackingCode || "—")}</div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,.14); padding-top:10px;">
          <b>Sản phẩm</b>
          <div style="display:grid; gap:8px; margin-top:8px;">
            ${items.length ? items.map(it => `
              <div style="display:flex; gap:10px; align-items:center; border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:10px;">
                <img src="${escapeHtml(it.image || "/images/default.png")}" onerror="this.src='/images/default.png'"
                     style="width:54px;height:54px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.14);">
                <div style="min-width:0;flex:1">
                  <div style="font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(it.name || "Sản phẩm")}</div>
                  <div style="opacity:.85;font-size:13px;">SL: ${it.qty || it.quantity || 1}</div>
                </div>
                <div style="font-weight:950;">${vnd((it.price || 0) * (it.qty || it.quantity || 1))}</div>
              </div>
            `).join("") : `<div style="opacity:.85;">(Không có items)</div>`}
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:10px; font-weight:950;">
            Tổng: ${vnd(order.total || 0)}
          </div>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,.14); padding-top:10px;">
          <b>Timeline</b>
          <div style="display:grid; gap:8px; margin-top:8px;">
            ${history.length ? history.map(h => `
              <div style="border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:10px;">
                <div style="font-weight:950;">${escapeHtml(STATUS_LABEL[normalizeStatus(h.status)] || h.status)}</div>
                <div style="opacity:.85;font-size:13px;">${escapeHtml(fmtTime(h.at))}${h.note ? " • " + escapeHtml(h.note) : ""}</div>
              </div>
            `).join("") : `<div style="opacity:.85;">Chưa có lịch sử.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderOrderActions(o) {
    const st = normalizeStatus(o.status);
    if (st === "cancel_requested") {
      return `
        <button class="saveAcc" type="button" data-view="${escapeHtml(o.id)}">Xem</button>
        <button class="saveAcc" type="button" data-approve="${escapeHtml(o.id)}">Duyệt huỷ</button>
        <button class="deleteBtn" type="button" data-reject="${escapeHtml(o.id)}">Từ chối</button>
        <button class="deleteBtn" type="button" data-del="${escapeHtml(o.id)}">Xóa</button>
      `;
    }
    return `
      <button class="saveAcc" type="button" data-view="${escapeHtml(o.id)}">Xem</button>
      <button class="deleteBtn" type="button" data-del="${escapeHtml(o.id)}">Xóa</button>
    `;
  }

  async function loadOrders() {
    const tbody = $("#orderTable tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="padding:14px;opacity:.9;">Đang tải đơn hàng...</td></tr>`;

    const q = ($("#orderSearch")?.value || "").trim().toLowerCase();
    const stFilter = ($("#orderStatusFilter")?.value || "").trim(); // value phải là lowercase canonical

    try {
      const db = await ensureDb();
      const snap = await db.collection("orders").orderBy("createdAt", "desc").limit(300).get();
      let orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (stFilter) orders = orders.filter((o) => normalizeStatus(o.status) === stFilter);

      if (q) {
        orders = orders.filter((o) => {
          const shipping = o.shipping || {};
          const hay = [
            o.orderId || o.id,
            o.buyerPhone || shipping.phone || "",
            o.buyerEmail || shipping.email || "",
            o.buyerName || shipping.name || "",
          ].join(" ").toLowerCase();
          return hay.includes(q);
        });
      }

      if (!orders.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:14px;opacity:.9;">Không có đơn hàng.</td></tr>`;
        return;
      }

      tbody.innerHTML = "";
      for (const o of orders) {
        const tr = document.createElement("tr");
        const shipping = o.shipping || {};
        const addr = o.address || {};
        const contact = o.buyerPhone || shipping.phone || addr.phone || o.buyerEmail || shipping.email || addr.email || "—";
        const created = fmtTime(o.createdAt);
        const st = normalizeStatus(o.status);

        tr.innerHTML = `
          <td style="font-weight:950;">${escapeHtml(o.orderId || o.id)}</td>
          <td>${escapeHtml(o.buyerName || shipping.name || addr.fullname || addr.name || "—")}</td>
          <td>${escapeHtml(contact)}</td>
          <td>${escapeHtml(created)}</td>
          <td style="font-weight:950;">${vnd(o.total || 0)}</td>
          <td>
            <select
              data-oid="${escapeHtml(o.id)}"
              class="orderStatusSel"
              style="width:auto;min-width:190px;"
              ${st === "cancel_requested" ? "disabled" : ""}
             data-prev="${st}">
              ${STATUS_ORDER.map(k => `<option value="${k}" ${k === st ? "selected" : ""}>${STATUS_LABEL[k] || k}</option>`).join("")}
            </select>
          </td>
          <td>${renderOrderActions(o)}</td>
        `;
        tbody.appendChild(tr);
      }

      // actions
      tbody.onclick = async (e) => {
        const viewBtn = e.target.closest("[data-view]");
        const delBtn = e.target.closest("[data-del]");
        const approveBtn = e.target.closest("[data-approve]");
        const rejectBtn = e.target.closest("[data-reject]");

        try {
          if (approveBtn) {
            const id = approveBtn.getAttribute("data-approve");
            const ok = await confirmApp("Duyệt huỷ đơn này?", "Duyệt huỷ");
            if (!ok) return;

            await approveCancel(id);
            // ✅ duyệt huỷ = cancelled ⇒ cộng kho lại
            await restockOrderIfNeeded(id, "cancelled", "cancel_requested");
            showAppDialog("✅ Đã duyệt huỷ đơn", "Orders");
            await loadOrders();
            return;
          }

          if (rejectBtn) {
            const id = rejectBtn.getAttribute("data-reject");
            const ok = await confirmApp("Từ chối yêu cầu huỷ đơn?", "Từ chối");
            if (!ok) return;

            await rejectCancel(id);
            showAppDialog("❌ Đã từ chối huỷ", "Orders");
            await loadOrders();
            return;
          }

          if (viewBtn) {
            const id = viewBtn.getAttribute("data-view");
            const db = await ensureDb();
            const doc = await db.collection("orders").doc(id).get();
            if (!doc.exists) return;

            const order = { id: doc.id, ...doc.data() };
            const dlg = $("#orderDetailDialog");
            const body = $("#orderDetailBody");
            const title = $("#orderDetailTitle");

            if (title) title.textContent = `Chi tiết đơn: ${order.orderId || order.id}`;
            if (body) body.innerHTML = renderOrderDetail(order);
            dlg?.showModal();
            return;
          }

          if (delBtn) {
            const id = delBtn.getAttribute("data-del");
            const ok = await confirmApp(`Xóa đơn ${id}? Hành động không thể hoàn tác.`, "Xóa đơn hàng");
            if (!ok) return;

            const db = await ensureDb();
            await db.collection("orders").doc(id).delete();
            showAppDialog("Đã xóa đơn ✅", "Orders");
            await loadOrders();
          }
        } catch (err) {
          console.error(err);
          showAppDialog(`❌ Thao tác thất bại: ${err.message || err}`, "Orders");
          await loadOrders();
        }
      };

      // status change
      tbody.querySelectorAll(".orderStatusSel").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const orderId = sel.getAttribute("data-oid");
          const prevStatus = (sel.getAttribute("data-prev") || "").toString().toLowerCase();
          const newStatus = sel.value; // canonical lowercase

          const ok = await confirmApp(
            `Đổi trạng thái đơn ${orderId} → ${STATUS_LABEL[newStatus]}?`,
            "Cập nhật trạng thái"
          );

          if (!ok) return await loadOrders();

          try {
            await updateOrderStatus(orderId, newStatus);
            // ✅ restock nếu chuyển sang cancelled/failed
            await restockOrderIfNeeded(orderId, newStatus, prevStatus);
            sel.setAttribute("data-prev", newStatus);
            showAppDialog("Cập nhật trạng thái thành công ✅", "Orders");
            await loadOrders();
          } catch (err) {
            console.error(err);
            showAppDialog(`Cập nhật thất bại ❌: ${err.message || err}`, "Orders");
            await loadOrders();
          }
        });
      });
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" style="padding:14px;color:#ffb4b4;">Lỗi tải đơn hàng: ${escapeHtml(err.message || String(err))}</td></tr>`;
    }
  }

  // expose
  window.loadOrders = loadOrders;
  window.loadAccounts = loadAccounts;
  window.fetchProducts = fetchProducts;

  // ===== TOOLS =====
  window.syncImportFormatUI = function syncImportFormatUI() {
    const fmt = $("#importFormat")?.value || "json";
    const input = $("#importFile");
    if (!input) return;

    if (fmt === "json") input.accept = "application/json";
    if (fmt === "csv") input.accept = ".csv,text/csv";
    if (fmt === "xlsx") input.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (fmt === "zip") input.accept = ".zip,application/zip";

    input.value = "";
  };

  window.pingAdminApi = async function pingAdminApi() {
    try {
      setToolsStatus("⏳ Pinging...", true);
      const data = await apiJson(`${API_BASE}/admin/ping`);
      setToolsStatus(`✅ OK: ${data?.message || "pong"}`, true);
      showAppDialog("Kết nối server OK ✅", "Tools");
    } catch (e) {
      console.error(e);
      setToolsStatus("❌ Không ping được API. Kiểm tra server.", false);
      showAppDialog(`Không ping được API ❌: ${e.message || e}`, "Tools");
    }
  };

  window.runImport = async function runImport() {
    const type = $("#importType")?.value || "products";
    const format = $("#importFormat")?.value || "json";
    const file = $("#importFile")?.files?.[0];

    if (!file) {
      setToolsStatus("❌ Bạn chưa chọn file.", false);
      return;
    }

    try {
      const ok = await confirmApp(`Import ${type} bằng ${format.toUpperCase()} từ "${file.name}"?`, "Import");
      if (!ok) return;

      setToolsStatus("⏳ Đang import...", true);

      const fd = new FormData();
      fd.append("type", type);
      fd.append("format", format);
      fd.append("file", file);

      const url = (format === "zip") ? `${API_BASE}/admin/upload-zip` : `${API_BASE}/admin/import`;
      const res = await fetch(url, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));

      if (data?.success) {
        setToolsStatus(`✅ Thành công: ${data?.message || (data?.count ? `+${data.count}` : "OK")}`, true);
        showAppDialog("Thực thi thành công ✅", "Tools");

        if (type === "products") await fetchProducts();
        if (type === "accounts") await loadAccounts();
        if (type === "orders") await loadOrders?.();
      } else {
        setToolsStatus(`❌ Thất bại: ${data?.message || ""}`.trim(), false);
        showAppDialog("Thực thi thất bại ❌", "Tools");
      }
    } catch (e) {
      console.error(e);
      setToolsStatus(`❌ Lỗi import: ${e.message || e}`, false);
      showAppDialog(`Lỗi import ❌: ${e.message || e}`, "Tools");
    }
  };

  window.exportCollection = async function exportCollection() {
    const type = $("#exportType")?.value || "products";
    try {
      setToolsStatus("⏳ Đang export...", true);

      const res = await fetch(`${API_BASE}/admin/export?type=${encodeURIComponent(type)}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setToolsStatus("✅ Export xong!", true);
    } catch (e) {
      console.error(e);
      setToolsStatus("❌ Export lỗi. Kiểm tra server.", false);
      showAppDialog(`Export lỗi ❌: ${e.message || e}`, "Tools");
    }
  };

  window.seedDemo = async function seedDemo() {
    try {
      const ok = await confirmApp("Seed demo data (products/banners/news) vào Firestore?", "Seed demo");
      if (!ok) return;

      setToolsStatus("⏳ Đang seed demo...", true);
      const res = await fetch(`${API_BASE}/admin/seed`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (data?.success) {
        setToolsStatus("✅ Seed demo thành công!", true);
        showAppDialog("Seed demo thành công ✅", "Tools");
        await fetchProducts();
        await loadAccounts();
      } else {
        setToolsStatus(`❌ Seed thất bại: ${data?.message || ""}`.trim(), false);
        showAppDialog("Seed thất bại ❌", "Tools");
      }
    } catch (e) {
      console.error(e);
      setToolsStatus(`❌ Seed lỗi: ${e.message || e}`, false);
      showAppDialog(`Seed lỗi ❌: ${e.message || e}`, "Tools");
    }
  };

  window.runClear = async function runClear() {
    const clearType = $("#clearType")?.value || "reviews";
    const ok = await confirmApp(`Bạn chắc chắn muốn clear "${clearType}"? Không thể hoàn tác.`, "Danger Zone");
    if (!ok) return;

    try {
      setToolsStatus("⏳ Đang clear...", true);
      const data = await apiPost(`/admin/clear`, { type: clearType });

      if (data?.success) {
        setToolsStatus("✅ Clear xong!", true);
        showAppDialog("Clear thành công ✅", "Tools");

        if (clearType === "products") await fetchProducts();
        if (clearType === "orders") await loadOrders?.();
      } else {
        setToolsStatus(`❌ Clear thất bại: ${data?.message || ""}`.trim(), false);
        showAppDialog("Clear thất bại ❌", "Tools");
      }
    } catch (e) {
      console.error(e);
      setToolsStatus(`❌ Clear lỗi: ${e.message || e}`, false);
      showAppDialog(`Clear lỗi ❌: ${e.message || e}`, "Tools");
    }
  };

  // ===== BIND FILTERS ORDERS =====
  function bindOrderFilters() {
    $("#orderSearch")?.addEventListener("input", () => {
      clearTimeout(window.__orderT);
      window.__orderT = setTimeout(() => loadOrders(), 200);
    });
    $("#orderStatusFilter")?.addEventListener("change", () => loadOrders());
  }

  // ===== INIT =====
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureDb();
      bindCategoryCustom();
      bindProductUpload();
      bindProductSearch();
      bindProductEditControls();
      bindAccountsActions();
      bindOrderFilters();
      window.syncImportFormatUI?.();

      await fetchProducts();
      await loadAccounts();
      // Orders load khi bấm tab Orders (admin.html gọi loadOrders() trong showTab)
    } catch (e) {
      console.error(e);
      setStatus("❌ Không kết nối được Firestore. Kiểm tra firebase-init.js", false);
    }
  });
})();
