import {
  auth, db, signInAnonymously, onAuthStateChanged,
  collection, doc, setDoc, deleteDoc, onSnapshot
} from "./firebase.js";

const $ = (selector) => document.querySelector(selector);
const grid = $("#book-grid");
const libraryGrid = $("#library-grid");
const limit = 20;
const API_NAMES = {
  openlibrary: "Open Library",
  googlebooks: "Google Books",
  gutendex: "Gutendex"
};

let books = [];
let favorites = new Map();
let user = null;
let unsubscribeFavorites = null;
let page = 1;
let query = "";
let category = "";
let year = "";
let sort = "relevance";
let apiSource = "openlibrary";
let searchRequest = 0;
let hasNextPage = false;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function normalizeBook(book, source) {
  if (source === "googlebooks") {
    const info = book.volumeInfo || {};
    const googleId = book.id || "";
    return {
      id: `google-${googleId}`,
      source,
      sourceId: googleId,
      title: info.title || "Untitled",
      author: info.authors?.[0] || "Unknown author",
      authors: info.authors || [],
      year: Number((info.publishedDate || "").slice(0, 4)) || null,
      isbn: info.industryIdentifiers?.[0]?.identifier || "",
      cover: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "").replace(/^http:/, "https:"),
      subjects: info.categories || [],
      description: info.description || "",
      link: info.infoLink || (googleId ? `https://books.google.com/books?id=${encodeURIComponent(googleId)}` : "")
    };
  }

  if (source === "gutendex") {
    const gutenbergId = book.id;
    return {
      id: `gutendex-${gutenbergId}`,
      source,
      sourceId: String(gutenbergId),
      title: book.title || "Untitled",
      author: book.authors?.[0]?.name || "Unknown author",
      authors: (book.authors || []).map(author => author.name),
      year: null,
      isbn: "",
      cover: book.formats?.["image/jpeg"] || "",
      subjects: [...(book.subjects || []), ...(book.bookshelves || [])],
      description: "Public-domain book from Project Gutenberg.",
      link: `https://www.gutenberg.org/ebooks/${encodeURIComponent(gutenbergId)}`
    };
  }

  const key = book.key || "";
  const isbn = book.isbn?.[0] || "";
  return {
    id: key,
    source,
    sourceId: key,
    title: book.title || "Untitled",
    author: book.author_name?.[0] || "Unknown author",
    authors: book.author_name || [],
    year: book.first_publish_year || null,
    isbn,
    cover: book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
      : (isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg` : ""),
    subjects: book.subject || [],
    description: "",
    link: key ? `https://openlibrary.org${key}` : "https://openlibrary.org/"
  };
}

function showError(message) {
  const error = $("#error-message");
  error.textContent = message;
  error.hidden = false;
}

function updateFavoriteButton(button, saved) {
  button.classList.toggle("saved", saved);
  button.textContent = saved ? "♥" : "♡";
  button.setAttribute("aria-pressed", String(saved));
}

function cardFor(book) {
  const card = document.createElement("article");
  card.className = "book-card";

  const coverHTML = book.cover
    ? `<img src="${escapeHTML(book.cover)}" alt="Cover for ${escapeHTML(book.title)}" loading="lazy">`
    : `<div class="cover-placeholder"><small>LUMORA BOOKS</small><span>${escapeHTML(book.title)}</span><small>A STORY TO DISCOVER</small></div>`;

  card.innerHTML = `
    <div class="cover-wrap">
      ${coverHTML}
      <button class="favorite-btn ${favorites.has(book.id) ? "saved" : ""}"
        data-favorite="${escapeHTML(book.id)}"
        aria-label="Save ${escapeHTML(book.title)}"
        aria-pressed="${favorites.has(book.id)}">${favorites.has(book.id) ? "♥" : "♡"}</button>
    </div>
    <h3 class="book-title">${escapeHTML(book.title)}</h3>
    <p class="book-author">${escapeHTML(book.author)}</p>
    <p class="book-year">${book.year || "Year unavailable"}</p>
    <button class="details-btn" data-details="${escapeHTML(book.id)}">View details →</button>`;

  const img = card.querySelector("img");
  if (img) {
    img.addEventListener("error", () => {
      const placeholder = document.createElement("div");
      placeholder.className = "cover-placeholder";
      placeholder.innerHTML = `<small>LUMORA BOOKS</small><span>${escapeHTML(book.title)}</span><small>A STORY TO DISCOVER</small>`;
      img.replaceWith(placeholder);
    }, { once: true });
  }
  return card;
}

