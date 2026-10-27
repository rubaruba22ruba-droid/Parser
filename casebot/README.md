# Drade Drop — кейсы с NFT-подарками Telegram (бот + Mini App)

Фронтенд — исходник Force Gift из архива (структура, кейсы, лента, анимация открытия), поверх него новый дизайн
в стиле RubUP (`webapp/css/drade.css`, шрифты Unbounded + Onest), эффекты (`webapp/js/fx.js`) и апгрейдер как на
CaseBattle (`webapp/js/upgrade.js`). Бэкенд написан под API этого фронтенда. Node ≥ 22.5, без npm-зависимостей.

## Структура
```
casebot/
├─ server/
│  ├─ main.mjs      HTTP: API + раздача webapp, /config.js, /tonconnect-manifest.json
│  ├─ api.mjs       open-case, sell, inventory, init-withdraw, upgrade, daily-case/*, ton/*, рефералы
│  ├─ bot.mjs       /start → приветствие с баннером и кнопкой «Играть»; оплата Stars; админ-команды
│  ├─ ton.mjs       пополнение TON: TonConnect-платёж с комментарием-меткой + ручной перевод «dep<id>»
│  ├─ wallet.mjs    баланс ⭐, депозиты (без дублей), 10% рефереру, депозит за окно для вывода
│  ├─ auth.mjs      проверка подписи Telegram initData
│  ├─ catalog.mjs   кейсы в формате фронтенда
│  ├─ gifts.json    каталог (генерится)   cases.json  кейсы и шансы (генерится)
│  └─ config.mjs    настройки из .env
├─ webapp/          index.html, css/, js/, fonts/, images/gifts (реальные 3D-иконки), images/cases (обложки)
└─ tools/
   ├─ gifts-raw.txt все 122 подарка с floor (TON); «?» — нет листингов, стоит оценка
   ├─ images.py     скриншоты → вырезка → апскейл x4 (Real-ESRGAN) → прозрачный WebP
   ├─ build.mjs     каталог + кейсы, шансы подбираются под RTP 70%
   └─ case_art.py   обложки кейсов и баннер бота из реальных иконок
```

## Суть
- Валюта — ⭐ (1 TON = 100 ⭐). Пополнение: TON на `UQCvGGYFcqrPS3h_AXiVzVHvmUTKLJJ5DurV_VBhpMXcQtd3` (TonConnect или вручную с комментарием `dep<id>`) или Telegram Stars.
- 2 бесплатных кейса раз в 24 ч: сердечки по 15 ⭐ и одно NFT. Daily — с заданиями (3 шеринга + подписка на `DAILY_CHANNEL`).
- 9 платных кейсов: Фарм 49 / 249 / 399 ⭐, Обычные 790 / 1490 / 2990 ⭐, ALL IN 7 990 / 24 990 / 99 990 ⭐.
- Шансы — модель «щедрый дроп»: при RTP 70% примерно 22–44% открытий дают подарок дороже кейса, остальное — мелочь.
- Апгрейдер (как CaseBattle): ставка 1–6 подарков → цель (x1.5…x20) → шанс = ставка/цель × 0.6 (часто сливает). Сервер даёт `roll`, стрелка встаёт ровно туда.
- Вывод подарков: депозит ≥ 50 TON за 7 дней, заявка → поддержка @entoni и админам в бот.
- **Админка** (`/admin.html`, кнопка Admin в профиле для `ADMIN_IDS`): свои проценты (RTP, щедрость, шанс апгрейда, реферальный %, условия вывода, курс), цены и ручные шансы каждого кейса, вкл/выкл кейсов, юзеры (баланс, бан), заявки на вывод, промокоды (⭐ сразу или +% к пополнению), рассылка.
- Бот: `/start` → приветствие с баннером и кнопкой «Играть» (Mini App), кнопка меню «Играть» ставится сама, `/support`, оплата Stars, админ-команды `/stats /wd /done /reject /give /ban`.

## Картинки подарков
Только реальные 3D-рендеры. `tools/images.py` режет их со скриншотов (маркет Telegram «Купить подарок» → tggifts → RubUP),
увеличивает x4 нейросетью Real-ESRGAN и убирает фон. Подарок без картинки в игру не попадает.
Сейчас есть 101 из 128. Ждут картинку: Surge Boards, Desk Calendars, Light Swords, Moon Pendants, Clover Pins, Cookie Hearts,
Faith Amulets, Liberty Figures, Money Pots, Pretty Posies, Restless Jars, Snoop Doggs, Star Notepads, Stellar Rockets, Swag Bags,
Winter Wreaths, Easter Eggs, Happy Brownies, Lol Pops, Lunar Snakes, B-Day Candles, Bow Ties, Candy Canes, Chill Flames,
Holiday Drinks, Ice Creams, Jester Hats.

Цены: `tools/gifts-raw.txt` — свежий floor tggifts; для «no listings» — цена маркета Telegram ⭐ / 81 (средний курс по подаркам,
где известны обе цены) или прошлый floor. Это оценки — сверьте перед запуском (Plush Pepe ≈ 7 800 TON, Algorithm Cups ≈ 2 000 TON).

## Запуск
**Быстро (Render):** New → Blueprint → этот репозиторий (`casebot/render.yaml`), задать `BOT_TOKEN` (от @BotFather) и `ADMIN_IDS`.
Адрес Mini App подставится сам, бот при старте пропишет кнопку «Играть» — ссылка вшита, ничего вручную не настраивать.
Railway / свой сервер: `docker build -t drade casebot && docker run -p 8080:8080 -v drade:/data -e BOT_TOKEN=... -e WEBAPP_URL=https://... drade`
(нужен https-домен). Локально без Telegram: `npm run dev`.

Пересборка после правки цен/кейсов: `npm run build` (`node tools/build.mjs && python3 tools/case_art.py`).
Демо-превью без сервера: `node tools/demo.mjs <папка>`.
