/*
  CINOVA - aplikasi katalog film
  Isi films.json di GitHub, lalu masukkan URL RAW GitHub pada DATABASE_URL.
*/

const DATABASE_URL =
  "https://raw.githubusercontent.com/Bey297/cinova/refs/heads/main/database/films.json";

const FILMS_PER_PAGE = 12;
const CACHE_KEY = "cinova_films_cache";
const FAVORITES_KEY = "cinova_favorite_films";

let allFilms = [];
let visibleFilms = [];                 let currentPage = 1;
let recommendedFilm = null;
let currentDetailFilm = null;
let activeView = "home";
let favorites = loadFavorites();

const el = {
  grid: document.getElementById("movieGrid"),
  pagination: document.getElementById("pagination"),
  count: document.getElementById("filmCount"),
  status: document.getElementById("statusMessage"),
  empty: document.getElementById("emptyMessage"),
  search: document.getElementById("searchInput"),
  refresh: document.getElementById("refreshButton"),
  recommendPoster: document.getElementById("recommendPoster"),
  recommendTitle: document.getElementById("recommendTitle"),
  recommendMeta: document.getElementById("recommendMeta"),
  recommendDescription: document.getElementById("recommendDescription"),
  recommendWatch: document.getElementById("recommendWatch"),
  catalogTitle: document.getElementById("catalogTitle"),
  dialog: document.getElementById("detailDialog"),
  detailPoster: document.getElementById("detailPoster"),
  detailTitle: document.getElementById("detailTitle"),
  detailMeta: document.getElementById("detailMeta"),
  detailDescription: document.getElementById("detailDescription"),
  detailWatch: document.getElementById("detailWatch"),
  detailFavorite: document.getElementById("detailFavorite")
};

function loadFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
}

function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function filmKey(film) {
  // URL film menjadi ID stabil. Jika URL tidak ada, gunakan judul + tahun.
  return text(film.url) || `${text(film.judul)}-${text(film.tahun)}`;
}

function isValidFilm(film) {
  return film && typeof film === "object" &&
    typeof film.judul === "string" &&
    (typeof film["link-icon-besar"] === "string" ||
     typeof film["link-icon-kecil"] === "string");
}

function metadata(film) {
  return [
    film.ratting !== undefined ? `⭐ ${film.ratting}` : "",
    film.tahun ? String(film.tahun) : "",
    film.genre || ""
  ].filter(Boolean).join(" • ");
}

