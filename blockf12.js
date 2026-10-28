(function () {
  "use strict";
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    return false;
  });
  document.addEventListener("copy", function (e) {
    if (
      e.target &&
      (e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        (e.target.closest && e.target.closest("input, textarea, .settings-modal, .mini-music-bar")))
    )
      return true;
    e.preventDefault();
    return false;
  });
  document.addEventListener("cut", function (e) {
    if (
      e.target &&
      (e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        (e.target.closest && e.target.closest("input, textarea, .settings-modal, .mini-music-bar")))
    )
      return true;
    e.preventDefault();
    return false;
  });
  document.addEventListener("selectstart", function (e) {
    if (window.isDraggingSlider) return true;
    if (
      e.target &&
      (e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        (e.target.closest && e.target.closest("input, textarea, .settings-modal, .mini-music-bar")))
    )
      return true;
    e.preventDefault();
    return false;
  });
  document.addEventListener("dragstart", function (e) {
    if (window.isDraggingSlider) return true;
    if (
      e.target &&
      (e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        (e.target.closest && e.target.closest("input, textarea, .settings-modal, .mini-music-bar")))
    )
      return true;
    e.preventDefault();
    return false;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "F12" || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if (e.ctrlKey && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if (e.ctrlKey && (e.key === "U" || e.key === "u")) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if (e.ctrlKey && ["s", "S", "p", "P"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if (e.ctrlKey && ["a", "A", "c", "C", "x", "X"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });
  setInterval(function () {
    console.clear();
  }, 1e3);
})();
