"use strict";

/* =====================================
   CINOVA CONFIGURATION
===================================== */

const DATABASE_URL =
    "https://raw.githubusercontent.com/Bey297/cinova/main/database/films.json";

const STORAGE_KEY = "cinova_favorites_v2";


/* =====================================
   APPLICATION STATE
===================================== */

let films = [];
let filteredFilms = [];
let activeGenre = "all";
let currentFilm = null;
let heroFilm = null;

let heroIndex = 0;
let heroTimer = null;
let currentPage = 1;
const FILMS_PER_PAGE = 12;

/* =====================================
   DOM ELEMENTS
===================================== */

const $ = (id) => document.getElementById(id);

const elements = {
    hero: document.querySelector(".hero"),
    heroTitle: $("heroTitle"),
    heroDescription: $("heroDescription"),
    heroInfo: $("heroInfo"),
    heroPlay: $("heroPlay"),
    heroIndicators: $("heroIndicators"),

    movieGrid: $("movieGrid"),
    favoriteGrid: $("favoriteGrid"),
    genreList: $("genreList"),

    filmCount: $("filmCount"),
    favoriteCount: $("favoriteCount"),

    searchInput: $("searchInput"),
    clearSearch: $("clearSearch"),
    sortSelect: $("sortSelect"),

    emptyState: $("emptyState"),

    detailModal: $("detailModal"),
    detailBanner: $("detailBanner"),
    detailTitle: $("detailTitle"),
    detailInfo: $("detailInfo"),
    detailGenre: $("detailGenre"),
    detailPlay: $("detailPlay"),
    detailFavorite: $("detailFavorite"),

    playerModal: $("playerModal"),
    playerTitle: $("playerTitle"),
    videoFrame: $("videoFrame"),
    openSource: $("openSource"),
    playerStatus: $("playerStatus"),
    closePlayer: $("closePlayer"),

    toast: $("toast"),
    menuBtn: $("menuBtn")
};


/* =====================================
   HELPER FUNCTIONS
===================================== */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function validURL(value) {
    try {
        const url = new URL(value);

        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

function getYear(film) {
    return String(film.tahun ?? "-");
}

function getRating(film) {
    const rating = Number(film.ratting);

    return Number.isFinite(rating) ? rating.toFixed(1) : "-";
}

function getGenres(film) {
    const raw = String(film.genre || "");

    return raw
        .split(/[,|]/)
        .flatMap(item => item.trim().split(/\s+/))
        .filter(Boolean);
}

function getFavoriteIds() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function saveFavorites(ids) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        showToast("Penyimpanan favorit tidak tersedia.");
    }
}

function isFavorite(film) {
    return getFavoriteIds().includes(film.url);
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 2300);
}


/* =====================================
   LOAD DATABASE
===================================== */

async function loadFilms() {
    try {
        const response = await fetch(DATABASE_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Format database bukan array JSON.");
        }

        films = data.filter(film => {
            return film &&
                typeof film === "object" &&
                validURL(film.url) &&
                film.judul;
        });

        if (films.length === 0) {
            throw new Error("Database belum memiliki film valid.");
        }

        initializeApp();

    } catch (error) {
        console.error("CINOVA DATABASE ERROR:", error);

        elements.movieGrid.innerHTML = `
            <div class="loading">
                <h3>Database gagal dimuat</h3>
                <p>${escapeHTML(error.message)}</p>
                <button class="primary-btn" onclick="loadFilms()">
                    Coba Lagi
                </button>
            </div>
        `;

        elements.filmCount.textContent = "Gagal memuat";
    }
}


/* =====================================
   INITIALIZE
===================================== */


function initializeApp() {
    // Acak urutan film setiap website dibuka
    films = shuffleFilms(films);

    buildGenres();

    filteredFilms = [...films];

    renderMovies();
    renderFavorites();
    setupHero();

    elements.filmCount.textContent =
        films.length + " Film";

    console.log("CINOVA berhasil dimuat:", films.length, "film");
}



function shuffleFilms(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}


/* =====================================
   GENRE FILTER
===================================== */