function setStatus(message) {
  el.status.textContent = message;
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".bottom-nav a").forEach(link => {
    link.classList.remove("active");
    link.removeAttribute("aria-current");
  });

  const activeId = view === "home" ? "homeNav" :
    view === "films" ? "filmsNav" : "favoritesNav";
  const activeLink = document.getElementById(activeId);
  activeLink.classList.add("active");
  activeLink.setAttribute("aria-current", "page");

  el.catalogTitle.textContent =
    view === "favorites" ? "Film Favorit" :
    view === "films" ? "Semua Film" : "Film Terbaru";

  el.search.placeholder = view === "favorites"
    ? "Cari film favorit..." : "Cari judul film...";
  applyFilters();

  if (view !== "home") {
    document.querySelector(".catalog-section").scrollIntoView({ behavior: "smooth" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function renderRecommendation() {
  if (!recommendedFilm) {
    el.recommendTitle.textContent = "Belum ada rekomendasi";
    el.recommendMeta.textContent = "Tambahkan film ke films.json";
    el.recommendDescription.textContent = "";
    el.recommendPoster.style.backgroundImage = "";
    el.recommendWatch.disabled = true;
    return;
  }

  el.recommendTitle.textContent = recommendedFilm.judul;
  el.recommendMeta.textContent = metadata(recommendedFilm);
  el.recommendDescription.textContent =
    text(recommendedFilm.deskripsi, "Film pilihan CINOVA.");
  const poster = recommendedFilm["link-icon-besar"] ||
    recommendedFilm["link-icon-kecil"];
  el.recommendPoster.style.backgroundImage = `url("${poster}")`;
  el.recommendWatch.disabled = !recommendedFilm.url;
  el.recommendWatch.onclick = () => openWatch(recommendedFilm);
}

function chooseRecommendation() {
  recommendedFilm = allFilms[0] || null;
  renderRecommendation();
}

function openWatch(film) {
  if (!film || !film.url) {
    setStatus("Tautan video untuk film ini belum tersedia.");
    return;
  }

  window.open(film.url, "_blank", "noopener,noreferrer");
}

function toggleFavorite(film) {
  const key = filmKey(film);
  if (favorites.has(key)) {
    favorites.delete(key);
  } else {
    favorites.add(key);
  }
  saveFavorites();

  if (currentDetailFilm && filmKey(currentDetailFilm) === key) {
    updateDetailFavoriteButton();
  }

  applyFilters();
}

function updateDetailFavoriteButton() {
  if (!currentDetailFilm) return;
  const saved = favorites.has(filmKey(currentDetailFilm));
  el.detailFavorite.classList.toggle("saved", saved);
  el.detailFavorite.textContent = saved ? "♥ Tersimpan" : "♡ Tambah Favorit";
}

function openDetails(film) {
  currentDetailFilm = film;
  el.detailPoster.src = film["link-icon-besar"] || film["link-icon-kecil"] || "";
  el.detailPoster.alt = film.judul;
  el.detailTitle.textContent = film.judul;
  el.detailMeta.textContent = [
    metadata(film),
    film.duration ? `Durasi ${film.duration}` : ""
  ].filter(Boolean).join(" • ");
  el.detailDescription.textContent =
    text(film.deskripsi, "");
  el.detailWatch.disabled = !film.url;
  el.detailWatch.onclick = () => openWatch(film);
  updateDetailFavoriteButton();

  if (typeof el.dialog.showModal === "function") {
    el.dialog.showModal();
  } else {
    openWatch(film);
  }
}

function renderMovies() {
  const totalPages = Math.max(1, Math.ceil(visibleFilms.length / FILMS_PER_PAGE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * FILMS_PER_PAGE;
  const pageFilms = visibleFilms.slice(start, start + FILMS_PER_PAGE);

  el.grid.replaceChildren();

  pageFilms.forEach(film => {
    const card = document.createElement("article");
    card.className = "movie-card";

    const image = document.createElement("img");
    image.className = "movie-poster";
    image.src = film["link-icon-kecil"] || film["link-icon-besar"];
    image.alt = film.judul;
    image.loading = "lazy";
    image.addEventListener("click", () => openDetails(film));
    image.onerror = () => {
      image.removeAttribute("src");
      image.alt = "Poster tidak tersedia";
    };

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "movie-favorite";
    const saved = favorites.has(filmKey(film));
    favoriteButton.classList.toggle("saved", saved);
    favoriteButton.textContent = saved ? "♥" : "♡";
    favoriteButton.setAttribute("aria-label",
      saved ? "Hapus dari favorit" : "Tambah ke favorit");
    favoriteButton.addEventListener("click", event => {
      event.stopPropagation();
      toggleFavorite(film);
    });

    const title = document.createElement("h3");
    title.className = "movie-title";
    title.textContent = film.judul;
    title.addEventListener("click", () => openDetails(film));

    const meta = document.createElement("div");
    meta.className = "movie-meta";
    meta.textContent = [
      film.tahun ? String(film.tahun) : "",
      film.ratting !== undefined ? `⭐ ${film.ratting}` : ""
    ].filter(Boolean).join(" • ");

    card.append(image, favoriteButton, title, meta);
    el.grid.appendChild(card);
  });

  el.count.textContent = `${visibleFilms.length} film`;
  el.empty.hidden = visibleFilms.length !== 0;
  el.empty.textContent = activeView === "favorites"
    ? "Belum ada film favorit. Tekan ikon ♡ pada poster untuk menyimpan film."
    : "Film tidak ditemukan.";
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  el.pagination.replaceChildren();
  if (visibleFilms.length <= FILMS_PER_PAGE) return;

  const addButton = (label, page, disabled, active = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = disabled;
    if (active) button.classList.add("active");
    button.addEventListener("click", () => {
      currentPage = page;
      renderMovies();
      document.querySelector(".catalog-section").scrollIntoView({ behavior: "smooth" });
    });
    el.pagination.appendChild(button);
  };

  addButton("‹", currentPage - 1, currentPage === 1);

  // Tampilkan nomor halaman di sekitar halaman aktif agar tidak terlalu panjang.
  let first = Math.max(1, currentPage - 2);
  let last = Math.min(totalPages, first + 4);
  first = Math.max(1, last - 4);

  if (first > 1) addButton("1", 1, false, currentPage === 1);
  if (first > 2) {
    const dots = document.createElement("span");
    dots.className = "muted";
    dots.textContent = "…";
    el.pagination.appendChild(dots);
  }

  for (let page = first; page <= last; page++) {
    if (page === 1 && first > 1) continue;
    addButton(String(page), page, false, page === currentPage);
  }

  if (last < totalPages - 1) {
    const dots = document.createElement("span");
    dots.className = "muted";
    dots.textContent = "…";
    el.pagination.appendChild(dots);
  }
  if (last < totalPages) {
    addButton(String(totalPages), totalPages, false, currentPage === totalPages);
  }

  addButton("›", currentPage + 1, currentPage === totalPages);
}

function applyFilters() {
  const keyword = el.search.value.trim().toLocaleLowerCase("id");
  visibleFilms = allFilms.filter(film => {
    const matchesView = activeView !== "favorites" ||
      favorites.has(filmKey(film));
    const searchable = `${text(film.judul)} ${text(film.genre)}`
      .toLocaleLowerCase("id");
    return matchesView && searchable.includes(keyword);
  });
  currentPage = 1;
  renderMovies();
}

function displayFilms(data, source) {
  if (!Array.isArray(data)) {
    throw new Error("films.json harus berupa array JSON.");
  }

  allFilms = data.filter(isValidFilm);
  chooseRecommendation();
  applyFilters();

  setStatus(source === "online"
    ? `Database berhasil diperbarui • ${allFilms.length} film.`
    : `Mode offline • menggunakan database tersimpan (${allFilms.length} film).`);
}


async function loadFilms() {

    el.refresh.disabled = true;

    // 1. Tampilkan database lokal terlebih dahulu
    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) {
        try {
            displayFilms(JSON.parse(cached), "cache");
            setStatus(`Menampilkan ${allFilms.length} film tersimpan. Memeriksa pembaruan...`);
        } catch (error) {
            console.error("Cache rusak:", error);
        }
    } else {
        setStatus("Mengunduh database film...");
    }

    // 2. Ambil database terbaru dari GitHub
    try {

        const response = await fetch(DATABASE_URL, {
            cache: "default"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Format database tidak valid.");
        }

        // 3. Simpan database terbaru
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));

        // 4. Perbarui tampilan
        displayFilms(data, "online");

    } catch (error) {

        console.error("Database online gagal:", error);

        if (cached) {
            setStatus(`Mode offline • ${allFilms.length} film tersimpan.`);
        } else {
            setStatus("Gagal memuat database. Periksa koneksi internet.");
        }

    } finally {
        el.refresh.disabled = false;
    }
}


// Event pencarian dan navigasi
el.search.addEventListener("input", applyFilters);
el.refresh.addEventListener("click", loadFilms);

document.getElementById("homeNav").addEventListener("click", event => {
  event.preventDefault();
  setView("home");
});
document.getElementById("filmsNav").addEventListener("click", event => {
  event.preventDefault();
  setView("films");
});
document.getElementById("favoritesNav").addEventListener("click", event => {
  event.preventDefault();
  setView("favorites");
});

document.getElementById("closeDetail").addEventListener("click", () => {
  el.dialog.close();
});
el.detailFavorite.addEventListener("click", () => {
  if (currentDetailFilm) toggleFavorite(currentDetailFilm);
});
el.dialog.addEventListener("click", event => {
  if (event.target === el.dialog) el.dialog.close();
});


document.getElementById("closePlayer").addEventListener("click", () => {

    const playerDialog = document.getElementById("playerDialog");
    const videoFrame = document.getElementById("videoFrame");

    videoFrame.src = "about:blank";
    playerDialog.close();

});
// Database otomatis dimuat saat aplikasi dibuka.
loadFilms();
