document.addEventListener("DOMContentLoaded", () => {
  const loginStatus = localStorage.getItem("loginStatus");
  const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || "null");

  const isLoggedIn = loginStatus === "logged_in" && !!loggedInUser;
  const isAdmin = isLoggedIn && Number(loggedInUser.level) === 1;

  // User nào cũng thấy track-order (nếu bạn muốn chỉ hiện khi đã login thì mình chỉnh thêm)
  const lowerbarHTML = `
    <nav class="lowerbar">
      <ul class="lowerbar-list">
        <li><a href="index.html">Trang chủ</a></li>
        <li><a href="track-order.html">🧾 Theo dõi đơn hàng</a></li>

        ${isAdmin ? `<li><a href="admin.html">🛠️ Admin Dashboard</a></li>` : ""}
      </ul>
    </nav>
  `;

  const container = document.getElementById("lowerbar-container");
  if (!container) return;

  container.innerHTML = lowerbarHTML;
});
