import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type Photo = {
  path: string;
  /** A 640px WebP, the fallback for browsers without srcset. */
  url: string;
  width: number;
  height: number;
  /** AVIF first, about half the size of WebP for these grainy frames. */
  srcSet: { avif: string; webp: string };
  /** Large copies for the lightbox, in place of the 3000px originals. */
  fullSrcSet: { avif: string; webp: string };
  title: string;
};

type Rendition = { src: string; width: number; height: number };

type PhotoGroup = {
  id: string;
  title: string;
  photos: Photo[];
};

/**
 * Drop images into a folder under src/photos and the folder becomes a roll on
 * the next build. Loose images at the top level gather into "Loose frames".
 */
/**
 * Renditions generated at build time by vite-imagetools: a small set for the
 * grid, a large set for the lightbox, each in AVIF and WebP, and one 640px
 * WebP whose size gives each print its shape before it loads. The originals
 * are never sent. (Each glob needs its query written out in full.)
 */
const GRID_AVIF = import.meta.glob('./photos/**/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  query: '?w=320;480;640;960&format=avif&quality=50&as=srcset',
  import: 'default',
}) as Record<string, string>;

const GRID_WEBP = import.meta.glob('./photos/**/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  query: '?w=320;480;640;960&format=webp&quality=72&as=srcset',
  import: 'default',
}) as Record<string, string>;

const FULL_AVIF = import.meta.glob('./photos/**/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  query: '?w=1280;1920;2560&format=avif&quality=54&as=srcset',
  import: 'default',
}) as Record<string, string>;

const FULL_WEBP = import.meta.glob('./photos/**/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  query: '?w=1280;1920;2560&format=webp&quality=76&as=srcset',
  import: 'default',
}) as Record<string, string>;

const RENDITIONS = import.meta.glob('./photos/**/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  query: '?w=640&format=webp&quality=72&as=metadata',
  import: 'default',
}) as Record<string, Rendition>;

const PHOTOS: Photo[] = Object.entries(RENDITIONS)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, rendition]) => ({
    path,
    url: rendition.src,
    width: rendition.width,
    height: rendition.height,
    srcSet: { avif: GRID_AVIF[path], webp: GRID_WEBP[path] },
    fullSrcSet: { avif: FULL_AVIF[path], webp: FULL_WEBP[path] },
    title: titleFrom(path),
  }));

const GRID_SIZES = '(max-width: 620px) 46vw, (max-width: 900px) 40vw, 222px';
/** The lightbox fits each photo by width or height, whichever binds first. */
function fullSizes(photo: Photo) {
  const ratio = (photo.width / photo.height).toFixed(3);
  return `(max-width: 620px) min(calc(100vw - 48px), calc((100vh - 120px) * ${ratio})), min(1120px, calc(100vw - 112px), calc((100vh - 140px) * ${ratio}))`;
}

/** Folders listed here come first, in this order; the rest follow alphabetically. */
const GROUP_ORDER = ['hokkaido', 'guangzhou', 'osaka'];
const LOOSE_GROUP = 'loose-frames';

function folderFrom(path: string) {
  const segments = path.split('/');
  return segments.length > 3 ? segments[2] : LOOSE_GROUP;
}

const GROUPS: PhotoGroup[] = [...new Set(PHOTOS.map((photo) => folderFrom(photo.path)))]
  .sort((a, b) => {
    const rank = (folder: string) => {
      if (folder === LOOSE_GROUP) return GROUP_ORDER.length + 1;
      const index = GROUP_ORDER.indexOf(folder);
      return index === -1 ? GROUP_ORDER.length : index;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  })
  .map((folder) => ({
    id: folder,
    title: folder === LOOSE_GROUP ? 'Loose frames' : titleFrom(`/${folder}`),
    photos: PHOTOS.filter((photo) => folderFrom(photo.path) === folder),
  }));

const STACK_TRANSFORMS = [
  'translate3d(-40px, 18px, 0) rotate(-7deg)',
  'translate3d(28px, -14px, 0) rotate(5deg)',
  'translate3d(-12px, -26px, 0) rotate(-2deg)',
  'translate3d(22px, 20px, 0) rotate(4deg)',
];

const STACK_SPRING = { type: 'spring' as const, duration: 0.5, bounce: 0.16 };
const GROUP_FOCUS_LINE = 0.5;

function titleFrom(path: string) {
  const stem = path
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '');
  return stem
    .replace(/^\d+[-_]?/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, (character) => character.toUpperCase());
}

