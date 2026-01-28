window.redirect = function (productId) {
    window.location.href = `detail.html?id=${productId}`;
};
function goToCategory(category) {
    const url = new URL(window.location.origin + "/product-list.html");
    url.searchParams.set("category", category);
    window.location.href = url.toString();
}
function goToGrade(grade) {
    const url = new URL(window.location.origin + "/product-list.html");
    url.searchParams.set("grade", grade);
    window.location.href = url.toString();
}