const admin = require("firebase-admin");
const fs = require("fs");

// Khởi tạo Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ==== [1] Upload Products ====
const uploadProducts = async () => {
    const productsRef = db.collection("products");
    const rawProductData = fs.readFileSync("product.json");
    const products = JSON.parse(rawProductData);

    for (const item of products) {
        try {
            await productsRef.doc(item.id.toString()).set(item);
            console.log(`✅ Uploaded product with id: ${item.id}`);
        } catch (error) {
            console.error(`❌ Error uploading product ${item.id}:`, error);
        }
    }
};
// ==== [7] Upload News ====
const uploadNews = async () => {
    const newsRef = db.collection("news");
    const rawNewsData = fs.readF    eSync("news.json");
    const news = JSON.parse(rawNewsData);

    for (const item of news) {
        try {
            await newsRef.doc(item.id.toString()).set(item);
            console.log(`✅ Uploaded news with id: ${item.id}`);
        } catch (error) {
            console.error(`❌ Error uploading product ${item.id}:`, error);
        }
    }
};

// ==== [2] Upload Banners ====
const uploadBanners = async () => {
    const bannersRef = db.collection("banners");
    const rawBannerData = fs.readFileSync("banners.json");
    const banners = JSON.parse(rawBannerData);

    for (const item of banners) {
        try {
            await bannersRef.doc(item.key).set(item);
            console.log(`✅ Uploaded banner with key: ${item.key}`);
        } catch (error) {
            console.error(`❌ Error uploading banner ${item.key}:`, error);
        }
    }
};

// ==== [3] Upload Accounts ====
const uploadAccounts = async () => {
    const accountsRef = db.collection("accounts");
    const rawAccountData = fs.readFileSync("accounts.json");
    const accounts = JSON.parse(rawAccountData);

    for (const account of accounts) {
        try {
            await accountsRef.doc(account.userId.toString()).set(account);
            console.log(`✅ Uploaded account with userId: ${account.userId}`);
        } catch (error) {
            console.error(`❌ Error uploading account ${account.userId}:`, error);
        }
    }
};

// ==== [4] Upload Carts ====
const uploadCarts = async () => {
    const cartsRef = db.collection("carts");
    const rawCartData = fs.readFileSync("cart.json");
    const carts = JSON.parse(rawCartData);

    for (const cart of carts) {
        try {
            await cartsRef.doc(cart.userId.toString()).set(cart);
            console.log(`✅ Uploaded cart for userId: ${cart.userId}`);
        } catch (error) {
            console.error(`❌ Error uploading cart for userId ${cart.userId}:`, error);
        }
    }
};

// ==== [5] Upload Reviews ====
const uploadReviews = async () => {

    const rawReviewData = fs.readFileSync("reviews.json");
    const reviews = JSON.parse(rawReviewData);

    for (const review of reviews) {
        const productId = review.id.toString();
        const userId = review.userId.toString(); // dùng làm doc ID

        try {
            await db
                .collection("products")
                .doc(productId)
                .collection("reviews")
                .doc(userId) // mỗi user chỉ 1 review
                .set(review);
            console.log(`✅ Uploaded review by user ${userId} for product ${productId}`);
        } catch (error) {
            console.error(`❌ Error uploading review for product ${productId} by user ${userId}:`, error);
        }
    }
};
// ==== [7] Upload Carts to Subcollection of Accounts ====
const uploadCartsToAccounts = async () => {
    const rawCartData = fs.readFileSync("cart.json");
    const carts = JSON.parse(rawCartData);

    for (const cart of carts) {
        const userId = cart.userId.toString();
        const cartRef = db.collection("accounts").doc(userId).collection("cart");

        for (let i = 0; i < cart.items.length; i++) {
            const item = cart.items[i];
            const docId = i.toString();

            try {
                await cartRef.doc(docId).set({
                    id: item.id,
                    quantity: item.quantity
                });
            } catch (error) {
                console.error(`❌ Error uploading item ${item.id} for user ${userId}:`, error);
            }
        }

        console.log(`✅ Uploaded cart for user ${userId}`);
    }
};

// ==== [6] Clear Reviews in All Products ====
const clearReviews = async () => {
    const productsSnapshot = await db.collection("products").get();
    for (const doc of productsSnapshot.docs) {
        const productId = doc.id;
        const reviewsRef = db.collection("products").doc(productId).collection("reviews");

        const reviewsSnapshot = await reviewsRef.get();
        const batch = db.batch();

        reviewsSnapshot.forEach(reviewDoc => {
            batch.delete(reviewDoc.ref);
        });

        if (!reviewsSnapshot.empty) {
            await batch.commit();
            console.log(`🗑️ Cleared reviews for product ${productId}`);
        } else {
            console.log(`✅ No reviews to clear for product ${productId}`);
        }
    }
};


// ==== Chạy tùy chọn theo tham số dòng lệnh ====
const run = async () => {
    const arg = process.argv[2];

    switch (arg) {
        case "products":
            await uploadProducts();
            break;
        case "banners":
            await uploadBanners();
            break;
        case "accounts":
            await uploadAccounts();
            break;
        case "carts":
            await uploadCarts();
            break;
        case "reviews":
            await uploadReviews();
            break;
        case "all":
            await uploadProducts();
            await uploadBanners();
            await uploadAccounts();
            await uploadCarts();
            await uploadReviews();
            break;
        case "carts-to-accounts":
            await uploadCartsToAccounts();
            break;
        case "clear-reviews":
            await clearReviews();
            break;
        case "news":
            await uploadNews();
            break;
        default:
            console.log(`
❌ Sai hoặc thiếu tham số! Cách dùng:
  node upload.js products   → upload sản phẩm
  node upload.js banners    → upload banner
  node upload.js accounts   → upload tài khoản
  node upload.js carts      → upload giỏ hàng
  node upload.js reviews    → upload đánh giá
  node upload.js all        → upload toàn bộ
`);
            break;
    }
};

run().catch((err) => {
    console.error("🔥 Lỗi tổng thể:", err);
});