function buildGenres() {
    const genres = new Set();

    films.forEach(film => {
        getGenres(film).forEach(genre => {
            genres.add(genre);
        });
    });

    const sortedGenres = [...genres].sort();

    elements.genreList.innerHTML = `
        <button class="genre-btn active" data-genre="all">
            Semua
        </button>
    `;

    sortedGenres.forEach(genre => {
        const button = document.createElement("button");

        button.className = "genre-btn";
        button.dataset.genre = genre;
        button.textContent = genre;

        elements.genreList.appendChild(button);
    });
}

function filterByGenre(genre) {
    activeGenre = genre;

    document.querySelectorAll(".genre-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.genre === genre
        );
    });

    applyFilters();
  currentPage = 1;
}


/* =====================================
   SEARCH AND SORT
===================================== */

function applyFilters() {
    const keyword = elements.searchInput.value
        .trim()
        .toLowerCase();

    filteredFilms = films.filter(film => {
        const title = String(film.judul || "").toLowerCase();

        const genreList = getGenres(film)
            .join(" ")
            .toLowerCase();

        const matchSearch =
            title.includes(keyword) ||
            genreList.includes(keyword);

        const matchGenre =
            activeGenre === "all" ||
            getGenres(film).some(genre =>
                genre.toLowerCase() === activeGenre.toLowerCase()
            );

        return matchSearch && matchGenre;
    });

    sortFilms();
    currentPage = 1;
    renderMovies();
}

function sortFilms() {
    const mode = elements.sortSelect.value;

    if (mode === "latest") {
        filteredFilms.sort((a, b) =>
            Number(b.tahun) - Number(a.tahun)
        );
    }

    if (mode === "oldest") {
        filteredFilms.sort((a, b) =>
            Number(a.tahun) - Number(b.tahun)
        );
    }

    if (mode === "rating") {
        filteredFilms.sort((a, b) =>
            Number(b.ratting) - Number(a.ratting)
        );
    }

    if (mode === "az") {
        filteredFilms.sort((a, b) =>
            String(a.judul).localeCompare(String(b.judul))
        );
    }
}


/* =====================================
   MOVIE CARD
===================================== */


function createMovieCard(film) {
    const favorite = isFavorite(film);
    const poster = validURL(film["link-icon-kecil"]);

    const genres = getGenres(film)
        .map(genre => escapeHTML(genre))
        .join(" • ");

    return `
        <article class="movie-card"
            data-action="detail"
            data-url="${escapeHTML(film.url)}">

            <div class="poster-wrap">

                <img
                    src="${escapeHTML(poster)}"
                    alt="${escapeHTML(film.judul)}"
                    loading="lazy"
                    onerror="this.style.opacity='.15'"
                >

                <span class="rating">
                    ★ ${getRating(film)}
                </span>

                <button
                    class="favorite-btn ${favorite ? "active" : ""}"
                    data-action="favorite"
                    data-url="${escapeHTML(film.url)}">
                    ${favorite ? "♥" : "♡"}
                </button>

                <div class="poster-overlay"></div>
            </div>

            <h3 class="movie-title">
                ${escapeHTML(film.judul)}
            </h3>

            <p class="movie-genre">
                ${genres || "Genre tidak tersedia"}
            </p>

            <p class="movie-meta">
                ${escapeHTML(getYear(film))}
                • ${escapeHTML(film.duration || "-")}
            </p>

        </article>
    `;
}

/* =====================================
   RENDER MOVIES
===================================== */


function renderMovies() {
    const totalFilms = filteredFilms.length;

    const totalPages = Math.ceil(
        totalFilms / FILMS_PER_PAGE
    );

    if (currentPage > totalPages) {
        currentPage = Math.max(1, totalPages);
    }

    const startIndex =
        (currentPage - 1) * FILMS_PER_PAGE;

    const endIndex =
        startIndex + FILMS_PER_PAGE;

    const pageFilms = filteredFilms.slice(
        startIndex,
        endIndex
    );

    elements.filmCount.textContent =
        totalFilms + " Film";

    elements.movieGrid.innerHTML = "";

    elements.emptyState.hidden = totalFilms !== 0;

    if (totalFilms === 0) {
        $("pagination").innerHTML = "";
        return;
    }

    elements.movieGrid.innerHTML =
        pageFilms.map(createMovieCard).join("");

    renderPagination(totalPages);
}


