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
  const preloadRange = 3; // Preload 3 images ahead

  // --- Initialize ---
  function init() {
    totalNum.textContent = totalImages;
    createSlides();
    createThumbnails();
    initThumbnailObserver();
    createParticles();
    bindEvents();
    goToSlide(0, false);
    updateBackground(0);
  }

  // --- Create Slides ---
  function createSlides() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalImages; i++) {
      const slide = document.createElement("div");
      slide.className = "slide";
      slide.dataset.index = i;

      const img = document.createElement("img");
      img.alt = `Foto ${i + 1}`;
      img.dataset.src = `images/${images[i]}`;
      // Don't set src yet — lazy load
      img.addEventListener("click", () => openLightbox(i));

      slide.appendChild(img);
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

      const img = document.createElement("img");
      // Use data-src and let IntersectionObserver set `src` when needed
      img.loading = "lazy";
      img.decoding = "async";
      img.dataset.src = `images/${images[i]}`;
      img.alt = `Thumbnail ${i + 1}`;

      thumb.appendChild(img);
      thumb.addEventListener("click", () => {
        goToSlide(i);
        resetAutoplay();
      });
      fragment.appendChild(thumb);
    }
    thumbStrip.appendChild(fragment);
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

    const options = { root: thumbStrip, rootMargin: "400px", threshold: 0.01 };
    thumbObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target.querySelector("img");
        if (img && img.dataset && img.dataset.src && !img.src) {
          img.src = img.dataset.src;
          img.onload = () => img.classList.add("loaded");
          img.onerror = () => img.classList.add("loaded");
        }
        observer.unobserve(entry.target);
      });
    }, options);

    const thumbs = thumbStrip.querySelectorAll(".thumb");
    thumbs.forEach((t) => thumbObserver.observe(t));

    // After initial idle, load any remaining thumbnails in low-priority
    const idleCb =
      window.requestIdleCallback ||
      function (fn) {
        return setTimeout(fn, 1000);
      };
    idleCb(() => {
      thumbs.forEach((t) => {
        const img = t.querySelector("img");
        if (img && img.dataset && img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }
      });
    });
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

    // Update counter
    currentNum.textContent = currentIndex + 1;

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
    for (let offset = -1; offset <= preloadRange; offset++) {
      let idx = centerIndex + offset;
      if (idx < 0) idx += totalImages;
      if (idx >= totalImages) idx -= totalImages;

      const slideEl = slideTrack.children[idx];
      if (!slideEl) continue;
      const img = slideEl.querySelector("img");
      if (img && !img.src && img.dataset.src) {
        showLoader();
        img.src = img.dataset.src;
        img.onload = () => {
          img.classList.add("loaded");
          if (idx === currentIndex) hideLoader();
        };
        img.onerror = () => {
          img.classList.add("loaded");
          if (idx === currentIndex) hideLoader();
        };
      } else if (
        img &&
        img.classList.contains("loaded") &&
        idx === currentIndex
      ) {
        hideLoader();
      }
    }
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
