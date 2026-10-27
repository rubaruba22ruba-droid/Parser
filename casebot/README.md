# Gift Cases — игровой бот (Telegram Mini App)

Кейсы с NFT-подарками Telegram. Без внешних зависимостей: Node ≥ 22.5 (встроенный `node:sqlite`).

## Структура
```
casebot/
├─ server/
│  ├─ main.mjs     HTTP-сервер + API (init, open, inventory, sell, withdraw, stats) + раздача webapp
│  ├─ cases.mjs    8 кейсов и шансы; веса подбираются бисекцией так, что RTP = 70%
│  ├─ gifts.json   122 подарка (генерится из tools/gifts-raw.txt)
│  ├─ ton.mjs      автопополнение: опрос toncenter, зачисление по комментарию dep<telegram_id>
│  ├─ auth.mjs     проверка подписи Telegram initData
│  ├─ bot.mjs      /start → кнопка «Играть» (WEBAPP_URL)
│  ├─ db.mjs       SQLite: users, inventory, opens, deposits, withdrawals
│  └─ config.mjs   env-настройки
├─ webapp/         index.html, style.css, app.js (рулетка, модалки, инвентарь, пополнение)
└─ tools/          gifts-raw.txt (Collection|floor) и gen-gifts.mjs
```

## Суть
1. Игрок открывает Mini App из бота → профиль создаётся по Telegram ID.
2. Пополнение: перевод TON на `UQCvGGYFcqrPS3h_AXiVzVHvmUTKLJJ5DurV_VBhpMXcQtd3` с комментарием `dep<id>`; сервер каждые 15 с находит транзакцию и зачисляет баланс (tx hash уникален — дублей нет).
3. Кейс списывает цену, сервер (crypto.randomInt) выбирает подарок по весам, кладёт в инвентарь; клиент лишь анимирует результат.
4. Подарок можно продать за floor-цену (баланс) или подать заявку на вывод (обрабатывается вручную, `stats` для ADMIN_IDS).

## Кейсы (RTP 70%, проверено симуляцией 400k открытий)
| Кейс | Цена | Дроп ≥70% цены | Дроп ≥ цены |
|---|---|---|---|
| Стартовый | 5 | 33% | 12% |
| Классик | 10 | 32% | 14% |
| Love | 10 | 24% | 15% |
| Winter | 10 | 30% | 22% |
| Gold | 25 | 31% | 18% |
| Premium | 60 | 31% | 14% |
| Whale | 150 | 36% | 6% |
| Legend | 500 | 15% | 15% |

Подарки без листингов (в списке «no listings») имеют **оценочную** цену (`estimated: true`) — поправьте в `tools/gifts-raw.txt` и выполните `npm run gifts`.

## Запуск
`cp .env.example .env`, задать переменные, `npm start`. Локально без Telegram: `npm run dev`, открыть `http://localhost:8080/?u=1`. Нужен HTTPS-домен для Mini App.
