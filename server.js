require("dotenv").config();
const express = require("express");
const multer = require("multer");
const admin = require("firebase-admin");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const crypto = require("crypto");

// ===============================
// ⚙️ Firebase Admin — dùng env var, KHÔNG hardcode key
// ===============================
let adminCredential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  adminCredential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminCredential = admin.credential.applicationDefault();
} else {
  const keyPath = path.join(__dirname, "serviceAccountKey.json");
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      "Không tìm thấy service account key.\n" +
      "Set env FIREBASE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_APPLICATION_CREDENTIALS."
    );
  }
  adminCredential = admin.credential.cert(require(keyPath));
}

admin.initializeApp({ credential: adminCredential });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ===============================
// 🔑 Token HMAC-SHA256
// ===============================
const TOKEN_SECRET = process.env.TOKEN_SECRET || (() => {
  console.warn("⚠️  TOKEN_SECRET chưa được set. Đặt biến này trong .env trước khi deploy!");
  return "local-dev-secret-" + Math.random();
})();
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ

function signToken(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyToken(token) {
  try {
    const [b64, sig] = (token || "").split(".");
    if (!b64 || !sig) return null;
    const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(b64).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ===============================
// 🧩 Helpers
// ===============================
function slugify(str) {
  return (str || "")
    .toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug || "product";
  let i = 1;
  while (true) {
    const snap = await db.collection("products").where("slug", "==", slug).limit(1).get();
    if (snap.empty) return slug;
    slug = `${baseSlug}-${++i}`;
  }
}

// ===============================
// 🚀 App
// ===============================
const app = express();

// CORS: chỉ chấp nhận origin được cấu hình qua env
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5000,http://localhost:3000")
  .split(",").map((s) => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ===============================
// 🔐 Middleware xác thực admin (server-side)
// ===============================
function requireAdmin(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ success: false, message: "Chưa đăng nhập hoặc token hết hạn." });
  const level = typeof payload.level === "number" ? payload.level : 0;
  if (level < 1) return res.status(403).json({ success: false, message: "Không có quyền admin." });
  req.adminUser = payload;
  next();
}

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
// 🔐 Login API — xác thực phía server
// ===============================
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Thiếu username hoặc password." });
  }
  try {
    const snap = await db.collection("accounts")
      .where("username", "==", String(username).trim())
      .limit(1).get();

    // Dùng cùng thông báo dù sai username hay password (tránh user enumeration)
    if (snap.empty) {
      return res.status(401).json({ success: false, message: "Sai tên đăng nhập hoặc mật khẩu." });
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    // So sánh mật khẩu phía server (không để client truy cập Firestore trực tiếp)
    // TODO: migrate sang bcrypt: npm i bcrypt → bcrypt.compare(password, userData.passwordHash)
    if (userData.password !== String(password)) {
      return res.status(401).json({ success: false, message: "Sai tên đăng nhập hoặc mật khẩu." });
    }

    const level = typeof userData.level === "number" ? userData.level
      : userData.level === "admin" ? 10 : 0;

    const token = signToken({
      userId: userDoc.id,
      username: userData.username,
      level,
      exp: Date.now() + TOKEN_TTL_MS,
    });

    const { password: _pwd, ...safeUser } = userData;
    res.json({ success: true, token, user: { userId: userDoc.id, ...safeUser } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

// ===============================
// 🖼️ Multer — whitelist mimetype + giới hạn kích thước
// ===============================
const ALLOWED_MIMETYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, "public", "images", "products");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safeName = (file.originalname || "image")
      .replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(req, file, cb) {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error("Chỉ chấp nhận file ảnh (JPEG, PNG, WebP, GIF)."), { code: "INVALID_TYPE" }));
  },
});

