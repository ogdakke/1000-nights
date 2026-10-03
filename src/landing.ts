const shelf = document.querySelector<HTMLElement>(".landing-shelf-track");
const backdrop = document.querySelector<HTMLElement>(".landing-backdrop");
const backdropWash = backdrop?.querySelector<HTMLElement>(".landing-backdrop-wash");
const hero = document.querySelector<HTMLElement>(".hero-artwork");
const heroLink = hero?.querySelector<HTMLAnchorElement>("a");
const captionTitle = hero?.querySelector<HTMLElement>("figcaption strong");
const captionAuthor = hero?.querySelector<HTMLElement>("figcaption span");
const books = Array.from(shelf?.querySelectorAll<HTMLAnchorElement>(".landing-book") ?? []);
const canHover = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 701px)");
const hasTouchPointer = window.matchMedia("(any-pointer: coarse)");
const allowPreview = () => canHover.matches && !hasTouchPointer.matches;

if (
  shelf &&
  backdrop &&
  backdropWash &&
  heroLink &&
  captionTitle &&
  captionAuthor &&
  books.length > 0
) {
  const initialBook = books[0];
  let currentBook = initialBook;
  let activeImage = heroLink.querySelector<HTMLImageElement>(".hero-cover-image");
  let activeBackdropImage = backdrop.querySelector<HTMLImageElement>("img");
  let request = 0;

  async function showBook(book: HTMLAnchorElement) {
    const thisRequest = ++request;
    if (book === currentBook) return;
    const image = book.querySelector<HTMLImageElement>("img");
    const title = book.querySelector<HTMLElement>("strong")?.textContent;
    const author = book.querySelector<HTMLElement>("small")?.textContent;
    if (
      !image ||
      !title ||
      !author ||
      !heroLink ||
      !captionTitle ||
      !captionAuthor ||
      !backdrop ||
      !backdropWash
    )
      return;

    const nextImage = document.createElement("img");
    nextImage.className = "hero-cover-image";
    nextImage.src = image.currentSrc || image.src;
    nextImage.alt = `Cover of ${title} by ${author}`;
    const nextBackdropImage = document.createElement("img");
    nextBackdropImage.src = nextImage.src;
    nextBackdropImage.alt = "";

    try {
      await Promise.all([nextImage.decode(), nextBackdropImage.decode()]);
    } catch {
      return;
    }
    if (thisRequest !== request) return;

    currentBook.classList.remove("is-featured");
    currentBook = book;
    book.classList.add("is-featured");
    heroLink.href = book.href;
    heroLink.setAttribute("aria-label", `Preview ${title} by ${author}`);
    captionTitle.textContent = title;
    captionAuthor.textContent = author;

    const previousImage = activeImage;
    const previousBackdropImage = activeBackdropImage;
    heroLink.appendChild(nextImage);
    backdrop.insertBefore(nextBackdropImage, backdropWash);
    activeImage = nextImage;
    activeBackdropImage = nextBackdropImage;
    void nextImage.offsetWidth;
    void nextBackdropImage.offsetWidth;
    nextImage.classList.add("is-visible");
    nextBackdropImage.classList.add("is-visible");
    if (previousImage) {
      previousImage.alt = "";
      previousImage.setAttribute("aria-hidden", "true");
      previousImage.classList.remove("is-visible");
    }
    previousBackdropImage?.classList.remove("is-visible");
    if (previousImage) window.setTimeout(() => previousImage.remove(), 640);
    if (previousBackdropImage) window.setTimeout(() => previousBackdropImage.remove(), 440);
  }

  for (const book of books) {
    book.addEventListener("pointerenter", (event) => {
      if (allowPreview() && (event.pointerType === "mouse" || event.pointerType === "pen")) {
        void showBook(book);
      }
    });
  }
  shelf.addEventListener("pointerleave", () => {
    if (allowPreview()) void showBook(initialBook);
  });
  const restoreOnTouch = () => {
    if (!allowPreview()) void showBook(initialBook);
  };
  canHover.addEventListener("change", restoreOnTouch);
  hasTouchPointer.addEventListener("change", restoreOnTouch);
}
