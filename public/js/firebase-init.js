// Cấu hình Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCNCclEr-Xl8J1Js-gZCiL1rsy-6Qj6_ts",
    authDomain: "laptrinhweb-8465b.firebaseapp.com",
    projectId: "laptrinhweb-8465b",
    storageBucket: "laptrinhweb-8465b.firebasestorage.app",
    messagingSenderId: "9472668223",
    appId: "1:9472668223:web:96c8d6be8b0d313de97e8a",
    measurementId: "G-9XG7KRMYD2"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Nếu cần Analytics, phải thêm SDK analytics riêng (không bắt buộc cho Firestore)