function renderPagination(totalPages) {
    const container = $("pagination");

    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = `
        <button class="page-btn"
            data-page="${currentPage - 1}"
            ${currentPage === 1 ? "disabled" : ""}>
            ‹
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button
                class="page-btn ${i === currentPage ? "active" : ""}"
                data-page="${i}">
                ${i}
            </button>
        `;
    }

    html += `
        <button class="page-btn"
            data-page="${currentPage + 1}"
            ${currentPage === totalPages ? "disabled" : ""}>
            ›
        </button>

        <span class="page-info">
            ${currentPage} / ${totalPages}
        </span>
    `;

    container.innerHTML = html;
}

$("pagination").addEventListener("click", event => {
    const button = event.target.closest("[data-page]");

    if (!button || button.disabled) return;

    currentPage = Number(button.dataset.page);

    renderMovies();

    document.getElementById("movies").scrollIntoView({
        behavior: "smooth"
    });
});


/* =====================================
   FAVORITES
===================================== */

function toggleFavorite(url) {
    const film = films.find(item => item.url === url);

    if (!film) return;

    let favorites = getFavoriteIds();

    if (favorites.includes(url)) {
        favorites = favorites.filter(item => item !== url);
        showToast("Dihapus dari favorit");
    } else {
        favorites.push(url);
        showToast("Ditambahkan ke favorit");
    }

    saveFavorites(favorites);

    renderMovies();
    renderFavorites();
    updateDetailFavorite();
}

function renderFavorites() {
    const ids = getFavoriteIds();

    const favorites = films.filter(film =>
        ids.includes(film.url)
    );

    elements.favoriteCount.textContent =
        favorites.length + " Film";

    if (favorites.length === 0) {
        elements.favoriteGrid.innerHTML = `
            <p class="favorite-empty">
                Belum ada film favorit.
            </p>
        `;

        return;
    }

    elements.favoriteGrid.innerHTML =
        favorites.map(createMovieCard).join("");
}


/* =====================================
   MOVIE DETAIL
===================================== */

function openDetail(url) {
    const film = films.find(item => item.url === url);

    if (!film) return;

    currentFilm = film;

    const banner = validURL(film["link-icon-besar"]);

    elements.detailBanner.style.backgroundImage =
        banner ? `url("${banner}")` : "none";

    elements.detailTitle.textContent = film.judul;

    elements.detailInfo.textContent =
        `${getYear(film)} • ${film.duration || "-"} • ★ ${getRating(film)}`;

    elements.detailGenre.textContent =
        "Genre: " + getGenres(film).join(", ");

    updateDetailFavorite();

    elements.detailModal.classList.add("show");

    document.body.style.overflow = "hidden";
}

function closeDetail() {
    elements.detailModal.classList.remove("show");

    document.body.style.overflow = "";
}

function updateDetailFavorite() {
    if (!currentFilm) return;

    const favorite = isFavorite(currentFilm);

    elements.detailFavorite.textContent =
        favorite ? "♥ Hapus Favorit" : "♡ Tambah Favorit";
}


/* =====================================
   VIDEO PLAYER
===================================== */

function playFilm(film) {
    if (!film) return;

    const videoURL = validURL(film.url);

    if (!videoURL) {
        showToast("URL video tidak valid.");
        return;
    }

    window.open(videoURL, "_blank");
}


function closePlayer() {
    elements.videoFrame.src = "about:blank";

    elements.playerModal.classList.remove("show");

    document.body.style.overflow = "";
}


/* =====================================
   HERO BANNER
===================================== */

