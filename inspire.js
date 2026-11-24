/* Daily inspiration card: a quote and a "Did you know?" fact on every app open.
 * No network, no API key. Content lives in this file, so it works offline.
 * Add to POOL.quotes / POOL.facts any time; the card rotates through them.
 *
 *   <script src="inspire.js" defer data-into="main" data-home-only="#/home"></script>
 *   Inspire.init({ into: 'main', homeRoute: '#/home' })
 */
(function () {
  'use strict';
  if (window.Inspire) return;

  const POOL = {
    quotes: [
      { t: 'Premature optimization is the root of all evil.', a: 'Donald Knuth' },
      { t: 'Simplicity is prerequisite for reliability.', a: 'Edsger W. Dijkstra' },
      { t: 'Make it work, make it right, make it fast.', a: 'Kent Beck' },
      { t: 'The best way to predict the future is to invent it.', a: 'Alan Kay' },
      { t: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', a: 'Martin Fowler' },
      { t: 'Programs must be written for people to read, and only incidentally for machines to execute.', a: 'Harold Abelson' },
      { t: 'The first principle is that you must not fool yourself, and you are the easiest person to fool.', a: 'Richard Feynman' },
      { t: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
      { t: 'Stay hungry, stay foolish.', a: 'Steve Jobs' },
      { t: 'Well done is better than well said.', a: 'Benjamin Franklin' },
      { t: 'What stands in the way becomes the way.', a: 'Marcus Aurelius (paraphrased)' },
      { t: 'It is not that we have a short time to live, but that we waste a lot of it.', a: 'Seneca' },
      { t: 'We suffer more often in imagination than in reality.', a: 'Seneca' },
      { t: 'You have power over your mind, not outside events. Realise this, and you will find strength.', a: 'Marcus Aurelius (paraphrased)' },
      { t: 'All that we are is the result of what we have thought.', a: 'Dhammapada (translation)' },
      { t: 'Knowing is not enough; we must apply. Willing is not enough; we must do.', a: 'Johann Wolfgang von Goethe' },
      { t: 'Strength does not come from physical capacity. It comes from an indomitable will.', a: 'Mahatma Gandhi (attributed)' },
      { t: 'Be the change that you wish to see in the world.', a: 'Mahatma Gandhi (attributed)' },
      { t: 'Measure twice, cut once.', a: 'Proverb' },
      { t: 'A journey of a thousand miles begins with a single step.', a: 'Laozi' },
      { t: 'Fall seven times, stand up eight.', a: 'Japanese proverb' },
      { t: 'Small daily improvements over time lead to stunning results.', a: 'Robin Sharma (paraphrased)' },
      { t: 'Clear thinking requires courage rather than intelligence.', a: 'Thomas Szasz (attributed)' },
      { t: 'Rest is not idleness. Stepping back is part of the work.', a: 'John Lubbock (paraphrased)' },
    ],
    facts: [
      { c: 'Maths', t: 'A googol is 10 to the power of 100, a 1 followed by 100 zeros. It is far larger than the number of atoms in the observable universe.' },
      { c: 'Maths', t: 'Pi is irrational. Its decimal digits never end and never repeat in a pattern.' },
      { c: 'Maths', t: 'Euler’s identity, e to the power of i×pi plus 1 equals 0, links five famous constants in a single equation.' },
      { c: 'Maths', t: 'There are infinitely many prime numbers. Euclid proved this around 300 BC.' },
      { c: 'Maths', t: 'In a room of just 23 people, the chance that two share a birthday is already about 50%.' },
      { c: 'Maths', t: 'The number 0 was used as a number, with rules for arithmetic, in Brahmagupta’s work in 628 CE.' },
      { c: 'Tech', t: 'The term “bug” was popularised in 1947 when a moth was found stuck in a relay of the Harvard Mark II computer.' },
      { c: 'Tech', t: 'Linus Torvalds created Git in 2005 to manage Linux kernel development. Git was built in about two weeks.' },
      { c: 'Tech', t: 'Java was named after the coffee Java, while Python is named after the comedy group Monty Python.' },
      { c: 'Tech', t: 'Reading from memory is far faster than a random read from a spinning disk, which is why caching helps so much.' },
      { c: 'Life', t: 'Harvard’s Study of Adult Development, one of the longest running studies of adult life, found that close relationships were the strongest predictor of long-term happiness and health.' },
      { c: 'Life', t: 'Research on habits suggests that repeating an action in the same context makes it easier to do automatically over time.' },
      { c: 'Life', t: 'Doing something hard for a short burst and then taking a proper break is often more sustainable than long unbroken sessions.' },
      { c: 'Health', t: 'The brain makes up about 2% of body weight but uses roughly 20% of the body’s energy at rest.' },
      { c: 'Health', t: 'Adults are generally recommended to sleep 7 or more hours a night. Sleep is when the brain consolidates what you learned that day.' },
      { c: 'Health', t: 'Several studies find that a short walk after meals can blunt blood-sugar spikes.' },
      { c: 'Health', t: 'Even a few minutes of focused breathing can lower heart rate and help you reset during a stressful moment.' },
      { c: 'Relationships', t: 'John Gottman’s research on couples found that stable relationships tend to have about five positive interactions for every negative one during conflict.' },
      { c: 'Relationships', t: 'Asking a follow-up question is one of the strongest signs of active listening. People feel more understood when they are asked to say more.' },
      { c: 'Relationships', t: 'Saying thank you for small things builds more goodwill than most people expect.' },
      { c: 'Mind', t: 'Writing a to-do list for tomorrow before bed was linked, in a 2018 study, to falling asleep faster.' },
      { c: 'Mind', t: 'Learning something new, like a language or an instrument, can help build cognitive reserve over the long term.' },
    ],
  };

  const KEY = 'inspire:last', HIDE = 'inspire:hidden';
  const get = (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Pick a quote and a fact at random, avoiding the pair shown last so the card changes on each open. */
  function pick(prevQ, prevF) {
    const one = (arr, avoid) => {
      if (arr.length < 2) return 0;
      let i; do { i = Math.floor(Math.random() * arr.length); } while (i === avoid);
      return i;
    };
    return { q: one(POOL.quotes, prevQ), f: one(POOL.facts, prevF) };
  }

  /* Styles are scoped to .inspire so they cannot be changed by the host app's global button or text rules. */
  const CSS = `
.inspire{box-sizing:border-box;display:block;width:100%;margin:0 0 16px;padding:16px 18px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;font:inherit;line-height:1.5;text-align:left;position:relative;z-index:1;min-width:0;overflow:visible}
.inspire[hidden],.inspire-show[hidden]{display:none!important}
.inspire .iq{margin:0;font-size:15px;font-style:italic;text-wrap:pretty}
.inspire .ia{margin:6px 0 0;font-size:12.5px;opacity:.7}
.inspire .if{margin:12px 0 0;font-size:14px;text-wrap:pretty}
.inspire .if b{font-weight:600}
.inspire .ic{display:inline-block;margin-left:6px;padding:0 8px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:999px;font-size:11px;line-height:18px;opacity:.75;white-space:nowrap;vertical-align:1px}
.inspire .ib{display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0}
.inspire .ib button{display:inline-block;width:auto;height:auto;min-width:0;margin:0;padding:6px 12px;font:inherit;font-size:12.5px;line-height:1.2;white-space:nowrap;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:6px;cursor:pointer}
.inspire .ib button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.inspire-show{display:inline-block;margin:0 0 12px;padding:2px 0;font:inherit;font-size:12.5px;line-height:1.4;color:inherit;background:none;border:0;opacity:.7;cursor:pointer;text-align:left}
`;

  function render(root, state) {
    const q = POOL.quotes[state.q], f = POOL.facts[state.f];
    root.innerHTML = `
      <p class="iq">“${esc(q.t)}”</p>
      <p class="ia">— ${esc(q.a)}</p>
      <p class="if"><b>Did you know?</b> ${esc(f.t)} <span class="ic">${esc(f.c)}</span></p>
      <div class="ib">
        <button type="button" data-a="next">Another</button>
        <button type="button" data-a="hide">Hide for now</button>
      </div>`;
  }

  function init(cfg) {
    cfg = cfg || {};
    if (!document.head || !document.body) return;
    if (!document.getElementById('inspire-style')) {
      const st = document.createElement('style'); st.id = 'inspire-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    const target = cfg.into ? document.querySelector(cfg.into) : null;
    if (cfg.into && !target) return;                     // no place to show the card
    const host = target || document.body;
    const homeOnly = cfg.homeRoute ? () => (location.hash || cfg.homeRoute) === cfg.homeRoute : () => true;

    const prev = (lsGet(KEY) || '').split(',').map(Number);
    let state = pick(prev[0], prev[1]);
    lsSet(KEY, state.q + ',' + state.f);

    const card = document.createElement('aside');
    card.className = 'inspire'; card.setAttribute('aria-label', 'Daily inspiration');
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'inspire-show'; show.textContent = 'Show inspiration';
    const hidden = get(HIDE) === '1';
    card.hidden = hidden; show.hidden = !hidden;
    render(card, state);

    card.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'next') {
        state = pick(state.q, state.f); lsSet(KEY, state.q + ',' + state.f); render(card, state);
      } else if (b.dataset.a === 'hide') {
        ssSet(HIDE, '1'); card.hidden = true; show.hidden = false;
      }
    });
    show.addEventListener('click', () => { ssSet(HIDE, ''); card.hidden = false; show.hidden = true; });

    /* Place the card at the top of the host. In an app that re-renders its main area on each route, keep it
       there only while the home route is open. */
    const sync = () => {
      const want = homeOnly();
      if (want) {
        if (!card.isConnected) host.prepend(card, show);
      } else {
        card.remove(); show.remove();
      }
    };
    sync();
    if (cfg.homeRoute && target) {
      new MutationObserver(() => { if (!card.isConnected && homeOnly()) sync(); else if (card.isConnected && !homeOnly()) sync(); })
        .observe(target, { childList: true });
      window.addEventListener('hashchange', sync);
    }
  }

  window.Inspire = { init, POOL };
  const me = document.currentScript;   // <script src="inspire.js" defer data-into="main" data-home-only="#/home">
  if (me) init({ into: me.dataset.into || '', homeRoute: me.dataset.homeOnly || '' });
})();