function renderBooks() {
  grid.replaceChildren();
  let visible = books.filter(book =>
    (!year || Number(book.year) === Number(year)) &&
    (!category || book.subjects.some(subject =>
      String(subject).toLowerCase().includes(category.toLowerCase())
    ))
  );

  if (sort === "title") visible.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "year-desc") visible.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (sort === "year-asc") visible.sort((a, b) => (a.year || 99999) - (b.year || 99999));

  visible.forEach(book => grid.append(cardFor(book)));
  $("#result-count").textContent = `${visible.length} shown`;
  $("#empty-message").hidden = visible.length > 0;
  $("#prev-btn").disabled = page <= 1;
  $("#next-btn").disabled = !hasNextPage;
  $("#page-info").textContent = `Page ${page}`;
}

async function searchBooks() {
  const requestId = ++searchRequest;
  $("#loading").hidden = false;
  $("#error-message").hidden = true;
  $("#empty-message").hidden = true;
  grid.replaceChildren();

  let url = "";
  if (apiSource === "openlibrary") {
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      q: query || (category ? `subject:${category}` : "popular books")
    });
    url = `https://openlibrary.org/search.json?${params}`;
  } else if (apiSource === "googlebooks") {
    const params = new URLSearchParams({
      maxResults: String(limit),
      startIndex: String((page - 1) * limit),
      q: query || (category ? `subject:${category}` : "bestsellers")
    });
    url = `https://www.googleapis.com/books/v1/volumes?${params}`;
  } else {
    const params = new URLSearchParams({
      page: String(page),
      search: query || category || "fiction"
    });
    url = `https://gutendex.com/books/?${params}`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${API_NAMES[apiSource]} returned HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== searchRequest) return;

    const rows = apiSource === "openlibrary"
      ? (data.docs || [])
      : apiSource === "googlebooks"
        ? (data.items || [])
        : (data.results || []);

    books = rows.map(book => normalizeBook(book, apiSource));

    hasNextPage = apiSource === "gutendex"
      ? Boolean(data.next)
      : apiSource === "googlebooks"
        ? (page * limit < (data.totalItems || 0))
        : rows.length === limit;

    $("#results-title").textContent = query
      ? `Results for “${query}”`
      : (category
        ? `${category[0].toUpperCase()}${category.slice(1)} reads`
        : "Popular reads");

    renderBooks();
  } catch (error) {
    if (requestId !== searchRequest) return;
    books = [];
    hasNextPage = false;
    renderBooks();
    showError(`Unable to load ${API_NAMES[apiSource]}. Please check your internet connection or try another book API. (${error.message})`);
    console.error(error);
  } finally {
    if (requestId === searchRequest) $("#loading").hidden = true;
  }
}

function renderLibrary() {
  libraryGrid.replaceChildren();
  const empty = favorites.size === 0;
  $("#library-status").hidden = !empty;
  $("#library-status").textContent = empty
    ? "Your library is empty. Tap ♡ on a book to save it."
    : "";
  favorites.forEach(book => libraryGrid.append(cardFor(book)));
}

async function toggleFavorite(id) {
  const book = books.find(item => item.id === id) || favorites.get(id);
  if (!book) return;

  try {
    if (user && db) {
      const ref = doc(db, "users", user.uid, "favorites", encodeURIComponent(id).replaceAll("%", "_"));
      if (favorites.has(id)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { ...book, savedAt: Date.now() });
      }
    } else {
      if (favorites.has(id)) favorites.delete(id);
      else favorites.set(id, { ...book, savedAt: Date.now() });
      localStorage.setItem("lumoraBooksFavorites", JSON.stringify([...favorites.entries()]));
      renderBooks();
      renderLibrary();
      $("#auth-status").textContent = "Saved on this device";
    }
  } catch (error) {
    console.error(error);
    alert("Couldn't update your saved books. Please try again.");
  }
}

