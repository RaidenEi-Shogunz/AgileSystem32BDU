const express = require("express");
const multer = require("multer");
const admin = require("firebase-admin");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

// ===============================
// ⚙️ Firebase Admin
// ===============================
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ===============================
// 🧩 Helpers
// ===============================
function slugify(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// đảm bảo slug unique (nếu trùng thì thêm -2 -3 ...)
async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug || "product";
  let i = 1;

  while (true) {
    const snap = await db.collection("products").where("slug", "==", slug).limit(1).get();
    if (snap.empty) return slug;
    i += 1;
    slug = `${baseSlug}-${i}`;
  }
}

// ===============================
// 🚀 App
// ===============================
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ✅ Debug: log request để biết chắc đang chạy đúng server.js này
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ===============================
// 🌐 SEO Friendly URLs (PHẢI TRƯỚC static)
// ===============================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/products", (req, res) => res.sendFile(path.join(__dirname, "public", "product-list.html")));
app.get("/category/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "product-list.html")));
app.get("/product/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "detail.html")));
app.get("/cart", (req, res) => res.sendFile(path.join(__dirname, "public", "cart.html")));
app.get("/track-order", (req, res) => res.sendFile(path.join(__dirname, "public", "track-order.html")));

// ===============================
// 📦 Static
// ===============================
app.use(express.static("public"));

// ===============================
// 🖼️ Multer upload ảnh sản phẩm
// ===============================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "public", "images", "products");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const safeName = (file.originalname || "image")
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const upload = multer({ storage });

// ===============================
// 📦 Upload sản phẩm
// ===============================
app.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Không có ảnh được upload." });
  }

  try {
    const {
      name,
      price,
      discount,
      grade,
      brand,
      releaseDate,
      category1,
      category2,
      sold,
      slug: slugInput,
    } = req.body;

    const imageUrl = `/images/products/${req.file.filename}`;

    const baseSlug = slugify(slugInput || name || "product");
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const newProduct = {
      name: (name || "").toString(),
      slug: uniqueSlug, // ✅ thêm slug để dùng /product/:slug
      price: Math.max(0, parseInt(price || "0", 10) || 0),
      discount: Math.max(0, Math.min(99, parseInt(discount || "0", 10) || 0)),
      grade: (grade || "").toString(),
      brand: (brand || "").toString(),
      releaseDate: (releaseDate || "").toString(),
      category1: (category1 || "").toString(),
      category2: (category2 || "").toString(),
      sold: Math.max(0, parseInt(sold || "0", 10) || 0),
      image: imageUrl,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("products").add(newProduct);

    res.json({
      success: true,
      message: "Tải lên thành công!",
      id: ref.id,
      slug: uniqueSlug,
      imageUrl,
      productUrl: `/product/${encodeURIComponent(uniqueSlug)}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Lỗi server." });
  }
});

// upload ảnh riêng
app.post("/upload-image-only", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Không có file." });
    }
    const imageUrl = `/images/products/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Lỗi upload ảnh." });
  }
});

// ===============================
// ✅ ADMIN API (Orders)
// ===============================
const STATUS_LABEL = {
  PLACED: "Đã đặt",
  CONFIRMED: "Đã xác nhận",
  PACKING: "Đang đóng gói",
  SHIPPED: "Đang giao",
  DELIVERED: "Đã giao",
  CANCELLED: "Đã huỷ",
  CANCEL_REQUESTED: "Chờ duyệt huỷ",
  FAILED: "Giao thất bại",
  RETURNED: "Hoàn/Trả",
};

function normalizeStatus(s) {
  if (!s) return "PLACED";
  if (s === "pending") return "PLACED"; // legacy
  return String(s).trim();
}

app.get("/admin/ping", (req, res) => {
  res.json({ success: true, message: "pong", serverTime: new Date().toISOString() });
});

// ✅ Helper: push history
function makeHistoryItem({ status, note, by = "admin" }) {
  return {
    status,
    note: (note || "").toString().slice(0, 200),
    at: Timestamp.now(),
    by,
  };
}

// ✅ Update status: /admin/orders/:id/status
app.post("/admin/orders/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const status = normalizeStatus(req.body?.status);
    const note = (req.body?.note || "Admin cập nhật").toString().slice(0, 200);

    if (!STATUS_LABEL[status]) {
      return res.status(400).json({ success: false, message: "Status không hợp lệ." });
    }

    const ref = db.collection("orders").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Order không tồn tại." });

    const cur = normalizeStatus(doc.data()?.status);
    if (cur === "CANCEL_REQUESTED") {
      return res.status(400).json({
        success: false,
        message: "Đơn đang chờ duyệt huỷ, không cho đổi status trực tiếp.",
      });
    }

    await ref.update({
      status,
      statusLabel: STATUS_LABEL[status],
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status, note })),
    });

    // ✅ sync sang orderHistory của user (nếu có userId)
    const userId = doc.data().userId;
    if (userId) {
      const userOrderRef = db
        .collection("accounts")
        .doc(String(userId))
        .collection("orderHistory")
        .doc(id);

      await userOrderRef.set(
        {
          status,
          statusLabel: STATUS_LABEL[status],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    res.json({ success: true, message: "Updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
});

// ✅ Approve cancel
app.post("/admin/orders/:id/approve-cancel", async (req, res) => {
  try {
    const id = req.params.id;
    const note = (req.body?.note || "Admin duyệt huỷ").toString().slice(0, 200);

    const ref = db.collection("orders").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Order không tồn tại." });

    const cur = normalizeStatus(doc.data()?.status);
    if (cur !== "CANCEL_REQUESTED") {
      return res.status(400).json({ success: false, message: "Đơn không ở trạng thái chờ duyệt huỷ." });
    }

    await ref.update({
      status: "CANCELLED",
      statusLabel: STATUS_LABEL.CANCELLED,
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status: "CANCELLED", note })),
    });

    // sync user history
    const userId = doc.data().userId;
    if (userId) {
      const userOrderRef = db
        .collection("accounts")
        .doc(String(userId))
        .collection("orderHistory")
        .doc(id);

      await userOrderRef.set(
        {
          status: "CANCELLED",
          statusLabel: STATUS_LABEL.CANCELLED,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    res.json({ success: true, message: "Approved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
});

// ✅ Reject cancel
app.post("/admin/orders/:id/reject-cancel", async (req, res) => {
  try {
    const id = req.params.id;
    const note = (req.body?.note || "Admin từ chối huỷ").toString().slice(0, 200);

    const ref = db.collection("orders").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Order không tồn tại." });

    const cur = normalizeStatus(doc.data()?.status);
    if (cur !== "CANCEL_REQUESTED") {
      return res.status(400).json({ success: false, message: "Đơn không ở trạng thái chờ duyệt huỷ." });
    }

    const backStatus = "CONFIRMED";

    await ref.update({
      status: backStatus,
      statusLabel: STATUS_LABEL[backStatus],
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status: backStatus, note })),
    });

    // sync user history
    const userId = doc.data().userId;
    if (userId) {
      const userOrderRef = db
        .collection("accounts")
        .doc(String(userId))
        .collection("orderHistory")
        .doc(id);

      await userOrderRef.set(
        {
          status: backStatus,
          statusLabel: STATUS_LABEL[backStatus],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    res.json({ success: true, message: "Rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
  }
});

// ===============================
// ✅ Fallback (PHẢI đặt TRƯỚC listen)
// ===============================
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// 🚀 Start server
// ===============================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`⚡ Server chạy tại http://localhost:${PORT}`);
});