function setupHero() {
    if (films.length === 0) return;

    const shuffled = [...films].sort(() => Math.random() - 0.5);

    const heroFilms = shuffled.slice(0, Math.min(5, shuffled.length));

    function showHero(index) {
        heroFilm = heroFilms[index];

        if (!heroFilm) return;

        const banner = validURL(heroFilm["link-icon-besar"]) ||
            validURL(heroFilm["link-icon-kecil"]);

        elements.hero.style.backgroundImage = banner
            ? `url("${banner}")`
            : "none";

        elements.heroTitle.textContent = heroFilm.judul;

        elements.heroDescription.textContent =
            "Nikmati " + heroFilm.judul + " bersama CINOVA.";

        elements.heroInfo.textContent =
            `${getYear(heroFilm)} • ${heroFilm.duration || "-"} • ★ ${getRating(heroFilm)}`;

        elements.heroIndicators.innerHTML = heroFilms
            .map((film, i) => `
                <button
                    class="${i === index ? "active" : ""}"
                    data-hero="${i}"
                    aria-label="Banner ${i + 1}">
                </button>
            `)
            .join("");
    }

    function nextHero() {
        heroIndex = (heroIndex + 1) % heroFilms.length;
        showHero(heroIndex);
    }

    showHero(heroIndex);

    clearInterval(heroTimer);

    if (heroFilms.length > 1) {
        heroTimer = setInterval(nextHero, 8000);
    }

    elements.heroIndicators.onclick = event => {
        const button = event.target.closest("[data-hero]");

        if (!button) return;

        heroIndex = Number(button.dataset.hero);

        showHero(heroIndex);
    };

    elements.heroPlay.onclick = () => {
        playFilm(heroFilm);
    };
}


/* =====================================
   EVENT LISTENERS
===================================== */

elements.genreList.addEventListener("click", event => {
    const button = event.target.closest("[data-genre]");

    if (!button) return;

    filterByGenre(button.dataset.genre);
});

function handleMovieGrid(event) {
    const favoriteButton = event.target.closest(
        '[data-action="favorite"]'
    );

    if (favoriteButton) {
        event.stopPropagation();

        toggleFavorite(favoriteButton.dataset.url);
        return;
    }

    const card = event.target.closest(
        '[data-action="detail"]'
    );

    if (card) {
        openDetail(card.dataset.url);
    }
}

elements.movieGrid.addEventListener("click", handleMovieGrid);

elements.favoriteGrid.addEventListener("click", handleMovieGrid);

elements.searchInput.addEventListener("input", () => {
    elements.clearSearch.classList.toggle(
        "visible",
        elements.searchInput.value.length > 0
    );

    applyFilters();
});

elements.clearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.clearSearch.classList.remove("visible");
    applyFilters();
});

elements.sortSelect.addEventListener("change", applyFilters);

elements.detailPlay.addEventListener("click", () => {
    playFilm(currentFilm);
});

elements.detailFavorite.addEventListener("click", () => {
    if (currentFilm) {
        toggleFavorite(currentFilm.url);
    }
});

elements.closePlayer.addEventListener("click", closePlayer);

document.querySelectorAll('[data-close="detail"]').forEach(button => {
    button.addEventListener("click", closeDetail);
});

elements.menuBtn.addEventListener("click", () => {
    document.querySelector(".nav-links").classList.toggle("open");
});

document.querySelectorAll(".nav-links a").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelector(".nav-links").classList.remove("open");
    });
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        if (elements.playerModal.classList.contains("show")) {
            closePlayer();
        } else if (elements.detailModal.classList.contains("show")) {
            closeDetail();
        }
    }
});


/* =====================================
   START CINOVA
===================================== */


/* =====================================
   CINOVA SERIES SYSTEM
===================================== */

const SERIES_DATABASE_URL =
    "https://raw.githubusercontent.com/Bey297/cinova/main/database/series.json";

let seriesList = [];
let currentSeries = null;
let currentSeason = 1;
let filteredSeries = [];

const seriesElements = {
    grid: $("seriesGrid"),
    count: $("seriesCount"),
    search: $("seriesSearch"),
    empty: $("seriesEmpty"),
    genres: $("seriesGenreList"),

    modal: $("seriesModal"),
    banner: $("seriesBanner"),
    title: $("seriesTitle"),
    info: $("seriesInfo"),
    genre: $("seriesGenre"),

    seasons: $("seasonButtons"),
    episodes: $("episodeList"),
    episodeHeading: $("episodeHeading")
};


/* LOAD SERIES DATABASE */

