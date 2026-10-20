# HuaRongDao 華容道

[繁體中文](README.md) | English

Huarong Dao (華容道, also known as Klotski) in the browser. Play online: https://huarong-dao.web.app

Slide the pieces until Cao Cao (the big 2 × 2 block) reaches the exit. The game has 106 built-in levels, and you can design your own levels, check whether they can be solved, save them, or send them to friends with a share code. The interface is available in Traditional Chinese, Simplified Chinese and English.

It is a static, front-end-only website: no server of your own and no build step. Accounts and cloud sync use Firebase (Authentication and Firestore).

## Running it

- Open `index.html` in a browser and play.
- Or run `npm start` in this folder and open http://localhost:8080 .
- Deploying to Google Cloud: see [DEPLOY.md](DEPLOY.md) (in Chinese); it is one command in Cloud Shell.
- Any static hosting works too (GitHub Pages, Netlify, Cloudflare Pages…). Accounts, the level gallery and the leaderboard need Firebase; without it they are simply hidden.

## Features

| Feature | Details |
| --- | --- |
| Game | 4 × 5 board; drag, tap (moves right away when there is only one direction), yellow arrows, arrow keys; move counter (moving the same piece again counts as one move), timer, undo, redo, restart |
| Hints and auto-solve | A solver finds the shortest solution on the fly; a hint shows where the next piece should go |
| Built-in levels | 106 levels: Beginner 16, Intermediate 21, Classic 48 (traditional layouts such as 橫刀立馬, 將擁曹營, 峰迴路轉), International 7 (Daisy, Pennant Puzzle and others), Variants 4, Challenge 10; sorted by fewest moves within each category, every minimum verified by the solver; category tabs show counts, and you can show only unsolved levels; the list is paginated (a few full rows per page depending on screen width, 2 × 4 on phones), remembers your page, and opens at the first unsolved level |
| Clearing a level | Moves, time, stars (3 stars at the minimum, 2 within 1.5×; using 1–2 hints caps at 2 stars, 3 or more at 1 star), best records, next level |
| Progress | The current game is saved automatically; the home page offers "continue" |
| Level editor | Place the four piece types, drag, delete, mirror, clear, undo/redo, rename pieces, start from a built-in level; live check with the minimum number of moves; test play before saving; warns about unsaved changes |
| My levels | Search, play, edit, duplicate, delete (with undo), export one or all, import JSON (preview first, duplicate names renamed); paginated (4 per page on phones), returning to page 1 after you add or edit a level |
| Sharing | Every level gets a share code and a share link; friends see a preview and can play right away or add it to their levels; import accepts a code, a link or a whole chat message |
| Sharing scores | Share after clearing or from "your best": a text message (moves, minimum, stars, time, hints), a 1080 × 1350 score card image, and a challenge link; when a friend clears via the challenge link, the game compares your results |
| Touch and sound | Swipe a piece to move it; the phone layout fits the board and toolbar on one screen; wooden knocks, wall bumps, hint and clear sounds synthesized with Web Audio (no audio files); vibration on touch devices |
| Settings | Language, theme (system / light / dark), piece style (names / first character / plain blocks, with a live preview), sound and volume, vibration, animation speed, auto-solve speed, tap-to-move; back up all data, restore, clear records |
| Custom board sizes and exits | Boards from 3–6 columns × 4–7 rows; the exit can be on any side at any position; the editor asks before removing pieces when the board shrinks; 4 variant levels (3 × 6, 5 × 5, 4 × 6, 6 × 4); share codes, score cards, import and export all support it |
| Accounts and cloud sync | Sign in with Google or email and password; custom levels, records, the current game and settings sync to your other devices in real time; on first sign-in you can add the data you made while signed out; works offline and uploads when back online; sign out, delete account |
| Level gallery | Publish your levels (each layout only once, mirror images count as the same; built-in layouts cannot be published); sort by newest, most likes or most clears, search by name prefix; likes, clear counts and the top 5 records per level; authors can edit the name and description or unpublish; levels reported 3 times are hidden from the list |
| Leaderboard | Overall (stars, then levels cleared) and per level (moves, then time), with your own rank; only built-in levels, only results without hints or auto-solve; every record stores its moves and can be replayed; set your public name in Settings |
| Languages | Traditional Chinese, Simplified Chinese and English; follows the browser language by default and can be switched in Settings or the footer, taking effect immediately; built-in level names, descriptions and the generals' names are translated too, while names players typed stay as they are |
| Other | Three columns on desktop, two on tablets, one on phones; light and dark themes; keyboard support; on phones the board shrinks to the screen height and the page scrolls to it, so the board, exit and bottom buttons fit on one screen |

## Where data is stored

