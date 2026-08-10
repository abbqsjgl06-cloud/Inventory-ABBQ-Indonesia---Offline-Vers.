if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(function () {});
}

document.addEventListener("authReady", (e) => {
  if (e.detail.role === "admin") {
    const card = document.getElementById("acctMgmtCard");
    if (card) card.style.display = "";
  }
});