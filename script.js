/* ============================================
   Pinangan Bana & Bella — Slide Online
   Interactive Slideshow Engine
   ============================================ */

(function () {
  "use strict";

  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const bgCurrent = $("#bg-current");
  const bgNext = $("#bg-next");
  const header = $("#header");
  const slideViewport = $("#slide-viewport");
  const slideTrack = $("#slide-track");
  const slideLoader = $("#slide-loader");
  const prevBtn = $("#prev-btn");
  const nextBtn = $("#next-btn");
  const playBtn = $("#play-btn");
  const iconPlay = $("#icon-play");
  const iconPause = $("#icon-pause");
  const progressTrack = $("#progress-track");
  const progressFill = $("#progress-fill");
  const progressThumb = $("#progress-thumb");
  const currentNum = $("#current-num");
  const totalNum = $("#total-num");
  const controls = $("#controls");
  const thumbStrip = $("#thumb-strip");
  const fullscreenBtn = $("#fullscreen-btn");
  const fsExpand = $("#fs-expand");
  const fsCollapse = $("#fs-collapse");
  const lightbox = $("#lightbox");
  const lightboxImg = $("#lightbox-img");
  const lightboxClose = $("#lightbox-close");
  const particlesContainer = $("#particles");

  // --- State ---
  let currentIndex = 0;
  let isPlaying = false;
  let slideInterval = null;
  let progressInterval = null;
  let speed = 3000;
  let progressStartTime = 0;
  let autoHideTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let isDragging = false;
  const totalImages = images.length;
  const preloadRange = 1; // Preload only the current image and the nearest neighbor
  const imageCache = new Set();
  const thumbRenderRadius = 14; // render only nearby thumbnails initially
  const thumbUnloadRadius = 28; // keep a wider buffer before unloading
  let visibleThumbStart = 0;
  let visibleThumbEnd = -1;
  let deferredPreloadId = null;

  // --- Initialize ---
  function init() {
    totalNum.textContent = totalImages;
    createSlides();
    createThumbnails();
    updateVisibleThumbnails(0);
    initThumbnailObserver();
    createParticles();
    bindEvents();
    preloadPriorityImages(0, 1, 2);
    goToSlide(0, false);
    updateBackground(0);
  }

  function getImageName(filename) {
    return filename.replace(/\.[^/.]+$/, "");
  }

  function updateSlideCaption(index) {
    const slide = slideTrack.children[index];
    if (!slide) return;
    const caption = slide.querySelector(".slide-caption");
    if (caption) {
      caption.textContent = getImageName(images[index]);
    }
  }

  // --- Create Slides ---
  function createSlides() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalImages; i++) {
      const slide = document.createElement("div");
      slide.className = "slide";
      slide.dataset.index = i;

      const media = document.createElement("div");
      media.className = "slide-media";

      const img = document.createElement("img");
      img.alt = getImageName(images[i]);
      img.loading = "lazy";
      img.decoding = "async";
      img.dataset.src = `images/${images[i]}`;
      // Don't set src yet — lazy load slides and preload only nearby images
      img.addEventListener("click", () => openLightbox(i));

      const caption = document.createElement("div");
      caption.className = "slide-caption";
      caption.textContent = getImageName(images[i]);

      media.appendChild(img);
      media.appendChild(caption);
      slide.appendChild(media);
      fragment.appendChild(slide);
    }
    slideTrack.appendChild(fragment);
  }

  // --- Create Thumbnails ---
  function createThumbnails() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalImages; i++) {
      const thumb = document.createElement("div");
      thumb.className = "thumb";
      thumb.dataset.index = i;
      thumb.dataset.src = `images/${images[i]}`;

      if (i <= thumbRenderRadius) {
        const img = createThumbImage(i);
        thumb.appendChild(img);
      }

      thumb.addEventListener("click", () => {
        goToSlide(i);
        resetAutoplay();
      });
      fragment.appendChild(thumb);
    }
    thumbStrip.appendChild(fragment);
  }

  function createThumbImage(index) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.src = `images/${images[index]}`;
    img.alt = `Thumbnail ${index + 1}`;
    img.className = "thumb-img";
    img.src = img.dataset.src;
    img.onload = () => img.classList.add("loaded");
    img.onerror = () => img.classList.add("loaded");
    return img;
  }

  function ensureThumbImage(index) {
    const thumb = thumbStrip.children[index];
    if (!thumb || thumb.querySelector("img")) return;
    const img = createThumbImage(index);
    thumb.appendChild(img);
  }

  function unloadThumbImage(index) {
    const thumb = thumbStrip.children[index];
    if (!thumb) return;
    const img = thumb.querySelector("img");
    if (img) {
      thumb.removeChild(img);
    }
  }

  function updateVisibleThumbnails(centerIndex) {
    const start = Math.max(0, centerIndex - thumbRenderRadius);
    const end = Math.min(totalImages - 1, centerIndex + thumbRenderRadius);

    for (let i = start; i <= end; i++) {
      ensureThumbImage(i);
    }

    if (visibleThumbEnd >= 0) {
      for (let i = visibleThumbStart; i < start; i++) {
        if (i < centerIndex - thumbUnloadRadius) unloadThumbImage(i);
      }
      for (let i = end + 1; i <= visibleThumbEnd; i++) {
        if (i > centerIndex + thumbUnloadRadius) unloadThumbImage(i);
      }
    }

    visibleThumbStart = start;
    visibleThumbEnd = end;
  }

  // --- Thumbnail lazy-loading via IntersectionObserver ---
  let thumbObserver = null;

  function initThumbnailObserver() {
    if (!("IntersectionObserver" in window)) {
      // Fallback: eager-load first N thumbnails
      const imgs = thumbStrip.querySelectorAll(".thumb img");
      imgs.forEach((img, idx) => {
        if (idx < 30 && img.dataset && img.dataset.src)
          img.src = img.dataset.src;
      });
      return;
    }

    const options = { root: thumbStrip, rootMargin: "300px", threshold: 0.01 };
    thumbObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const thumb = entry.target;
        const index = Number(thumb.dataset.index);
        if (Math.abs(index - currentIndex) <= thumbUnloadRadius) {
          ensureThumbImage(index);
        }
        observer.unobserve(thumb);
      });
    }, options);

    const thumbs = thumbStrip.querySelectorAll(".thumb");
    thumbs.forEach((t) => thumbObserver.observe(t));

    // After initial idle, load the nearest thumbnail window only
    const idleCb =
      window.requestIdleCallback ||
      function (fn) {
        return setTimeout(fn, 1000);
      };
    idleCb(() => {
      const start = Math.max(0, currentIndex - thumbRenderRadius);
      const end = Math.min(totalImages - 1, currentIndex + thumbRenderRadius);
      for (let i = start; i <= end; i++) {
        ensureThumbImage(i);
      }
    });
  }

  // --- Image Loading Helpers ---
  function preloadPriorityImages(...indices) {
    indices.forEach((index) => {
      if (index < 0 || index >= totalImages) return;
      const href = `images/${images[index]}`;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      link.fetchPriority = "high";
      document.head.appendChild(link);
    });
  }

  function loadSlideImage(img, priority = false) {
    if (!img || !img.dataset.src || img.src) return;
    if (imageCache.has(img.dataset.src)) {
      img.src = img.dataset.src;
      img.classList.add("loaded");
      return;
    }

    img.loading = priority ? "eager" : "lazy";
    img.decoding = "async";
    if (priority) {
      img.fetchPriority = "high";
    }

    img.src = img.dataset.src;
    img.onload = () => {
      imageCache.add(img.dataset.src);
      img.classList.add("loaded");
      if (img.closest(".slide")?.dataset.index === String(currentIndex))
        hideLoader();
    };
    img.onerror = () => {
      imageCache.add(img.dataset.src);
      img.classList.add("loaded");
      if (img.closest(".slide")?.dataset.index === String(currentIndex))
        hideLoader();
    };
  }

  // --- Create Floating Particles ---
  function createParticles() {
    for (let i = 0; i < 15; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.style.left = Math.random() * 100 + "%";
      particle.style.width = Math.random() * 3 + 1 + "px";
      particle.style.height = particle.style.width;
      particle.style.animationDuration = Math.random() * 15 + 10 + "s";
      particle.style.animationDelay = Math.random() * 10 + "s";
      particlesContainer.appendChild(particle);
    }
  }

  // --- Navigation ---
  function goToSlide(index, animate = true) {
    if (index < 0) index = totalImages - 1;
    if (index >= totalImages) index = 0;

    currentIndex = index;

    // Move track
    const offset = -currentIndex * 100;
    slideTrack.style.transition = animate
      ? "transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
      : "none";
    slideTrack.style.transform = `translateX(${offset}%)`;

    // Load current + nearby images
    preloadImages(currentIndex);
    scheduleDeferredPreload(currentIndex);
    updateVisibleThumbnails(currentIndex);

    // Update counter
    currentNum.textContent = currentIndex + 1;

    // Update slide caption
    updateSlideCaption(currentIndex);

    // Update progress
    updateProgressBar();

    // Update background
    updateBackground(currentIndex);

    // Update thumbnails
    updateActiveThumbnail();

    // Scroll thumbnail into view
    scrollThumbIntoView(currentIndex);
  }

  function nextSlide() {
    goToSlide(currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(currentIndex - 1);
  }

  // --- Image Preloading ---
  function preloadImages(centerIndex) {
    clearDeferredPreload();
    for (let offset = -1; offset <= preloadRange; offset++) {
      let idx = centerIndex + offset;
      if (idx < 0) idx += totalImages;
      if (idx >= totalImages) idx -= totalImages;

      const slideEl = slideTrack.children[idx];
      if (!slideEl) continue;
      const img = slideEl.querySelector("img");
      if (img && !img.src && img.dataset.src) {
        if (idx === currentIndex) showLoader();
        loadSlideImage(img, idx === currentIndex);
      } else if (
        img &&
        img.classList.contains("loaded") &&
        idx === currentIndex
      ) {
        hideLoader();
      }
    }
  }

  function scheduleDeferredPreload(centerIndex) {
    clearDeferredPreload();
    deferredPreloadId = window.requestIdleCallback
      ? window.requestIdleCallback(() => deferredPreload(centerIndex))
      : setTimeout(() => deferredPreload(centerIndex), 300);
  }

  function clearDeferredPreload() {
    if (!deferredPreloadId) return;
    if (window.cancelIdleCallback && typeof deferredPreloadId === "number") {
      window.cancelIdleCallback(deferredPreloadId);
    } else {
      clearTimeout(deferredPreloadId);
    }
    deferredPreloadId = null;
  }

  function deferredPreload(centerIndex) {
    const nextIndex = (centerIndex + 1) % totalImages;
    const prevIndex = (centerIndex - 1 + totalImages) % totalImages;
    [nextIndex, prevIndex].forEach((idx) => {
      const slideEl = slideTrack.children[idx];
      if (!slideEl) return;
      const img = slideEl.querySelector("img");
      if (img && !img.src && img.dataset.src) {
        loadSlideImage(img, false);
      }
    });
  }

  function showLoader() {
    slideLoader.classList.add("visible");
  }

  function hideLoader() {
    slideLoader.classList.remove("visible");
  }

  // --- Background ---
  function updateBackground(index) {
    const imgUrl = `images/${images[index]}`;
    const bgLoader = new Image();
    bgLoader.src = imgUrl;
    bgLoader.onload = () => swapBackground(imgUrl);
    bgLoader.onerror = () => swapBackground(imgUrl);
  }

  function swapBackground(imgUrl) {
    if (bgCurrent.classList.contains("active")) {
      bgNext.style.backgroundImage = `url('${imgUrl}')`;
      bgNext.classList.add("active");
      bgCurrent.classList.remove("active");
    } else {
      bgCurrent.style.backgroundImage = `url('${imgUrl}')`;
      bgCurrent.classList.add("active");
      bgNext.classList.remove("active");
    }
  }

  // --- Progress Bar ---
  function updateProgressBar() {
    const pct = (currentIndex / (totalImages - 1)) * 100;
    progressFill.style.width = pct + "%";
    progressThumb.style.left = pct + "%";
  }

  // --- Thumbnails ---
  function updateActiveThumbnail() {
    const thumbs = thumbStrip.querySelectorAll(".thumb");
    thumbs.forEach((t, i) => {
      t.classList.toggle("active", i === currentIndex);
    });
  }

  function scrollThumbIntoView(index) {
    const thumb = thumbStrip.children[index];
    if (!thumb) return;
    const stripRect = thumbStrip.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();

    if (thumbRect.left < stripRect.left || thumbRect.right > stripRect.right) {
      thumb.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }

  // --- Autoplay ---
  function startAutoplay() {
    if (isPlaying) return;
    isPlaying = true;
    iconPlay.classList.add("hidden");
    iconPause.classList.remove("hidden");
    playBtn.setAttribute("aria-label", "Pause");
    scheduleNextSlide();
  }

  function stopAutoplay() {
    isPlaying = false;
    iconPlay.classList.remove("hidden");
    iconPause.classList.add("hidden");
    playBtn.setAttribute("aria-label", "Play");
    clearTimeout(slideInterval);
    slideInterval = null;
  }

  function toggleAutoplay() {
    isPlaying ? stopAutoplay() : startAutoplay();
  }

  function scheduleNextSlide() {
    clearTimeout(slideInterval);
    if (!isPlaying) return;
    slideInterval = setTimeout(() => {
      nextSlide();
      scheduleNextSlide();
    }, speed);
  }

  function resetAutoplay() {
    if (isPlaying) {
      clearTimeout(slideInterval);
      scheduleNextSlide();
    }
  }

  // --- Lightbox ---
  function openLightbox(index) {
    lightboxImg.loading = "lazy";
    lightboxImg.decoding = "async";
    lightboxImg.src = `images/${images[index]}`;
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => {
      lightboxImg.src = "";
    }, 400);
  }

  // --- Fullscreen ---
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      fsExpand.classList.add("hidden");
      fsCollapse.classList.remove("hidden");
    } else {
      document.exitFullscreen();
      fsExpand.classList.remove("hidden");
      fsCollapse.classList.add("hidden");
    }
  }

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      fsExpand.classList.remove("hidden");
      fsCollapse.classList.add("hidden");
    }
  });

  // --- Auto-hide UI ---
  function showUI() {
    header.classList.remove("auto-hide");
    controls.classList.remove("auto-hide");
    thumbStrip.classList.remove("auto-hide");
    resetAutoHideTimer();
  }

  function hideUI() {
    if (!isPlaying) return;
    header.classList.add("auto-hide");
    controls.classList.add("auto-hide");
    thumbStrip.classList.add("auto-hide");
  }

  function resetAutoHideTimer() {
    clearTimeout(autoHideTimer);
    if (isPlaying) {
      autoHideTimer = setTimeout(hideUI, 4000);
    }
  }

  // --- Progress bar click / seek ---
  function handleProgressSeek(e) {
    const rect = progressTrack.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const targetIndex = Math.round(pct * (totalImages - 1));
    goToSlide(targetIndex);
    resetAutoplay();
  }

  // --- Touch / Swipe ---
  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isDragging = true;
  }

  function handleTouchEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
      resetAutoplay();
    }
  }

  // --- Keyboard ---
  function handleKeydown(e) {
    if (lightbox.classList.contains("open")) {
      if (e.key === "Escape") closeLightbox();
      return;
    }

    switch (e.key) {
      case "ArrowLeft":
        prevSlide();
        resetAutoplay();
        break;
      case "ArrowRight":
        nextSlide();
        resetAutoplay();
        break;
      case " ":
        e.preventDefault();
        toggleAutoplay();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "Escape":
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        break;
    }
    showUI();
  }

  // --- Bind Events ---
  function bindEvents() {
    // Navigation
    prevBtn.addEventListener("click", () => {
      prevSlide();
      resetAutoplay();
    });
    nextBtn.addEventListener("click", () => {
      nextSlide();
      resetAutoplay();
    });

    // Play/Pause
    playBtn.addEventListener("click", toggleAutoplay);

    // Speed selector
    $$(".speed-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".speed-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        speed = parseInt(btn.dataset.speed);
        resetAutoplay();
      });
    });

    // Progress seek
    progressTrack.addEventListener("click", handleProgressSeek);

    // Fullscreen
    fullscreenBtn.addEventListener("click", toggleFullscreen);

    // Lightbox
    lightboxClose.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    // Touch / Swipe on viewport
    slideViewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    slideViewport.addEventListener("touchend", handleTouchEnd);

    // Keyboard
    document.addEventListener("keydown", handleKeydown);

    // Mouse movement for auto-hide
    document.addEventListener("mousemove", showUI);
    document.addEventListener("touchstart", showUI, { passive: true });

    // Mouse wheel for navigation
    slideViewport.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (e.deltaY > 0 || e.deltaX > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
        resetAutoplay();
      },
      { passive: false },
    );
  }

  // --- Start ---
  document.addEventListener("DOMContentLoaded", init);
})();
