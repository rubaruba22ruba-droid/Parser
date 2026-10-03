// Берём только то, что реально нужно сайту — остальное отбрасывается (tree-shaking).
// Anime.js: таймлайны, stagger, рисование SVG-линий.
// Motion (mini, на Web Animations API): scroll-reveal, hover/press.
import { animate as aAnimate, createTimeline, stagger, svg } from 'animejs';
import { animate as mAnimate } from 'motion/mini';
import { inView, hover, press } from 'motion';

window.NT = {
  anime: { animate: aAnimate, createTimeline, stagger, svg },
  motion: { animate: mAnimate, inView, hover, press }
};
