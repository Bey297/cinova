/* CINOVA - Multi database, rotasi 10 menit, filter genre dan series */
const RAW_BASE =
  "https://raw.githubusercontent.com/Bey297/cinova/main/database/";
const INDEX_URL = RAW_BASE + "index.json";
const ROTATE_MS = 10 * 60 * 1000;
const PAGE_SIZE = 12;
const CACHE_KEY = "cinova_multi_cache_v2";
const FAVORITES_KEY = "cinova_favorite_films";

let allFilms = [];
let visibleFilms = [];                                                let currentPage = 1;
let activeView = "home";
let activeType = "all";
let activeGenre = "all";
let recommendedFilm = null;
let currentDetailFilm = null;
let rotationPool = [];                                                let collectionPool = [];
let favorites = loadFavorites();

const $ = (id) => document.getElementById(id);
const el = {
  grid: $("movieGrid"),
  pagination: $("pagination"),                                          count: $("filmCount"),
  status: $("statusMessage"),                                           empty: $("emptyMessage"),                                             search: $("searchInput"),
  refresh: $("refreshButton"),
  recommendPoster: $("recommendPoster"),
  recommendTitle: $("recommendTitle"),
  recommendMeta: $("recommendMeta"),
  recommendDescription: $("recommendDescription"),
  recommendWatch: $("recommendWatch"),
  catalogTitle: $("catalogTitle"),
  dialog: $("detailDialog"),
  detailPoster: $("detailPoster"),
  detailTitle: $("detailTitle"),
  detailMeta: $("detailMeta"),
  detailDescription: $("detailDescription"),
  detailWatch: $("detailWatch"),
  detailFavorite: $("detailFavorite"),
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
function contentType(item) {
  return text(item.type).toLowerCase() === "series" ||
    Array.isArray(item.seasons)
    ? "series"
    : "movie";
}
function itemKey(item) {
  return (
    text(item.id) || text(item.url) || `${text(item.judul)}-${text(item.tahun)}`
  );
}
function isValidItem(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.judul === "string" &&
    (typeof item["link-icon-besar"] === "string" ||
      typeof item["link-icon-kecil"] === "string")
  );
}