const number = (index: number) => String(index + 1).padStart(2, '0');

/** A small, stable tilt and drift per photo, so open rolls sit loose on the page. */
function scatterFrom(path: string) {
  let hash = 0;
  for (const character of path) hash = (hash * 31 + character.charCodeAt(0)) % 1000003;
  const pick = (shift: number, span: number) => (((hash >> shift) % 100) / 100) * span - span / 2;
  return `translate3d(${pick(2, 12).toFixed(1)}px, ${pick(4, 16).toFixed(1)}px, 0) rotate(${pick(6, 4.2).toFixed(2)}deg)`;
}

export default function App() {
  const [openGroupId, setOpenGroupId] = useState<string | null>(GROUPS[0]?.id ?? null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    let frame = 0;

    const updateGroupInView = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const focusLine = window.innerHeight * GROUP_FOCUS_LINE;
        let nextGroupId = GROUPS[0]?.id ?? null;

        GROUPS.forEach((group) => {
          const section = groupRefs.current[group.id];
          if (section && section.getBoundingClientRect().top <= focusLine) {
            nextGroupId = group.id;
          }
        });

        setOpenGroupId((current) => (current === nextGroupId ? current : nextGroupId));
      });
    };

    updateGroupInView();
    window.addEventListener('scroll', updateGroupInView, { passive: true });
    window.addEventListener('resize', updateGroupInView);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateGroupInView);
      window.removeEventListener('resize', updateGroupInView);
    };
  }, []);

  // Stable across renders, so the memoised rolls below skip re-rendering (and
  // Motion skips re-measuring their prints) when only the lightbox changes.
  const actions = useRef({
    focusGroup(groupId: string) {
      const section = groupRefs.current[groupId];
      if (!section) return;

      const target =
        window.scrollY +
        section.getBoundingClientRect().top -
        window.innerHeight * GROUP_FOCUS_LINE;

      window.scrollTo({
        top: Math.max(0, target),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    },
    openPhoto(photo: Photo) {
      setExpandedIndex(PHOTOS.indexOf(photo));
    },
    setRef(groupId: string, element: HTMLElement | null) {
      groupRefs.current[groupId] = element;
    },
  }).current;

  return (
    <>
      <div className="page-shell">
        <header className="topbar">
          <a className="home-link" href="https://theoazriel.com">
            <span aria-hidden="true">←</span> Home
          </a>
        </header>

        <main className="gallery-layout">
          <aside className="group-index" aria-label="Photo groups">
            <p className="index-label">Index</p>
            <ol>
              {GROUPS.map((group, groupIndex) => {
                const isOpen = openGroupId === group.id;
                return (
                  <li key={group.id}>
                    <button
                      className={isOpen ? 'is-active' : undefined}
                      type="button"
                      onClick={() => actions.focusGroup(group.id)}
                      aria-expanded={isOpen}
                      aria-controls={group.id}
                    >
                      <span>{group.title}</span>
                      <span className="index-number">{number(groupIndex)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="groups">
            <h1 className="sr-only">Photographs</h1>
            {GROUPS.map((group) => (
              <PhotoGroupView
                key={group.id}
                group={group}
                isOpen={openGroupId === group.id}
                reduceMotion={reduceMotion}
                actions={actions}
              />
            ))}
          </div>
        </main>
      </div>

      {expandedIndex !== null && <Lightbox index={expandedIndex} onChange={setExpandedIndex} />}
    </>
  );
}

type GroupActions = {
  focusGroup(groupId: string): void;
  openPhoto(photo: Photo): void;
  setRef(groupId: string, element: HTMLElement | null): void;
};

/** One roll: a loose stack until it scrolls into view, then laid out on the table. */
const PhotoGroupView = memo(function PhotoGroupView({
  group,
  isOpen,
  reduceMotion,
  actions,
}: {
  group: PhotoGroup;
  isOpen: boolean;
  reduceMotion: boolean;
  actions: GroupActions;
}) {
  const gridStyle = {
    '--desktop-columns': Math.min(group.photos.length, 4),
    '--mobile-columns': Math.min(group.photos.length, 2),
  } as CSSProperties;
  const transition = reduceMotion ? { duration: 0 } : STACK_SPRING;

  return (
    <section
      className={`photo-group ${isOpen ? 'is-open' : 'is-closed'}`}
      id={group.id}
      ref={(element) => actions.setRef(group.id, element)}
      aria-labelledby={`${group.id}-title`}
    >
      <header className="group-heading">
        <h2 id={`${group.id}-title`}>{group.title}</h2>
        <p>
          {group.photos.length} {group.photos.length === 1 ? 'frame' : 'frames'}
        </p>
      </header>

      <motion.div
        className={`photo-grid ${isOpen ? 'is-tidy' : 'is-stacked'}`}
        layout={!reduceMotion}
        style={gridStyle}
        transition={transition}
      >
        {group.photos.map((photo, index) => (
          <motion.figure
            className="photo-card"
            key={photo.path}
            layout={!reduceMotion}
            transition={transition}
            style={{ zIndex: isOpen ? 1 : index + 1 }}
            aria-hidden={isOpen ? undefined : true}
          >
            <motion.div
              className="card-motion"
              initial={false}
              animate={{
                transform: reduceMotion
                  ? 'translate3d(0, 0, 0) rotate(0deg)'
                  : isOpen
                    ? scatterFrom(photo.path)
                    : STACK_TRANSFORMS[index % STACK_TRANSFORMS.length],
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { ...STACK_SPRING, delay: isOpen ? index * 0.045 : 0 }
              }
            >
              <button
                className="print"
                type="button"
                onClick={() => actions.openPhoto(photo)}
                aria-label={`Open ${photo.title}`}
                disabled={!isOpen}
                tabIndex={isOpen ? 0 : -1}
              >
                <picture className="print-image">
                  <source type="image/avif" srcSet={photo.srcSet.avif} sizes={GRID_SIZES} />
                  <img
                    src={photo.url}
                    srcSet={photo.srcSet.webp}
                    sizes={GRID_SIZES}
                    width={photo.width}
                    height={photo.height}
                    alt={photo.title}
                    loading={isOpen ? 'eager' : 'lazy'}
                    decoding="async"
                    ref={(element) => {
                      if (element?.complete) element.classList.add('is-loaded');
                    }}
                    onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                  />
                </picture>
              </button>
              <figcaption>
                <span>{photo.title}</span>
                <span>{number(index)}</span>
              </figcaption>
            </motion.div>
          </motion.figure>
        ))}

        {!isOpen && (
          <button
            className="stack-trigger"
            type="button"
            onClick={() => actions.focusGroup(group.id)}
            aria-expanded="false"
            aria-controls={group.id}
          >
            <span className="sr-only">Open {group.title}</span>
          </button>
        )}
      </motion.div>
    </section>
  );
});

/** A photo at lightbox size, the browser picking AVIF or WebP. */
function FullPhoto({ photo, decorative }: { photo: Photo; decorative?: boolean }) {
  return (
    <picture>
      <source type="image/avif" srcSet={photo.fullSrcSet.avif} sizes={fullSizes(photo)} />
      <img
        src={photo.url}
        srcSet={photo.fullSrcSet.webp}
        sizes={fullSizes(photo)}
        width={photo.width}
        height={photo.height}
        alt={decorative ? '' : photo.title}
        decoding="async"
      />
    </picture>
  );
}

function Lightbox({
  index,
  onChange,
}: {
  index: number;
  onChange: (index: number | null) => void;
}) {
  const photo = PHOTOS[index];
  const neighbours = [
    ...new Set([
      PHOTOS[(index + 1) % PHOTOS.length],
      PHOTOS[(index - 1 + PHOTOS.length) % PHOTOS.length],
    ]),
  ].filter((neighbour) => neighbour !== photo);
  const step = (by: number) => onChange((index + by + PHOTOS.length) % PHOTOS.length);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onChange(null);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.title}, full screen`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onChange(null);
      }}
    >
      {/* A new element per photo, so the last photo can't linger while the
          next one loads. Its neighbours wait hidden, already fetched, so
          stepping to them is instant. */}
      <FullPhoto key={photo.path} photo={photo} />
      <div hidden>
        {neighbours.map((neighbour) => (
          <FullPhoto key={neighbour.path} photo={neighbour} decorative />
        ))}
      </div>
      <p className="lightbox-caption">
        <span>{photo.title}</span>
        <span>
          {number(index)} / {number(PHOTOS.length - 1)}
        </span>
      </p>
      <button
        type="button"
        className="lightbox-close"
        onClick={() => onChange(null)}
        aria-label="Close photograph"
        autoFocus
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
