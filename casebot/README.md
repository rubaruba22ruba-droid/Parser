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
- Валюта — ⭐ (1 TON = 100 ⭐). Пополнение: TON на `UQCvGGYFcqrPS3h_AXiVzVHvmUTKLJJ5DurV_VBhpMXcQtd3` или Telegram Stars.
- 2 бесплатных кейса раз в 24 ч (Daily — с заданиями: 3 шеринга + подписка на `DAILY_CHANNEL`): сердечки по 15 ⭐ и одно NFT.
- 9 платных кейсов: Фарм (25 / 75 / 199 ⭐), Обычные (450 / 790 / 1990 ⭐), ALL IN (4 990 / 12 990 / 49 990 ⭐). RTP каждого — ровно 70%.
- Апгрейдер: ставка 1–6 подарков → цель (x1.5…x20) → шанс = ставка/цель × 0.9 (макс. 75%). Сервер возвращает `roll`, стрелка встаёт ровно туда.
- Вывод подарков: нужен депозит ≥ 50 TON за последние 7 дней, заявка уходит в поддержку @entoni и админам в бот (`/wd`, `/done id`, `/reject id`).
- В игре показываются только подарки с реальной картинкой. Добавить подарок = положить `webapp/images/gifts/<id>.webp` и запустить сборку.

## Запуск
```
cp .env.example .env         # BOT_TOKEN, WEBAPP_URL (https), ADMIN_IDS ...
npm start                    # локально без Telegram: npm run dev
```
Пересборка после правки цен/кейсов: `node tools/build.mjs && python3 tools/case_art.py`.
