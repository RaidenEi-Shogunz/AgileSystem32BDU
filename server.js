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
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ===============================
// 🛡️ Middlewares Xác thực & Phân quyền
// ===============================

// 1. Kiểm tra Token hợp lệ
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Yêu cầu đăng nhập." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken; // Chứa uid, email, và custom claims (admin)
    next();
  } catch (error) {
    console.error("Auth Error:", error.message);
    return res.status(403).json({ success: false, message: "Phiên làm việc hết hạn." });
  }
};

// 2. Kiểm tra quyền Admin
const checkAdmin = (req, res, next) => {
  if (req.user && req.user.admin === true) {
    next();
  } else {
    res.status(403).json({ success: false, message: "Bạn không có quyền quản trị viên." });
  }
};

// ===============================
// 🧩 Helpers
// ===============================
function slugify(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

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

function makeHistoryItem({ status, note, by = "admin" }) {
  return { status, note: (note || "").toString().slice(0, 200), at: Timestamp.now(), by };
}

// ===============================
// 🚀 App Setup
// ===============================
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ===============================
// 👤 API Quản lý tài khoản (Mới)
// ===============================

// Lấy thông tin cá nhân (Profile)
app.get("/api/me", authenticate, async (req, res) => {
  try {
    const userDoc = await db.collection("accounts").doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ." });
    res.json({ success: true, user: userDoc.data() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật Profile
app.post("/api/update-profile", authenticate, async (req, res) => {
  try {
    const { displayName, phoneNumber, address } = req.body;
    await db.collection("accounts").doc(req.user.uid).set({
      displayName,
      phoneNumber,
      address,
      email: req.user.email,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    res.json({ success: true, message: "Cập nhật thành công!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===============================
// 🌐 SEO Friendly URLs
// ===============================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/products", (req, res) => res.sendFile(path.join(__dirname, "public", "product-list.html")));
app.get("/product/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "detail.html")));

// ===============================
// 🖼️ Multer Configuration
// ===============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "public", "images", "products");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = (file.originalname || "image").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    cb(null, `${Date.now()}_${safeName}`);
  },
});
const upload = multer({ storage });

// ===============================
// 📦 Sản phẩm (Yêu cầu Admin)
// ===============================
app.post("/upload", authenticate, checkAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Không có ảnh." });

  try {
    const { name, price, discount, grade, brand, category1, slug: slugInput } = req.body;
    const imageUrl = `/images/products/${req.file.filename}`;
    const uniqueSlug = await ensureUniqueSlug(slugify(slugInput || name));

    const newProduct = {
      name: String(name || ""),
      slug: uniqueSlug,
      price: parseInt(price) || 0,
      discount: parseInt(discount) || 0,
      grade: String(grade || ""),
      brand: String(brand || ""),
      category1: String(category1 || ""),
      image: imageUrl,
      createdAt: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("products").add(newProduct);
    res.json({ success: true, id: ref.id, slug: uniqueSlug });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===============================
// ✅ Quản lý Đơn hàng (Yêu cầu Admin)
// ===============================
const STATUS_LABEL = {
  PLACED: "Đã đặt", CONFIRMED: "Đã xác nhận", SHIPPED: "Đang giao",
  DELIVERED: "Đã giao", CANCELLED: "Đã huỷ", CANCEL_REQUESTED: "Chờ duyệt huỷ"
};

app.post("/admin/orders/:id/status", authenticate, checkAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const status = req.body?.status;
    if (!STATUS_LABEL[status]) return res.status(400).json({ success: false, message: "Status không hợp lệ." });

    const ref = db.collection("orders").doc(id);
    await ref.update({
      status,
      statusLabel: STATUS_LABEL[status],
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion(makeHistoryItem({ status, note: req.body.note })),
    });

    res.json({ success: true, message: "Cập nhật đơn hàng thành công." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===============================
// 📦 Static & Fallback
// ===============================
app.use(express.static("public"));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`⚡ Server chạy tại http://localhost:${PORT}`));