async function loadSeries() {
    try {
        const response = await fetch(SERIES_DATABASE_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Format database Series tidak valid.");
        }

        seriesList = data.filter(series => {
            return series &&
                series.id &&
                series.judul &&
                Array.isArray(series.seasons);
        });

        seriesList = shuffleFilms(seriesList);

        filteredSeries = [...seriesList];

        buildSeriesGenres();
        renderSeries();

        seriesElements.count.textContent =
            seriesList.length + " Series";

    } catch (error) {
        console.error("CINOVA SERIES ERROR:", error);

        seriesElements.grid.innerHTML = `
            <div class="loading">
                <h3>Series gagal dimuat</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;

        seriesElements.count.textContent = "Gagal memuat";
    }
}


/* HITUNG TOTAL EPISODE */

function getTotalEpisodes(series) {
    if (!Array.isArray(series.seasons)) return 0;

    return series.seasons.reduce((total, season) => {
        return total + (
            Array.isArray(season.episodes)
                ? season.episodes.length
                : 0
        );
    }, 0);
}


/* SERIES GENRES */

function buildSeriesGenres() {
    const genres = new Set();

    seriesList.forEach(series => {
        getGenres(series).forEach(genre => {
            genres.add(genre);
        });
    });

    seriesElements.genres.innerHTML = `
        <button class="genre-btn active"
            data-series-genre="all">
            Semua
        </button>
    `;

    [...genres].sort().forEach(genre => {
        seriesElements.genres.innerHTML += `
            <button class="genre-btn"
                data-series-genre="${escapeHTML(genre)}">
                ${escapeHTML(genre)}
            </button>
        `;
    });
}


/* SERIES CARD */

function createSeriesCard(series) {
    const poster = validURL(series["link-icon-kecil"]);

    const totalEpisodes = getTotalEpisodes(series);

    const genres = getGenres(series)
        .map(genre => escapeHTML(genre))
        .join(" • ");

    return `
        <article class="movie-card"
            data-series-action="detail"
            data-series-id="${escapeHTML(series.id)}">

            <div class="poster-wrap">

                <img
                    src="${escapeHTML(poster)}"
                    alt="${escapeHTML(series.judul)}"
                    loading="lazy"
                    onerror="this.style.opacity='.15'"
                >

                <span class="rating">
                    ★ ${getRating(series)}
                </span>

                <span class="series-episode-badge">
                    ${totalEpisodes} EPS
                </span>

                <div class="poster-overlay"></div>

            </div>

            <h3 class="movie-title">
                ${escapeHTML(series.judul)}
            </h3>

            <p class="movie-genre">
                ${genres || "Genre tidak tersedia"}
            </p>

            <p class="movie-meta">
                ${escapeHTML(getYear(series))}
                • ${series.seasons.length} Season
            </p>

        </article>
    `;
}


/* RENDER SERIES */

function renderSeries() {
    seriesElements.count.textContent =
        filteredSeries.length + " Series";

    seriesElements.grid.innerHTML =
        filteredSeries.map(createSeriesCard).join("");

    seriesElements.empty.hidden =
        filteredSeries.length !== 0;
}


/* FILTER SERIES */

function filterSeries() {
    const keyword = seriesElements.search.value
        .trim()
        .toLowerCase();

    const activeButton =
        seriesElements.genres.querySelector(".active");

    const activeGenre = activeButton
        ? activeButton.dataset.seriesGenre
        : "all";

    filteredSeries = seriesList.filter(series => {

        const title = String(series.judul || "")
            .toLowerCase();

        const genreList = getGenres(series);

        const matchSearch =
            title.includes(keyword) ||
            genreList.join(" ").toLowerCase().includes(keyword);

        const matchGenre =
            activeGenre === "all" ||
            genreList.some(genre =>
                genre.toLowerCase() === activeGenre.toLowerCase()
            );

        return matchSearch && matchGenre;
    });

    renderSeries();
}


/* OPEN SERIES DETAIL */

function openSeriesDetail(id) {
    const series = seriesList.find(item =>
        String(item.id) === String(id)
    );

    if (!series) return;

    currentSeries = series;

    currentSeason = series.seasons.length
        ? Number(series.seasons[0].season)
        : 1;

    const banner = validURL(series["link-icon-besar"]);

    seriesElements.banner.style.backgroundImage =
        banner ? `url("${banner}")` : "none";

    seriesElements.title.textContent = series.judul;

    seriesElements.info.textContent =
        `${getYear(series)} • ${series.seasons.length} Season • ${getTotalEpisodes(series)} Episode • ★ ${getRating(series)}`;

    seriesElements.genre.textContent =
        "Genre: " + getGenres(series).join(", ");

    renderSeasonButtons();
    renderEpisodes();

    seriesElements.modal.classList.add("show");

    document.body.style.overflow = "hidden";
}


/* SEASON BUTTONS */

function renderSeasonButtons() {
    if (!currentSeries) return;

    seriesElements.seasons.innerHTML =
        currentSeries.seasons.map(season => `
            <button
                class="season-btn ${
                    Number(season.season) === currentSeason
                        ? "active"
                        : ""
                }"
                data-season="${Number(season.season)}">

                Season ${Number(season.season)}

            </button>
        `).join("");
}


/* CHANGE SEASON */

function selectSeason(seasonNumber) {
    if (!currentSeries) return;

    const seasonExists = currentSeries.seasons.some(
        season => Number(season.season) === seasonNumber
    );

    if (!seasonExists) return;

    currentSeason = seasonNumber;

    renderSeasonButtons();
    renderEpisodes();
}


/* EPISODE LIST */

function renderEpisodes() {
    if (!currentSeries) return;

    const season = currentSeries.seasons.find(
        item => Number(item.season) === currentSeason
    );

    if (!season) {
        seriesElements.episodes.innerHTML =
            "<p>Episode tidak tersedia.</p>";
        return;
    }

    const episodes = Array.isArray(season.episodes)
        ? season.episodes
        : [];

    seriesElements.episodeHeading.textContent =
        `Episode Season ${currentSeason}`;

    if (episodes.length === 0) {
        seriesElements.episodes.innerHTML =
            "<p>Belum ada episode.</p>";
        return;
    }

    seriesElements.episodes.innerHTML =
        episodes.map(episode => `
            <button
                class="episode-item"
                data-episode-url="${escapeHTML(episode.url)}"
                ${validURL(episode.url) ? "" : "disabled"}>

                <span class="episode-number">
                    ${Number(episode.episode)}
                </span>

                <span class="episode-title">
                    ${escapeHTML(
                        episode.judul ||
                        "Episode " + episode.episode
                    )}
                </span>

                <span class="episode-play">▶</span>

            </button>
        `).join("");
}


/* CLOSE SERIES */

function closeSeriesDetail() {
    seriesElements.modal.classList.remove("show");

    document.body.style.overflow = "";
}


/* SERIES EVENTS */

seriesElements.grid.addEventListener("click", event => {
    const card = event.target.closest(
        '[data-series-action="detail"]'
    );

    if (!card) return;

    openSeriesDetail(card.dataset.seriesId);
});


seriesElements.search.addEventListener("input", filterSeries);


seriesElements.genres.addEventListener("click", event => {
    const button = event.target.closest("[data-series-genre]");

    if (!button) return;

    seriesElements.genres
        .querySelectorAll(".genre-btn")
        .forEach(item => item.classList.remove("active"));

    button.classList.add("active");

    filterSeries();
});


seriesElements.seasons.addEventListener("click", event => {
    const button = event.target.closest("[data-season]");

    if (!button) return;

    selectSeason(Number(button.dataset.season));
});


seriesElements.episodes.addEventListener("click", event => {
    const button = event.target.closest("[data-episode-url]");

    if (!button || button.disabled) return;

    const episodeURL = validURL(button.dataset.episodeUrl);

    if (!episodeURL) {
        showToast("URL episode tidak valid.");
        return;
    }

    // Memakai mekanisme pembukaan video yang sudah ada.
    // Fungsi VIDEO PLAYER tidak diubah.
    closeSeriesDetail();

    playFilm({
        url: episodeURL
    });
});


document.querySelectorAll('[data-close="series"]')
    .forEach(button => {
        button.addEventListener("click", closeSeriesDetail);
    });


/* LOAD BOTH DATABASES */

loadFilms();
loadSeries();

