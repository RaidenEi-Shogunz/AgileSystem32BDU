// Quản lý Token và API
const AuthHandler = {
    // 1. Lấy Token hiện tại từ Firebase
    async getToken() {
        return new Promise((resolve) => {
            const unsubscribe = firebase.auth().onAuthStateChanged(async (user) => {
                unsubscribe();
                if (user) {
                    const token = await user.getIdToken();
                    resolve(token);
                } else {
                    resolve(null);
                }
            });
        });
    },

    // 2. Hàm gọi API có đính kèm Token (thay thế cho fetch thông thường)
    async fetchWithAuth(url, options = {}) {
        const token = await this.getToken();
        
        if (!token) {
            console.error("Chưa đăng nhập!");
            // window.location.href = "/login.html"; // Tùy chọn: Chuyển hướng nếu cần
            return null;
        }

        const authOptions = {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        return fetch(url, authOptions).then(res => res.json());
    },

    // 3. Kiểm tra quyền Admin khi vào các trang nhạy cảm
    async checkAdminAccess() {
        const token = await this.getToken();
        if (!token) return (window.location.href = "/login.html");

        const result = await firebase.auth().currentUser.getIdTokenResult();
        if (!result.claims.admin) {
            alert("Bạn không có quyền truy cập trang này!");
            window.location.href = "/index.html";
        }
    }
};