// ===============================
// 📦 Upload — yêu cầu admin
// ===============================
app.post("/upload", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Không có ảnh được upload." });
  try {
    const { name, price, discount, grade, brand, releaseDate, category1, category2, sold, slug: slugInput } = req.body;
    const imageUrl = `/images/products/${req.file.filename}`;
    const uniqueSlug = await ensureUniqueSlug(slugify(slugInput || name || "product"));

    const ref = await db.collection("products").add({
      name: (name || "").toString(),
      slug: uniqueSlug,
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
    });

    res.json({ success: true, message: "Tải lên thành công!", id: ref.id, slug: uniqueSlug, imageUrl,
      productUrl: `/product/${encodeURIComponent(uniqueSlug)}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || "Lỗi server." });
  }
});

app.post("/upload-image-only", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Không có file." });
  res.json({ success: true, imageUrl: `/images/products/${req.file.filename}` });
});

// ===============================
// ✅ ADMIN API (Orders)
// ===============================
const STATUS_LABEL = {
  PLACED: "Đã đặt", CONFIRMED: "Đã xác nhận", PACKING: "Đang đóng gói",
  SHIPPED: "Đang giao", DELIVERED: "Đã giao", CANCELLED: "Đã huỷ",
  CANCEL_REQUESTED: "Chờ duyệt huỷ", FAILED: "Giao thất bại", RETURNED: "Hoàn/Trả",
};

function normalizeStatus(s) {
  if (!s) return "PLACED";
  if (s === "pending") return "PLACED";
  return String(s).trim();
}

function makeHistoryItem({ status, note, by = "admin" }) {
  return { status, note: (note || "").toString().slice(0, 200), at: Timestamp.now(), by };
}

async function syncUserOrder(orderId, userId, status) {
  if (!userId) return;
  await db.collection("accounts").doc(String(userId))
    .collection("orderHistory").doc(orderId)
    .set({ status, statusLabel: STATUS_LABEL[status], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

app.get("/admin/ping", requireAdmin, (req, res) =>
  res.json({ success: true, message: "pong", serverTime: new Date().toISOString() }));

app.post("/admin/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const status = normalizeStatus(req.body?.status);
    const note = (req.body?.note || "Admin cập nhật").toString().slice(0, 200);
    if (!STATUS_LABEL[status]) return res.status(400).json({ success: false, message: "Status không hợp lệ." });

    const ref = db.collection("orders").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Order không tồn tại." });
    if (normalizeStatus(doc.data()?.status) === "CANCEL_REQUESTED") {
      return res.status(400).json({ success: false, message: "Đơn đang chờ duyệt huỷ — dùng /approve-cancel hoặc /reject-cancel." });
    }

    await ref.update({ status, statusLabel: STATUS_LABEL[status], updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status, note })) });
    await syncUserOrder(id, doc.data().userId, status);
    res.json({ success: true, message: "Updated" });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: err.message }); }
});

app.post("/admin/orders/:id/approve-cancel", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const note = (req.body?.note || "Admin duyệt huỷ").toString().slice(0, 200);
    const ref = db.collection("orders").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Order không tồn tại." });
    if (normalizeStatus(doc.data()?.status) !== "CANCEL_REQUESTED") {
      return res.status(400).json({ success: false, message: "Đơn không ở trạng thái chờ duyệt huỷ." });
    }
    await ref.update({ status: "CANCELLED", statusLabel: STATUS_LABEL.CANCELLED,
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status: "CANCELLED", note })) });
    await syncUserOrder(id, doc.data().userId, "CANCELLED");
    res.json({ success: true, message: "Approved" });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: err.message }); }
});

app.post("/admin/orders/:id/reject-cancel", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const note = (req.body?.note || "Admin từ chối huỷ").toString().slice(0, 200);
    const ref = db.collection("orders").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Order không tồn tại." });
    if (normalizeStatus(doc.data()?.status) !== "CANCEL_REQUESTED") {
      return res.status(400).json({ success: false, message: "Đơn không ở trạng thái chờ duyệt huỷ." });
    }
    // Khôi phục đúng trạng thái trước đó (fix bug cũ luôn trả về CONFIRMED)
    const prevStatus = normalizeStatus(doc.data()?.previousStatus);
    const backStatus = STATUS_LABEL[prevStatus] ? prevStatus : "CONFIRMED";
    await ref.update({ status: backStatus, statusLabel: STATUS_LABEL[backStatus],
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status: backStatus, note })) });
    await syncUserOrder(id, doc.data().userId, backStatus);
    res.json({ success: true, message: "Rejected" });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: err.message }); }
});

// ===============================
// 🛡️ Error handler
// ===============================
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ success: false, message: "File quá lớn. Tối đa 5MB." });
  if (err.code === "INVALID_TYPE") return res.status(400).json({ success: false, message: err.message });
  console.error(err);
  res.status(500).json({ success: false, message: "Lỗi server." });
});

// ===============================
// ✅ Fallback
// ===============================
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ===============================
// 🚀 Start server
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚡ Server chạy tại http://localhost:${PORT}`));
