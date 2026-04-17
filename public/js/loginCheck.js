document.addEventListener("DOMContentLoaded", async () => {
    // Khởi tạo trạng thái mặc định
    if (!localStorage.getItem("loginStatus")) {
        localStorage.setItem("loginStatus", "logged_out");
    }

    const loginStatus = localStorage.getItem("loginStatus");
    const userData = JSON.parse(localStorage.getItem("loggedInUser") || "{}");
    const currentPath = window.location.pathname;

    // Các path chỉ dành cho admin (level >= 1)
    const adminPaths = ["/admin", "/admin.html", "/dashboard", "/manage-users"];
    const isAdminPage = adminPaths.some((p) => currentPath.includes(p));

    // Kiểm tra quyền admin (dựa vào data đã lưu + server sẽ verify lại khi gọi API)
    if (loginStatus === "logged_in" && isAdminPage) {
        const level = typeof userData.level === "number"
            ? userData.level
            : userData.level === "admin" ? 10 : 0;

        if (level < 1) {
            alert("Bạn không có quyền truy cập trang này!");
            window.location.href = "/";
            return;
        }
    }

    // Chặn trang cần đăng nhập
    const publicPaths = ["/login", "/login.html", "/register", "/register.html"];
    const isPublicPage = publicPaths.some((p) => currentPath.includes(p));

    if (loginStatus !== "logged_in" && !isPublicPage) {
        alert("Vui lòng đăng nhập để tiếp tục.");
        window.location.href = "/login.html";
        return;
    }

    // ======= Xử lý form đăng nhập =======
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector("button[type=submit]");
            if (btn) { btn.disabled = true; btn.textContent = "Đang đăng nhập..."; }

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;

            try {
                // Gọi server API thay vì query Firestore trực tiếp từ client
                const res = await fetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                });

                const data = await res.json();

                if (!data.success) {
                    alert(data.message || "Sai tên đăng nhập hoặc mật khẩu.");
                    return;
                }

                // Lưu token và thông tin user (không lưu password)
                localStorage.setItem("authToken", data.token);
                localStorage.setItem("loggedInUser", JSON.stringify(data.user));
                localStorage.setItem("loginStatus", "logged_in");
                window.location.href = "/";

            } catch (error) {
                console.error("Lỗi đăng nhập:", error);
                alert("Đăng nhập thất bại. Vui lòng thử lại.");
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = "Đăng nhập"; }
            }
        });
    }

    // ======= Xử lý đăng xuất =======
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("loggedInUser");
            localStorage.removeItem("authToken");
            localStorage.setItem("loginStatus", "logged_out");
            window.location.href = "/login.html";
        });
    }
});