function splitGenres(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(v => String(v).split(/[,|]/))
      .map(v => v.trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(/[,|]|\s+(?=[A-Z])/)
    .map(v => v.trim())
    .filter(Boolean);
}

function metadata(item) {
  return [
    item.ratting !== undefined ? `⭐ ${item.ratting}` : "",
    item.tahun ? text(item.tahun) : "",
    splitGenres(item.genre).join(", "),
  ]
    .filter(Boolean)
    .join(" • ");
}
function setStatus(message) {
  el.status.textContent = message;
}
function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function nextFromPool(poolName, candidates, previous) {
  let pool = poolName === "hero" ? rotationPool : collectionPool;
  const candidateKeys = new Set(candidates.map(itemKey));
  pool = pool.filter((item) => candidateKeys.has(itemKey(item)));
  if (!pool.length) pool = shuffle(candidates);
  let chosenIndex = pool.findIndex(
    (item) => itemKey(item) !== itemKey(previous),
  );
  if (chosenIndex < 0) chosenIndex = 0;
  const chosen = pool.splice(chosenIndex, 1)[0] || null;
  if (poolName === "hero") rotationPool = pool;
  else collectionPool = pool;
  return chosen;
}

function renderRecommendation() {
  if (!recommendedFilm) {
    el.recommendTitle.textContent = "Belum ada rekomendasi";
    el.recommendMeta.textContent = "Tambahkan konten ke database JSON";
    el.recommendDescription.textContent = "";
    el.recommendPoster.style.backgroundImage = "";
    el.recommendWatch.disabled = true;
    return;
  }
  el.recommendTitle.textContent = recommendedFilm.judul;
  el.recommendMeta.textContent = metadata(recommendedFilm);
  el.recommendDescription.textContent = text(
    recommendedFilm.deskripsi,
    "Pilihan tontonan CINOVA.",
  );
  const poster =
    recommendedFilm["link-icon-besar"] || recommendedFilm["link-icon-kecil"];
  el.recommendPoster.style.backgroundImage = `url("${poster}")`;
  el.recommendWatch.disabled = false;
  el.recommendWatch.textContent =
    contentType(recommendedFilm) === "series"
      ? "▤ Lihat Series"
      : "▶ Lihat Film";
  el.recommendWatch.onclick = () => openDetails(recommendedFilm);
}
function rotateHome() {
  if (!allFilms.length) return;
  const previousHero = recommendedFilm;
  recommendedFilm = nextFromPool("hero", allFilms, previousHero);
  renderRecommendation();

  // Koleksi diacak ulang tanpa reload halaman. Filter yang sedang dipilih tetap dipakai.
  collectionPool = shuffle(
    allFilms.filter((item) => itemKey(item) !== itemKey(recommendedFilm)),
  );
  if (activeView === "home") applyFilters();
}

function openWatch(url) {
    if (!url) {
        setStatus("Tautan video tidak tersedia.");
        return;
    }

    const dialog = $("playerDialog");
    const frame = $("videoFrame");

    if (!dialog || !frame) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }

    frame.src = "about:blank";

    frame.src = url;

    if (!dialog.open) {
        dialog.showModal();
    }
}
function toggleFavorite(item) {
  const key = itemKey(item);
  if (favorites.has(key)) favorites.delete(key);
  else favorites.add(key);
  saveFavorites();
  if (currentDetailFilm && itemKey(currentDetailFilm) === key)
    updateDetailFavoriteButton();
  applyFilters();
}
function updateDetailFavoriteButton() {
  if (!currentDetailFilm) return;
  const saved = favorites.has(itemKey(currentDetailFilm));
  el.detailFavorite.classList.toggle("saved", saved);
  el.detailFavorite.textContent = saved ? "♥ Tersimpan" : "♡ Favorit";
}
function openDetails(item) {
  currentDetailFilm = item;
  el.detailPoster.src =
    item["link-icon-besar"] || item["link-icon-kecil"] || "";
  el.detailPoster.alt = item.judul;
  el.detailTitle.textContent = item.judul;
  el.detailMeta.textContent = [
    metadata(item),
    item.duration ? `Durasi ${item.duration}` : "",
  ]
    .filter(Boolean)
    .join(" • ");
  el.detailDescription.textContent = text(item.deskripsi, "");
  const isSeries = contentType(item) === "series";
  $("detailType").textContent = isSeries ? "SERIES" : "FILM";
  $("seriesArea").hidden = !isSeries;
  el.detailWatch.hidden = isSeries;
  el.detailWatch.disabled = !item.url;
  el.detailWatch.onclick = () => openWatch(item.url);
  if (isSeries) renderSeasons(item);
  updateDetailFavoriteButton();
  if (typeof el.dialog.showModal === "function") el.dialog.showModal();
}
function renderSeasons(series) {
  const select = $("seasonSelect");
  const list = $("episodeList");
  select.replaceChildren();
  list.replaceChildren();
  const seasons = Array.isArray(series.seasons) ? series.seasons : [];
  if (!seasons.length) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Episode belum ditambahkan.";
    list.appendChild(note);
    return;
  }
  seasons.forEach((season, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `Season ${text(season.season, index + 1)}`;
    select.appendChild(option);
  });
  const drawEpisodes = () => {
    list.replaceChildren();
    const season = seasons[Number(select.value)] || seasons[0];
    (season.episodes || []).forEach((episode, index) => {
      const row = document.createElement("article");
      row.className = "episode-row";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `Episode ${text(episode.episode, index + 1)}: ${text(episode.judul, "Tanpa judul")}`;
      const duration = document.createElement("small");
      duration.textContent = text(episode.duration, "");
      info.append(title, duration);
      const play = document.createElement("button");
      play.className = "primary-button episode-play";
      play.type = "button";
      play.textContent = "▶ Putar";
      play.disabled = !episode.url;
      play.addEventListener("click", () => openWatch(episode.url));
      row.append(info, play);
      list.appendChild(row);
    });
    if (!season.episodes || !season.episodes.length) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "Belum ada episode pada season ini.";
      list.appendChild(note);
    }
  };
  select.onchange = drawEpisodes;
  drawEpisodes();
}