- Everything is saved in the browser's localStorage first: `huarongdao.v1` while signed out, `huarongdao.v1.u.<account id>` while signed in (removed on sign-out).
- On Firebase Hosting players can sign in; their data is stored in Firestore at `users/{uid}` as a single JSON string. The rules in `firestore.rules` let each person read and write only their own document.
- In the claude.ai preview, data syncs to the viewer's own Claude storage, which nobody else can see.
- Merging data from several devices (`merge` in `js/store.js`): levels keep the newer edit, records keep the better result, settings keep the later change; deleting a level or clearing records is timestamped so old copies on other devices don't bring them back. The result doesn't depend on the order of merging, so every device ends up with the same data.
- The current game is saved after every move but uploaded at most every 20 seconds (immediately when you switch tabs or apps) to save cloud usage; other changes upload within about 1.5 seconds.
- Accounts are switched on in `js/cloud-config.js`: the default `'auto'` reads the project settings on Firebase Hosting; `null` turns accounts off (and the gallery and leaderboard with them).

## Level gallery data

| Firestore path | Contents | Who can write |
| --- | --- | --- |
| `levels/{id}` | Share code, name, description, author, size, minimum moves, likes, clears, reports | The author creates, edits name and description, deletes; counters can only change by ±1 together with the documents below |
| `levels/{id}/likes/{uid}` | A like | The player (removed with the level when unpublished) |
| `levels/{id}/records/{uid}` | Public name, moves, time, hints | The player; only a better result, never fewer moves than the minimum |
| `reports/{id}_{uid}` | Report reason | The player, once per level; only visible to administrators in the console |

- `id` is a 64-bit hash of the layout (the smaller of the layout and its mirror image), so each layout can be published only once.
- The minimum number of moves is computed by the publisher's browser and recomputed when someone plays the level.
- The gallery only appears when deployed to Firebase; it is hidden in the claude.ai preview and on plain static hosting.

## Leaderboard data

| Firestore path | Contents | Checked by the rules |
| --- | --- | --- |
| `players/{uid}` | Public name, stars, levels cleared, `score = stars × 1000 + cleared` | Stars and clears only change together with one level record, by exactly the difference that record makes |
| `boards/{level}/records/{uid}` | Moves, time, the move list (3 characters per move) | Built-in levels only; at least the minimum number of moves; at least 0.2 s per move; only a better result |

- The built-in minimums are written into `firestore.rules`; after editing `js/levels.js` run `node tools/sync-rules.js` (the tests check this).
- The rules cannot check the moves themselves, so the per-level board replays every record in the browser and hides any that don't reach the exit. The overall board only has totals and cannot replay each record.
- Sorting by moves and time needs the composite index in `firestore.indexes.json`; the deploy script uploads it.

## Languages

