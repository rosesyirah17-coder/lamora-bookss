LUMORA BOOKS — SETUP & 3 BOOK APIS

PROJECT
Lumora Books is a responsive book-discovery website with search, filters,
book details, favourites and a personal library.

THREE APIS
1. Open Library Search API
   https://openlibrary.org/search.json?q=harry+potter
   Search for books, authors, publication years and book covers.

2. Google Books API
   https://www.googleapis.com/books/v1/volumes?q=harry+potter
   Search book metadata, categories, ISBN information and covers.

3. Gutendex API
   https://gutendex.com/books/?search=pride
   Search public-domain books from Project Gutenberg.

RUN THE WEBSITE
1. Extract the ZIP file.
2. Open the 'open-library' folder in Visual Studio Code.
3. Run index.html using the Live Server extension.
4. Open Discover and choose an API source.
5. Search for a title or author. Try 'Harry Potter' or 'Pride and Prejudice'.

FAVOURITES
Without Firebase configuration, favourites are saved in this browser using
localStorage under the key 'lumoraBooksFavorites'.

OPTIONAL FIREBASE CLOUD SYNC
1. Create a Firebase project.
2. Register a Web App and copy its Firebase web configuration.
3. Replace the placeholder values in firebase.js.
4. Enable Authentication > Anonymous.
5. Create a Cloud Firestore database.
6. Publish the rules in firestore.rules.

NOTES
- No API key is required for the basic Open Library, Google Books public
  endpoints, or Gutendex searches used by this project.
- Internet access is required for the APIs and Google Fonts.
- Firebase is optional. Local favourites work without Firebase.