function renderMovies() {
  const totalPages = Math.max(1, Math.ceil(visibleFilms.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageItems = visibleFilms.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  el.grid.replaceChildren();
  pageItems.forEach((item) => {
    const card = document.createElement("article");
    card.className = "movie-card";
    const image = document.createElement("img");
    image.className = "movie-poster";
    image.src = item["link-icon-kecil"] || item["link-icon-besar"] || "";
    image.alt = item.judul;
    image.loading = "lazy";
    image.addEventListener("click", () => openDetails(item));
    image.onerror = () => {
      image.removeAttribute("src");
      image.alt = "Poster tidak tersedia";
    };
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "movie-favorite";
    const saved = favorites.has(itemKey(item));
    favorite.classList.toggle("saved", saved);
    favorite.textContent = saved ? "♥" : "♡";
    favorite.setAttribute(
      "aria-label",
      saved ? "Hapus favorit" : "Tambah favorit",
    );
    favorite.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(item);
    });
    const title = document.createElement("h3");
    title.className = "movie-title";
    title.textContent = item.judul;
    title.addEventListener("click", () => openDetails(item));
    const meta = document.createElement("div");
    meta.className = "movie-meta";
    meta.textContent = [
      contentType(item) === "series" ? "Series" : text(item.tahun),
      item.ratting !== undefined ? `⭐ ${item.ratting}` : "",
    ]
      .filter(Boolean)
      .join(" • ");
    card.append(image, favorite, title, meta);
    el.grid.appendChild(card);
  });
  el.count.textContent = `${visibleFilms.length} judul`;
  el.empty.hidden = visibleFilms.length !== 0;
  el.empty.textContent =
    activeView === "favorites"
      ? "Belum ada favorit."
      : "Konten tidak ditemukan.";
  renderPagination(totalPages);
}
function renderPagination(totalPages) {
  el.pagination.replaceChildren();
  if (visibleFilms.length <= PAGE_SIZE) return;
  const add = (label, page, disabled, active = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = disabled;
    if (active) button.classList.add("active");
    button.addEventListener("click", () => {
      currentPage = page;
      renderMovies();
      $("catalog-section").scrollIntoView({ behavior: "smooth" });
    });
    el.pagination.appendChild(button);
  };
  add("‹", currentPage - 1, currentPage === 1);
  const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const last = Math.min(totalPages, first + 4);
  for (let page = first; page <= last; page++)
    add(String(page), page, false, page === currentPage);
  add("›", currentPage + 1, currentPage === totalPages);
}
function renderGenreFilters() {
  const container = $("genreFilters");
  container.replaceChildren();
  const genres = [
    ...new Set(allFilms.flatMap((item) => splitGenres(item.genre))),
  ].sort((a, b) => a.localeCompare(b, "id"));
  const choices = [
    { name: "Semua genre", value: "all" },
    ...genres.map((name) => ({ name, value: name })),
  ];
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = choice.name;
    button.classList.toggle(
      "active",
      activeGenre.toLowerCase() === choice.value.toLowerCase(),
    );
    button.addEventListener("click", () => {
      activeGenre = choice.value;
      renderGenreFilters();
      applyFilters();
    });
    container.appendChild(button);
  });
}
function applyFilters() {
  const keyword = el.search.value.trim().toLocaleLowerCase("id");
  visibleFilms = allFilms.filter((item) => {
    const matchesView =
      activeView !== "favorites" || favorites.has(itemKey(item));
    const matchesType =
      activeType === "all" || contentType(item) === activeType;
    const matchesGenre =
      activeGenre === "all" ||
      splitGenres(item.genre).some(
        (g) =>
          g.toLocaleLowerCase("id") === activeGenre.toLocaleLowerCase("id"),
      );
    const searchable =
      `${text(item.judul)} ${splitGenres(item.genre).join(" ")}`.toLocaleLowerCase(
        "id",
      );
    return (
      matchesView && matchesType && matchesGenre && searchable.includes(keyword)
    );
  });
  // Di beranda, koleksi diacak dan berubah tiap 10 menit. Filter/search tetap diterapkan.
  if (
    activeView === "home" &&
    !keyword &&
    activeGenre === "all" &&
    activeType === "all"
  ) {
    const currentOrder = collectionPool.length
      ? collectionPool
      : shuffle(allFilms);
    const seen = new Set();
    visibleFilms = currentOrder.filter((item) => {
      const key = itemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    allFilms.forEach((item) => {
      if (!seen.has(itemKey(item))) visibleFilms.push(item);
    });
  }
  currentPage = 1;
  renderMovies();
}
function setView(view) {
  activeView = view;
  document.querySelectorAll(".bottom-nav a").forEach((link) => {
    link.classList.remove("active");
    link.removeAttribute("aria-current");
  });
  const id =
    view === "home"
      ? "homeNav"
      : view === "films"
        ? "filmsNav"
        : view === "series"
          ? "seriesNav"
          : "favoritesNav";
  
  const activeLink = $(id);

  if (activeLink) {
    activeLink.classList.add("active");
    activeLink.setAttribute("aria-current", "page");
    }
  activeType =
    view === "films" ? "movie" : view === "series" ? "series" : "all";
  if (view === "favorites") activeType = "all";
  document
    .querySelectorAll("#typeFilters [data-type]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.type === activeType),
    );
  el.catalogTitle.textContent =
    view === "favorites"
      ? "Favorit"
      : view === "series"
        ? "Semua Series"
        : view === "films"
          ? "Semua Film"
          : "Pilihan Untukmu";
  el.search.placeholder =
    view === "favorites" ? "Cari favorit..." : "Cari judul film atau serial...";
  applyFilters();
  if (view !== "home")
    $("catalog-section").scrollIntoView({ behavior: "smooth" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

async function fetchJson(path) {
  const response = await fetch(RAW_BASE + encodeURIComponent(path), {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadDatabases() {
  el.refresh.disabled = true;

  const cached = localStorage.getItem(CACHE_KEY);

  if (cached) {
    try {
      displayItems(JSON.parse(cached), "cache");
      setStatus(
        `Menampilkan ${allFilms.length} judul tersimpan. Memeriksa database...`
      );
    } catch (error) {
      console.warn("Cache CINOVA rusak:", error);
    }
  }

  try {
    let databases = ["films.json"];

    try {
      const manifest = await fetchJson("index.json");

      if (
        manifest &&
        Array.isArray(manifest.databases) &&
        manifest.databases.length > 0
      ) {
        databases = manifest.databases;
      }
    } catch (error) {
      console.warn("Manifest tidak tersedia, menggunakan films.json", error);
    }

    const results = await Promise.allSettled(
      databases.map(fetchJson)
    );

    const combined = [];
    const failed = [];

    results.forEach((result, index) => {
      if (
        result.status === "fulfilled" &&
        Array.isArray(result.value)
      ) {
        combined.push(...result.value);
      } else {
        failed.push(databases[index]);
      }
    });

    const unique = new Map();

    combined.filter(isValidItem).forEach(item => {
      const key = itemKey(item);

      if (!unique.has(key)) {
        unique.set(key, item);
      }
    });

    const items = [...unique.values()];

    if (!items.length) {
      throw new Error("Tidak ada data film yang valid.");
    }

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(items)
    );

    displayItems(items, "online");

    setStatus(
      `Database aktif • ${items.length} judul` +
      (failed.length
        ? ` • gagal: ${failed.join(", ")}`
        : "")
    );

  } catch (error) {
    console.error("Database CINOVA:", error);

    if (allFilms.length) {
      setStatus(
        `Mode offline • ${allFilms.length} judul tersimpan.`
      );
    } else {
      setStatus(
        "Gagal memuat film. Periksa koneksi dan films.json."
      );
    }

  } finally {
    el.refresh.disabled = false;
  }
}

function displayItems(items, source) {
  if (!Array.isArray(items))
    throw new Error("Data database harus berupa array JSON.");
  allFilms = items.filter(isValidItem);
  rotationPool = shuffle(allFilms);
  collectionPool = shuffle(allFilms);
  recommendedFilm = null;
  rotateHome();
  renderGenreFilters();
  applyFilters();
  if (source === "cache")
    setStatus(`Mode cache • ${allFilms.length} judul tersimpan.`);
}

// Event pencarian, jenis konten, dan navigasi
el.search.addEventListener("input", applyFilters);
el.refresh.addEventListener("click", loadDatabases);
$("brandHome").addEventListener("click", (event) => {
  event.preventDefault();
  setView("home");
});
$("homeNav").addEventListener("click", (event) => {
  event.preventDefault();
  setView("home");
});
$("filmsNav").addEventListener("click", (event) => {
  event.preventDefault();
  setView("films");
});
$("seriesNav").addEventListener("click", (event) => {
  event.preventDefault();
  setView("series");
});
$("favoritesNav").addEventListener("click", (event) => {
  event.preventDefault();
  setView("favorites");
});
document.querySelectorAll("#typeFilters [data-type]").forEach((button) =>
  button.addEventListener("click", () => {
    activeType = button.dataset.type;
    document
      .querySelectorAll("#typeFilters [data-type]")
      .forEach((item) => item.classList.toggle("active", item === button));
    applyFilters();
  }),
);
$("closeDetail").addEventListener("click", () => el.dialog.close());
el.detailFavorite.addEventListener("click", () => {
  if (currentDetailFilm) toggleFavorite(currentDetailFilm);
});
el.dialog.addEventListener("click", (event) => {
  if (event.target === el.dialog) el.dialog.close();
});
$("closePlayer").addEventListener("click", () => {
  $("videoFrame").src = "about:blank";
  $("playerDialog").close();
});
$("playerDialog").addEventListener("close", () => {
  $("videoFrame").src = "about:blank";
});

// Rotasi berjalan tanpa reload halaman dan tanpa mengganggu posisi scroll.
setInterval(rotateHome, ROTATE_MS);
loadDatabases();
