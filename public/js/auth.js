document.addEventListener("DOMContentLoaded", () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // 1. Kiểm tra trạng thái đăng nhập thực tế từ Firebase
    auth.onAuthStateChanged(async (user) => {
        const currentPage = window.location.pathname.split("/").pop() || "index.html";
        const adminPages = ["admin.html", "dashboard.html", "manage-users.html"];
        const authPages = ["login.html", "register.html"];

        if (user) {
            // Đã đăng nhập: Lưu vào localStorage để các script cũ của bạn không bị lỗi
            localStorage.setItem("loginStatus", "logged_in");
            
            // Lấy thêm dữ liệu từ Firestore (level, v.v.)
            const userDoc = await db.collection("accounts").doc(user.uid).get();
            const userData = { userId: user.uid, ...userDoc.data() };
            localStorage.setItem("loggedInUser", JSON.stringify(userData));

            // Chặn Admin Pages nếu không đủ quyền (level 0)
            if (adminPages.includes(currentPage) && userData.level === 0) {
                alert("Bạn không có quyền truy cập trang này!");
                window.location.href = "index.html";
            }

            // Nếu đang ở trang login mà đã đăng nhập rồi thì về trang chủ
            if (authPages.includes(currentPage)) {
                window.location.href = "index.html";
            }
        } else {
            // Đã đăng xuất: Dọn dẹp sạch sẽ
            localStorage.setItem("loginStatus", "logged_out");
            localStorage.removeItem("loggedInUser");

            // Nếu vào trang cần bảo mật mà chưa đăng nhập thì đá ra login
            if (!authPages.includes(currentPage) && currentPage !== "index.html") {
                window.location.href = "login.html";
            }
        }
    });

    // 2. Xử lý Đăng nhập (Khắc phục lỗi nháy mắt hoặc không phản hồi)
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("username").value.trim(); // Lưu ý: Firebase dùng Email
            const password = document.getElementById("password").value.trim();

            try {
                // Sử dụng hàm chuẩn của Firebase
                await auth.signInWithEmailAndPassword(email, password);
                window.location.href = "index.html";
            } catch (error) {
                console.error("Lỗi đăng nhập:", error);
                alert("Tài khoản hoặc mật khẩu không chính xác.");
            }
        });
    }

    // 3. Xử lý Đăng xuất (Fix lỗi bấm không ăn)
    // Sử dụng event delegation để đảm bảo nút logout luôn được bắt sự kiện kể cả khi render động
    document.addEventListener("click", async (e) => {
        if (e.target && (e.target.id === "logout-btn" || e.target.closest("#logout-btn"))) {
            e.preventDefault();
            try {
                await auth.signOut();
                // onAuthStateChanged sẽ tự động xử lý việc điều hướng
                window.location.href = "login.html";
            } catch (error) {
                console.error("Lỗi khi đăng xuất:", error);
            }
        }
    });
});