function showDetails(id) {
  const book = books.find(item => item.id === id) || favorites.get(id);
  if (!book) return;

  const cover = book.cover
    ? `<img class="dialog-cover" src="${escapeHTML(book.cover)}" alt="Book cover">`
    : "";
  const description = book.description
    ? `<p><strong>About:</strong> ${escapeHTML(book.description)}</p>`
    : "";

  $("#book-details").innerHTML = `
    ${cover}
    <p class="eyebrow">LUMORA BOOKS · BOOK DETAILS</p>
    <h2>${escapeHTML(book.title)}</h2>
    <div class="dialog-info">
      <p><strong>Author:</strong> ${escapeHTML(book.authors?.join(", ") || book.author || "Unavailable")}</p>
      <p><strong>Publication year:</strong> ${escapeHTML(book.year || "Unavailable")}</p>
      <p><strong>ISBN:</strong> ${escapeHTML(book.isbn || "Unavailable")}</p>
      ${description}
      <p><strong>Book source:</strong> ${escapeHTML(API_NAMES[book.source] || "Book catalogue")}</p>
      <p><a target="_blank" rel="noopener noreferrer" href="${escapeHTML(book.link || "https://openlibrary.org/")}">Open book information ↗</a></p>
    </div>
    <div style="clear:both"></div>`;
  $("#book-dialog").showModal();
}

$("#search-form").addEventListener("submit", event => {
  event.preventDefault();
  query = $("#search-input").value.trim();
  page = 1;
  searchBooks();
});

$("#api-source").addEventListener("change", event => {
  apiSource = event.target.value;
  page = 1;
  searchBooks();
});

$("#category-filter").addEventListener("change", event => {
  category = event.target.value;
  page = 1;
  document.querySelectorAll("[data-category]").forEach(button =>
    button.classList.toggle("active", button.dataset.category === category)
  );
  searchBooks();
});

document.querySelectorAll("[data-category]").forEach(button => {
  button.addEventListener("click", () => {
    category = button.dataset.category;
    $("#category-filter").value = category;
    page = 1;
    document.querySelectorAll("[data-category]").forEach(chip =>
      chip.classList.toggle("active", chip === button)
    );
    searchBooks();
  });
});

$("#year-filter").addEventListener("input", event => {
  year = event.target.value.trim();
  renderBooks();
});
$("#sort-filter").addEventListener("change", event => {
  sort = event.target.value;
  renderBooks();
});

$("#clear-filters").addEventListener("click", () => {
  query = "";
  category = "";
  year = "";
  sort = "relevance";
  page = 1;
  $("#search-input").value = "";
  $("#category-filter").value = "";
  $("#year-filter").value = "";
  $("#sort-filter").value = "relevance";
  document.querySelectorAll("[data-category]").forEach(button =>
    button.classList.toggle("active", !button.dataset.category)
  );
  searchBooks();
});

$("#prev-btn").addEventListener("click", () => {
  if (page > 1) {
    page--;
    searchBooks();
    location.hash = "discover";
  }
});
$("#next-btn").addEventListener("click", () => {
  if (hasNextPage) {
    page++;
    searchBooks();
    location.hash = "discover";
  }
});

document.addEventListener("click", event => {
  const favoriteButton = event.target.closest("[data-favorite]");
  const detailsButton = event.target.closest("[data-details]");
  if (favoriteButton) toggleFavorite(favoriteButton.dataset.favorite);
  if (detailsButton) showDetails(detailsButton.dataset.details);
});

$("#close-dialog").addEventListener("click", () => $("#book-dialog").close());
$("#book-dialog").addEventListener("click", event => {
  if (event.target === $("#book-dialog")) $("#book-dialog").close();
});

function loadLocalFavorites() {
  try {
    favorites = new Map(JSON.parse(localStorage.getItem("lumoraBooksFavorites") || "[]"));
  } catch {
    favorites = new Map();
    localStorage.removeItem("lumoraBooksFavorites");
  }
}

if (auth && db) {
  onAuthStateChanged(auth, async signedInUser => {
    if (unsubscribeFavorites) unsubscribeFavorites();
    user = signedInUser;

    if (!user) {
      $("#auth-status").textContent = "Connecting...";
      favorites.clear();
      renderLibrary();
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error(error);
        loadLocalFavorites();
        $("#auth-status").textContent = "Local library mode";
        renderLibrary();
      }
      return;
    }

    $("#auth-status").textContent = "Library connected";
    const favoritesRef = collection(db, "users", user.uid, "favorites");
    unsubscribeFavorites = onSnapshot(favoritesRef, snapshot => {
      favorites.clear();
      snapshot.forEach(item => {
        const book = item.data();
        if (book?.id) favorites.set(book.id, book);
      });
      renderBooks();
      renderLibrary();
    }, error => {
      console.error(error);
      $("#library-status").hidden = false;
      $("#library-status").textContent = "Couldn't load saved books. Please check your Firebase Firestore Rules.";
    });
  });
} else {
  loadLocalFavorites();
  $("#auth-status").textContent = "Local library mode";
  renderLibrary();
}

searchBooks();