- All text in the code is written in Traditional Chinese and wrapped in `t()`, for example `t('最少 {n} 步', { n: 81 })`; `js/i18n.js` looks it up for the current language.
- `js/i18n/zh-Hans.js` (Simplified Chinese) is generated by `npm run i18n:hans` with [OpenCC](https://github.com/nk2028/opencc-js), including vocabulary conversion (設定 → 设置). Don't edit it by hand.
- `js/i18n/en.js` holds the English translations. When English needs singular and plural forms, the value is `{ "one": "…", "other": "…" }`.
- After adding or changing text: run `npm run i18n:hans`, then add the missing English strings listed by `npm run i18n` to `js/i18n/en.js`. The tests check that nothing is missing in either language and that the placeholders match.
- Built-in level names, descriptions and default general names are stored in the original language and translated only for display, so saves, share codes and cloud data don't depend on the language.

## Files

```
index.html             Page skeleton
css/style.css          Styles (colors are CSS variables, including the dark theme)
js/engine.js           Board model, move rules, checks, solver (shared by the browser and Node)
js/levels.js           Built-in levels
js/share.js            Share code encoding and decoding
js/store.js            Storage: custom levels, records, current games, settings, backup and restore, merging across devices
js/settings.js         Setting defaults and how they apply (theme, animation speed, piece style)
js/ui.js               DOM helpers, icons, dialogs, toasts
js/i18n.js             Languages: t(), language detection and switching
js/i18n/*.js           Simplified Chinese (generated) and English dictionaries
js/cloud-config.js     Account switch ('auto' / null / a Firebase config)
js/cloud.js            Sign-in (Google, email) and cloud sync
js/gallery.js          Level gallery: publish, list, likes, records, reports
js/ranking.js          Leaderboard: submitting results, overall and per-level boards, replay and verification
js/sound.js            Sound (Web Audio) and vibration
js/board.js            Board component (shared by the game, editor and thumbnails)
js/io.js               Export, import, share and score dialogs, background checks
js/scorecard.js        Score card image (canvas to PNG)
js/views/*.js          Screens: home, game, editor, my levels, shared level, settings, gallery, leaderboard
js/app.js              Routing and startup
tests/engine.test.js   Engine and built-in level tests
tests/share.test.js    Share code tests
tests/store.test.js    Multi-device merge tests
tests/gallery.test.js  Gallery layout ids (mirroring, built-in levels)
tests/ranking.test.js  Leaderboard: move encoding, replay checks, stars, rules in sync
tests/i18n.test.js     Languages: every string translated, placeholders match, plurals
tools/build-single.js  Bundle into a single file (for the claude.ai preview)
tools/sync-rules.js    Write the built-in minimums into firestore.rules
tools/i18n.js          Collect strings, generate Simplified Chinese, find missing translations
firebase.json          Firebase Hosting and Firestore configuration
firestore.rules        Firestore security rules (personal data, gallery, leaderboard)
firestore.indexes.json Firestore composite index (leaderboard sorting)
deploy/firebase.sh     Deploy to Firebase Hosting and set up sign-in and Firestore
deploy/gcs.sh          Deploy to a public Cloud Storage bucket
deploy/hosting-only.sh Update only the website with a service account key (no database or sign-in changes)
```

## Tests

```
npm install   # only needed for the Simplified Chinese generator
npm test
```

The tests cover the move rules, board checks and import checks; every built-in level is solvable with the stated minimum (橫刀立馬 takes 81 moves); share codes round-trip and typos are detected; multi-device merging gives the same result in any order; leaderboard replays are verified; and every string has Simplified Chinese and English translations.

## Sources of the built-in levels

- The Classic and International layouts, and some Beginner, Intermediate and Challenge layouts, come from the Huarong Dao collection on [fayaa.com](http://fayaa.com/youxi/hrd/) (via the data in [SimonHung/Klotski](https://github.com/SimonHung/Klotski)), cross-checked against [jeantimex/hua-rong-dao-html](https://github.com/jeantimex/hua-rong-dao-html), [conwnet/huarongdao](https://github.com/conwnet/huarongdao) and [GNOME Klotski](https://github.com/GNOME/gnome-klotski). Every minimum given by the sources matches this project's solver.
- Names were converted to Traditional Chinese; the Chinese names of the English layouts are translations; the descriptions were written for this project.
- Five Beginner, three Intermediate, two Challenge (崇山峻嶺, 十面埋伏) and the four Variant levels are original levels picked with the solver.

## Level JSON format

```json
{
  "app": "huarongdao",
  "version": 1,
  "levels": [
    {
      "name": "橫刀立馬",
      "description": "The most classic opening",
      "difficulty": 4,
      "board": { "cols": 4, "rows": 5 },
      "exit": { "side": "bottom", "at": 1 },
      "goal": { "x": 1, "y": 3 },
      "pieces": [
        { "type": "king", "x": 1, "y": 0, "label": "曹操" },
        { "type": "tall", "x": 0, "y": 0, "label": "張飛" },
        { "type": "wide", "x": 1, "y": 2, "label": "關羽" },
        { "type": "soldier", "x": 1, "y": 3, "label": "兵" }
      ],
      "minMoves": 81
    }
  ]
}
```

Piece types: `king` Cao Cao 2×2, `tall` vertical general 1×2, `wide` horizontal general 2×1, `soldier` 1×1. Coordinates start at the top-left (0, 0).

- `board`: 3–6 columns (`cols`), 4–7 rows (`rows`).
- `exit`: the side (`bottom` / `top` / `left` / `right`) and the first cell `at` (the column on the top or bottom edge, the row on the left or right edge, from 0); the exit is two cells wide.
- `goal`: the top-left position Cao Cao must reach, derived from `exit`; older files with only `goal` are converted back to an exit.

## Share code format

```
HRD1-ABBCABBCDEEFDGHFI..J-eyJuIjoi5qmr5YiA56uL6aasIn0-5vtv
     └─ 20 cells ────────┘ └─ name etc. ──────────┘ └checksum
HRD2-55R1-AAB..AABC.DDEFGHHIFGJJIKK-eyJ…-zn0q
     └┬─┘ └─ cols × rows cells ───┘
      5 columns, 5 rows, exit on the right (R) starting at row 2 (1)
```

Standard 4 × 5 levels with the exit at the bottom center use the shorter HRD1; everything else uses HRD2. Both can be pasted into the import box.

- Board: one character per cell from the top-left, one letter per piece, `.` for empty cells.
- Name etc.: the JSON `{n name, d difficulty, l piece labels that differ from the defaults}`, UTF-8 then Base64URL. The description is left out to keep codes around 60 characters.
- Checksum: a hash of the first two parts, so typos and truncation are caught.
- Share link = site URL + `#/s/` + share code. It needs no server and works wherever the site is hosted.
- Challenge link = share link + `/r<moves>t<seconds>`, e.g. `…/r85t222`. The score is in the URL and not protected, so it is only meant for friendly challenges.
- In the claude.ai preview, or when opening the file directly, there is no shareable URL, so only the share code is shown.
