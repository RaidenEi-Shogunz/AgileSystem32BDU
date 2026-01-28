document.addEventListener("DOMContentLoaded", async () => {
    const db = firebase.firestore();

    // Nếu chưa có trạng thái đăng nhập, thì đặt là "logged_out"
    if (!localStorage.getItem("loginStatus")) {
        localStorage.setItem("loginStatus", "logged_out");
    }

    // Kiểm tra nếu người dùng đang đăng nhập
    const loginStatus = localStorage.getItem("loginStatus");
    const userData = JSON.parse(localStorage.getItem("loggedInUser") || "{}");

    // Trang hiện tại
    const currentPage = window.location.pathname.split("/").pop();

    // Danh sách các trang chỉ dành cho Admin (level 1)
    const adminPages = ["admin.html", "dashboard.html", "manage-users.html"]; // sửa theo thực tế

    // Nếu đang đăng nhập nhưng user không đủ quyền -> chặn
    if (loginStatus === "logged_in") {
        if (userData.level === 0 && adminPages.includes(currentPage)) {
            alert("Bạn không có quyền truy cập trang này!");
            window.location.href = "index.html"; // hoặc trang nào khác dành cho user thường
            return;
        }
    }

    // Nếu chưa đăng nhập và đang cố vào trang không phải login.html
    if (loginStatus !== "logged_in" && currentPage !== "login.html") {
        alert("Vui lòng đăng nhập để tiếp tục.");
        window.location.href = "login.html";
        return;
    }

    // Xử lý đăng nhập
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value.trim();

            try {
                const snapshot = await db
                    .collection("accounts")
                    .where("username", "==", username)
                    .where("password", "==", password)
                    .get();

                if (snapshot.empty) {
                    alert("Sai tên đăng nhập hoặc mật khẩu.");
                    return;
                }

                const userDoc = snapshot.docs[0];
                const userData = { userId: userDoc.id, ...userDoc.data() }; // ✅ gắn userId
                localStorage.setItem("loggedInUser", JSON.stringify(userData));

                localStorage.setItem("loggedInUser", JSON.stringify(userData));
                localStorage.setItem("loginStatus", "logged_in");
                window.location.href = "index.html";
            } catch (error) {
                console.error("Lỗi đăng nhập Firestore:", error);
                alert("Đăng nhập thất bại. Vui lòng thử lại.");
            }
        });
    }

    // Xử lý đăng xuất
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("loggedInUser");
            localStorage.setItem("loginStatus", "logged_out");
            window.location.href = "login.html";
        });
    }
});
