/* Daily inspiration card: a quote and a "Did you know?" fact on every app open.
 * No network, no API key. Content lives in this file, so it works offline.
 * Add to POOL.quotes / POOL.facts any time; the card rotates through them.
 *
 *   Inspire.init({ before: 'main', key: 'my-app' })
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

  /* Pick a quote and a fact at random, avoiding the last pair shown so the card changes on each open. */
  function pick(prevQ, prevF) {
    const pick1 = (arr, avoid) => {
      if (arr.length < 2) return 0;
      let i; do { i = Math.floor(Math.random() * arr.length); } while (i === avoid);
      return i;
    };
    const q = pick1(POOL.quotes, prevQ), f = pick1(POOL.facts, prevF);
    return { q, f };
  }

  const CSS = `
.inspire{margin:0 auto 14px;max-width:880px;padding:14px 16px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);font:inherit;line-height:1.5;color:inherit;box-sizing:border-box;min-width:0}
.inspire .iq{margin:0;font-size:15px;font-style:italic}
.inspire .ia{margin:4px 0 0;font-size:12.5px;opacity:.7}
.inspire .if{margin:10px 0 0;font-size:14px}
.inspire .if b{font-weight:600}
.inspire .ic{display:inline-block;margin-left:6px;padding:0 7px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:999px;font-size:11px;opacity:.75;vertical-align:1px}
.inspire .ib{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.inspire button{font:inherit;font-size:12.5px;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:6px;padding:4px 10px;cursor:pointer}
.inspire button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.inspire-show{margin:0 auto 10px;max-width:880px;display:block;font:inherit;font-size:12.5px;color:inherit;background:none;border:0;padding:2px 0;opacity:.7;cursor:pointer;text-align:left}
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
    const anchor = cfg.before ? document.querySelector(cfg.before) : null;
    const parent = anchor ? anchor.parentNode : document.body;
    const hidden = get(HIDE) === '1';
    const prev = (lsGet(KEY) || '').split(',').map(Number);
    let state = pick(prev[0], prev[1]);
    lsSet(KEY, state.q + ',' + state.f);

    const card = document.createElement('aside');
    card.className = 'inspire'; card.setAttribute('aria-label', 'Daily inspiration');
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'inspire-show'; show.textContent = 'Show inspiration';
    show.hidden = !hidden;
    card.hidden = hidden;

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

    parent.insertBefore(card, anchor || parent.firstChild);
    parent.insertBefore(show, card.nextSibling);
  }

  window.Inspire = { init, POOL };
  const me = document.currentScript;       // <script src="inspire.js" defer data-before="main">
  if (me) init({ before: me.dataset.before || '' });
})();
