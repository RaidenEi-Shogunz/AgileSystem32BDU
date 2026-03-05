// ===============================
// LẤY GIỎ HÀNG TỪ LOCAL STORAGE
// ===============================
function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

// ===============================
// LƯU GIỎ HÀNG
// ===============================
function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

// ===============================
// THÊM SẢN PHẨM VÀO GIỎ
// ===============================
function addToCart(product) {
  const cart = getCart();

  const exist = cart.find(p => p.key === product.key);

  if (exist) {
    exist.quantity += 1;
  } else {
    cart.push({
      key: product.key,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  saveCart(cart);

  alert("Đã thêm vào giỏ hàng!");
}

// ===============================
// HIỂN THỊ GIỎ HÀNG
// ===============================
function renderCart() {

  const cart = getCart();
  const cartTable = document.querySelector("#cart-items");

  if (!cartTable) return;

  cartTable.innerHTML = "";

  cart.forEach(p => {

    const row = `
      <tr>
        <td>${p.name}</td>
        <td>${p.price}</td>
        <td>${p.quantity}</td>
        <td>${p.price * p.quantity}</td>
      </tr>
    `;

    cartTable.innerHTML += row;

  });

}

// ===============================
// CHẠY KHI MỞ TRANG CART
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  renderCart();
});
