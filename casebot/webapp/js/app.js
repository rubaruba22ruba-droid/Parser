
// Данные входа Telegram: сохраняем, а если клиент потерял их после перехода/перезагрузки — восстанавливаем
(function () {
  try {
    var W = window.Telegram && Telegram.WebApp; if (!W) return;
    if (W.initData) { sessionStorage.setItem('dd_init', W.initData); return; }
    var s = sessionStorage.getItem('dd_init'); if (!s) return;
    var p = new URLSearchParams(s), unsafe = Object.assign({}, W.initDataUnsafe || {});
    try { unsafe.user = JSON.parse(p.get('user') || 'null'); } catch (e) { }
    unsafe.auth_date = p.get('auth_date'); unsafe.hash = p.get('hash'); if (p.get('start_param')) unsafe.start_param = p.get('start_param');
    try { W.initData = s; W.initDataUnsafe = unsafe; } catch (e) { }
    if (W.initData !== s) { Object.defineProperty(W, 'initData', { value: s, configurable: true }); Object.defineProperty(W, 'initDataUnsafe', { value: unsafe, configurable: true }); }
  } catch (e) { }
})();

(function () {
  var _ce = console.error;
  console.error = function () {
    var full = Array.prototype.join.call(arguments, ' ');
    if (full.indexOf('TON_CONNECT_SDK') !== -1 && (full.indexOf('aborted') !== -1 || full.indexOf('Abort') !== -1 || full.indexOf('unpause') !== -1 || full.indexOf('dispose') !== -1 || full.indexOf('Resource creation was aborted') !== -1))
      return;
    _ce.apply(console, arguments);
  };
})();

const FREE_CASE_IDS = ['case1', 'case2'];
function isFreeCaseId(id) { return FREE_CASE_IDS.indexOf(id) !== -1; }

let casesData = {};
let inventory = [];
let balance = 0;
let currentCase = null;
let animationFrameId = null;
let isCaseBeingOpened = false;
let isAnimationRunning = false;
let winningItem = null;
let animationStartTime = 0;
let currentPosition = 0;
let targetPosition = 0;
let animationDuration = 8000;
let decelerationStart = 0.7;
let isDecelerating = false;
let finalItemIndex = 0;
let itemsList = [];
let currentCategory = "all";
let tgUser = null;
let isAdmin = false;
let toastContainer = null; // Для тостов - объявляем в самом начале
let currentPromoType = 'case'; // Тип промокода: 'case' или 'deposit'
let referralCount = { count: 0, spent: 0, available: 0 };
let isDemoMode = false;
let openCount = 1;
let wonItems = []; // Array to store multiple won items

const topBalanceEl = document.getElementById('topBalance');
const caseSelection = document.getElementById('case-selection');
const caseOpening = document.getElementById('case-opening');
const profileSection = document.getElementById('profile-section');
const slotTrack = document.getElementById('slotTrack');
const openBtn = document.getElementById('openCaseBtn');
const caseContents = document.getElementById('caseContents');
const resultMessage = document.getElementById('resultMessage');
const backBtn = document.getElementById('backToSelection');
const caseImage = document.getElementById('caseImage');
const slotMachine = document.getElementById('slotMachine');
const caseVisualContainer = document.getElementById('caseVisualContainer');
const casePriceValue = document.getElementById('casePriceValue');

let freeCaseCountdownIntervalId = null;

function hidePagePreloader() {
  const el = document.getElementById('page-preloader');
  if (el) el.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  var webMode = typeof location !== 'undefined' && location.search && location.search.indexOf('web=1') !== -1;
  const isTelegramWebApp = typeof Telegram !== 'undefined' && Telegram.WebApp;

  if (!isTelegramWebApp) {
    if (!webMode) {
      hidePagePreloader();
      const pcLanding = document.getElementById('pc-landing');
      if (pcLanding) pcLanding.style.display = 'flex';
      const mainContent = document.querySelector('.app-container');
      if (mainContent) {
        const nav = document.getElementById('topNav');
        if (nav) nav.style.display = 'none';
        [].forEach.call(mainContent.querySelectorAll('#casesCategories, #case-selection, #case-opening, #profile-section, #friends-section, #admin-section'), function (el) {
          if (el) el.style.display = 'none';
        });
      }
      return;
    }
  }

  if (isTelegramWebApp) {
    Telegram.WebApp.ready();
    document.documentElement.style.backgroundColor = '#131418';
    document.body.style.backgroundColor = '#131418';
  }

  var hasInitData = isTelegramWebApp && Telegram.WebApp.initData;
  if (!hasInitData && !webMode) {
    console.error('❌ Telegram.WebApp.initData пустой');
    hidePagePreloader();
    setTimeout(() => { showAlert('Ошибка инициализации. Перезапустите приложение', 'error'); }, 500);
    return;
  }

  if (webMode && !hasInitData) {
    updateBalance();
    setupEventListeners();
    hidePagePreloader();
    return;
  }

  if (Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) {
    tgUser = Telegram.WebApp.initDataUnsafe.user;
    initTelegramUser();
  } else {
    console.error('❌ Не удалось получить данные пользователя');
    hidePagePreloader();
    return;
  }

  try {
    const initData = new URLSearchParams(Telegram.WebApp.initData);
    const userDataStr = initData.get('user');

    if (!userDataStr) {
      console.error('❌ Нет user в initData');
      hidePagePreloader();
      return;
    }

    const userData = JSON.parse(userDataStr);
    const response = await fetch('/api/check-ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({})
    });

    const result = await response.json();
    if (result.banned) {
      hidePagePreloader();
      window.location.href = '/banned.html';
      return;
    }
  } catch (error) {
    console.error('❌ Ошибка проверки бана:', error);
  }

  try {
    const adminMetaRes = await fetch('/api/admin/meta', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    if (adminMetaRes.ok) {
      const adminMeta = await adminMetaRes.json();
      isAdmin = !!adminMeta.isAdmin;
      if (isAdmin) {
        const adminBtnNav = document.getElementById('openAdminPanelBtn');
        const adminBtnProfile = document.getElementById('openAdminFromProfile');
        if (adminBtnNav) {
          adminBtnNav.style.display = 'none';
        }
        if (adminBtnProfile) {
          adminBtnProfile.style.display = 'inline-flex';
        }
      }
    }
  } catch (err) {
    console.error('Ошибка проверки прав админа:', err);
  }

  setupEventListeners();
  setupModifierListeners();

  try {
    await loadCases();
    initLiveDropFeed();
    if (tgUser) {
      await loadBalance();
    }
    hidePagePreloader();
  } catch (error) {
    console.error('❌ Ошибка загрузки данных:', error);
    hidePagePreloader();
  }
});

async function loadCases() {
  try {
    const [casesResponse, refResponse] = await Promise.all([
      fetch('/api/get-cases', {
        headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
      }),
      fetch('/api/referral-count', {
        headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
      }).catch(() => null)
    ]);
    if (!casesResponse.ok) throw new Error('Failed to load cases');

    casesData = await casesResponse.json();
    if (refResponse && refResponse.ok) {
      referralCount = await refResponse.json();
    }
    preloadFirstCaseImages(casesData, 8);
    renderCases();
  } catch (err) {
    console.error('Error loading cases:', err);
    showAlert('⚠️ Не удалось загрузить кейсы. Пожалуйста, попробуйте позже.');
  }
}

document.getElementById('starsTopUpBtn')?.addEventListener('click', handleStarsTopUp);

let lastViewBeforeDeposit = 'case-selection';

function openStarsModal() {
  if (document.getElementById('case-selection')?.classList.contains('hidden') === false) lastViewBeforeDeposit = 'case-selection';
  else if (document.getElementById('profile-section')?.classList.contains('hidden') === false) lastViewBeforeDeposit = 'profile-section';
  else if (document.getElementById('case-opening')?.classList.contains('active')) lastViewBeforeDeposit = 'case-opening';
  else if (document.getElementById('friends-section')?.classList.contains('hidden') === false) lastViewBeforeDeposit = 'friends-section';
  else if (document.getElementById('admin-section')?.classList.contains('hidden') === false) lastViewBeforeDeposit = 'admin-section';

  document.getElementById('deposit-section')?.classList.remove('hidden');
  document.getElementById('case-selection')?.classList.add('hidden');
  document.getElementById('case-selection')?.style.setProperty('display', 'none');
  document.getElementById('case-opening')?.classList.remove('active');
  document.getElementById('profile-section')?.classList.add('hidden');
  document.getElementById('friends-section')?.classList.add('hidden');
  document.getElementById('admin-section')?.classList.add('hidden');
  document.getElementById('casesCategories')?.style.setProperty('display', 'none');
  document.getElementById('topNav')?.style.setProperty('display', 'flex');
  window.scrollTo(0, 0);
}

function closeStarsModal() {
  document.getElementById('deposit-section')?.classList.add('hidden');
  document.getElementById('case-selection')?.classList.add('hidden');
  document.getElementById('profile-section')?.classList.add('hidden');
  document.getElementById('friends-section')?.classList.add('hidden');
  document.getElementById('admin-section')?.classList.add('hidden');
  document.getElementById('case-opening')?.classList.remove('active');
  if (lastViewBeforeDeposit === 'case-selection') {
    document.getElementById('case-selection')?.classList.remove('hidden');
    document.getElementById('case-selection')?.style.removeProperty('display');
    document.getElementById('casesCategories')?.style.removeProperty('display');
    document.getElementById('topNav')?.style.setProperty('display', 'flex');
  } else if (lastViewBeforeDeposit === 'profile-section') {
    document.getElementById('profile-section')?.classList.remove('hidden');
    document.getElementById('casesCategories')?.style.setProperty('display', 'none');
    document.getElementById('topNav')?.style.setProperty('display', 'none');
  } else if (lastViewBeforeDeposit === 'case-opening') {
    document.getElementById('case-opening')?.classList.add('active');
    document.getElementById('case-selection')?.style.setProperty('display', 'none');
    document.getElementById('casesCategories')?.style.setProperty('display', 'none');
    document.getElementById('topNav')?.style.setProperty('display', 'flex');
  } else if (lastViewBeforeDeposit === 'friends-section') {
    document.getElementById('friends-section')?.classList.remove('hidden');
    document.getElementById('casesCategories')?.style.setProperty('display', 'none');
    document.getElementById('topNav')?.style.setProperty('display', 'none');
  } else if (lastViewBeforeDeposit === 'admin-section') {
    document.getElementById('admin-section')?.classList.remove('hidden');
    document.getElementById('casesCategories')?.style.setProperty('display', 'none');
    document.getElementById('topNav')?.style.setProperty('display', 'flex');
  } else {
    document.getElementById('case-selection')?.classList.remove('hidden');
    document.getElementById('case-selection')?.style.removeProperty('display');
    document.getElementById('casesCategories')?.style.removeProperty('display');
    document.getElementById('topNav')?.style.setProperty('display', 'flex');
  }
  window.scrollTo(0, 0);
}

document.getElementById("starsModalBackdrop")?.addEventListener("click", closeStarsModal);

async function doStarsTopUp(amount, promoCode) {
  const numAmount = parseInt(amount, 10);
  if (!numAmount || numAmount <= 0) {
    showAlert('Введите сумму больше 0', 'warning');
    return;
  }
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  if (!userId) {
    showAlert('Ошибка получения Telegram ID', 'error');
    return;
  }
  try {
    const body = { amount: numAmount };
    if (promoCode && String(promoCode).trim()) body.promoCode = String(promoCode).trim();
    const response = await fetch('/api/create-stars-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.invoice_url) {
      showAlert(data.error || 'Не удалось создать счёт', 'error');
      return;
    }
    Telegram.WebApp.openInvoice(data.invoice_url, async (status) => {
      if (status === 'paid') {
        const bonus = data.bonusPercent ? ` (с бонусом ${data.bonusPercent}%)` : '';
        showAlert(`Баланс пополнен на ${numAmount}${bonus}`, 'success', { title: 'Пополнение' });
        try {
          await new Promise(r => setTimeout(r, 1200));
          const balanceRes = await fetch('/api/get-balance', {
            headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
          });
          const balanceData = await balanceRes.json();
          if (balanceRes.ok && balanceData.balance !== undefined) {
            balance = balanceData.balance;
            updateBalance();
            updateProfilePage();
            updateCaseOpenButtonState();
          }
          closeStarsModal();
          setTimeout(function () { window.scrollTo(0, 0); }, 50);
        } catch (e) {
          console.error('Ошибка обновления баланса после оплаты:', e);
          showAlert('Платёж прошёл. Если баланс не обновился — перезайдите в приложение.', 'warning');
          closeStarsModal();
          setTimeout(function () { window.scrollTo(0, 0); }, 50);
        }
      }
    });
  } catch (err) {
    console.error(err);
    showAlert('Ошибка сервера', 'error');
  }
}

async function handleStarsTopUp() {
  const fromPage = document.getElementById('depositAmountInput');
  const amount = fromPage ? parseInt(fromPage.value, 10) : parseInt(document.getElementById('starsAmountInput')?.value, 10);
  const promoCode = document.getElementById('depositPromoInput')?.value;
  await doStarsTopUp(amount || 0, promoCode);
}

async function loadBalance() {
  try {
    const userId = tgUser?.id;
    if (!userId) return;

    const response = await fetch(`/api/get-balance`, {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await response.json();

    if (data.balance !== undefined) {
      balance = data.balance;
      updateBalance();
    }
  } catch (err) {
    console.error('Ошибка загрузки баланса:', err);
    balance = 0;
    updateBalance();
  }
}

function preloadFirstCaseImages(data, maxCount) {
  if (!data || typeof data !== 'object' || maxCount < 1) return;
  const order = [
    data.case1, data.case2, data.case3, data.case4, data.case5, data.case6,
    data.case7, data.case8, data.case9, data.case10, data.case11, data.case12,
    data.case13, data.case14, data.case15, data.case16, data.case17, data.case18, data.case19, data.case20
  ].filter(Boolean);
  for (let i = 0; i < Math.min(order.length, maxCount); i++) {
    const c = order[i];
    if (c && c.image) {
      const imageName = c.image.split('/').pop();
      if (imageName) (new Image()).src = c.image;
    }
  }
}

function renderCases() {
  caseSelection.innerHTML = '';

  if (!casesData || Object.keys(casesData).length === 0) {
    caseSelection.innerHTML = '<div class="error-message">Кейсы загружаются</div>';
    return;
  }

  let filteredCases = [];
  switch (currentCategory) {
    case "free":
      filteredCases = [casesData.case1, casesData.case2].filter(Boolean);
      break;
    case "farm":
      filteredCases = [casesData.case20, casesData.case4, casesData.case5, casesData.case6, casesData.case7].filter(Boolean);
      break;
    case "regular":
      filteredCases = [casesData.case3, casesData.case8, casesData.case9, casesData.case10, casesData.case11].filter(Boolean);
      break;
    case "allin":
      filteredCases = [casesData.case12, casesData.case13, casesData.case14, casesData.case15, casesData.case16, casesData.case17].filter(Boolean);
      break;
    case "referral":
      filteredCases = [casesData.case18, casesData.case19].filter(Boolean);
      break;
    default:
      filteredCases = Object.values(casesData).filter(Boolean);
  }

  const casesInOrder = [
    casesData.case1,
    casesData.case2,
    casesData.case3,
    casesData.case4,
    casesData.case5,
    casesData.case6,
    casesData.case7,
    casesData.case8,
    casesData.case9,
    casesData.case10,
    casesData.case11,
    casesData.case12,
    casesData.case13,
    casesData.case14,
    casesData.case15,
    casesData.case16,
    casesData.case17,
    casesData.case18,
    casesData.case19,
    casesData.case20
  ].filter(Boolean);

  let cardIndex = 0;
  // раскладка по id (а не по индексам сжатого массива — иначе кейсы съезжают между разделами)
  const GROUPS = [
    ['Бесплатные Кейсы', ['case1', 'case2']],
    ['Фарм Кейсы', ['case20', 'case4', 'case5', 'case6', 'case7']],
    ['Обычные Кейсы', ['case3', 'case8', 'case9', 'case10', 'case11']],
    ['ALL IN Кейсы', ['case12', 'case13', 'case14', 'case15', 'case16', 'case17']],
  ];
  GROUPS.forEach(([title, ids]) => {
    const list = ids.map(id => casesData[id]).filter(Boolean);
    if (!list.length) return;
    addSectionTitle(title);
    list.forEach(c => renderCaseCard(c, cardIndex++));
  });
}

function addSectionTitle(title) {
  const titleDiv = document.createElement('div');
  titleDiv.className = 'cases_block_title';
  titleDiv.textContent = title;

  if (title === 'Бесплатные Кейсы') titleDiv.id = 'free-cases';
  else if (title === 'Фарм Кейсы') titleDiv.id = 'farm-cases';
  else if (title === 'Обычные Кейсы') titleDiv.id = 'regular-cases';
  else if (title === 'ALL IN Кейсы') titleDiv.id = 'allin-cases';

  caseSelection.appendChild(titleDiv);
}

function renderCaseCard(c, cardIndex) {
  const card = document.createElement('div');
  card.className = 'case-card';
  card.dataset.caseId = c.id;
  const imageName = c.image.split('/').pop();

  const imagePath = c.image;

  const img = new Image();
  img.src = imagePath;

  const isReferral = !!c.referralOnly;
  const isFree = (c.price === 0 || c.price === '0') && !isReferral;

  const loadingAttr = 'eager';

  let priceHtml;
  if (isReferral) {
    priceHtml = `
      <div class="case-price">
        <img src="invite_user.svg" class="referral-price-icon" width="24" height="24" alt="">
        <div class="item_real_price">${c.referralPrice || 0}</div>
      </div>`;
  } else if (isFree) {
    priceHtml = `
      <div class="case-price case-price--free">
        <div class="item_real_price">FREE</div>
      </div>`;
  } else {
    priceHtml = `
      <div class="case-price">
        <img
          src="data:image/svg+xml,%3csvg%20viewBox='0%200%2014%2015'%20fill='%23FFCA5A'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20fill-rule='evenodd'%20clip-rule='evenodd'%20d='M6.63869%2012.1902L3.50621%2014.1092C3.18049%2014.3087%202.75468%2014.2064%202.55515%2013.8807C2.45769%2013.7216%202.42864%2013.5299%202.47457%2013.3491L2.95948%2011.4405C3.13452%2010.7515%203.60599%2010.1756%204.24682%209.86791L7.6642%208.22716C7.82352%208.15067%207.89067%207.95951%207.81418%207.80019C7.75223%207.67116%207.61214%207.59896%207.47111%207.62338L3.66713%208.28194C2.89387%208.41581%202.1009%208.20228%201.49941%207.69823L0.297703%206.69116C0.00493565%206.44581%20-0.0335059%206.00958%200.211842%205.71682C0.33117%205.57442%200.502766%205.48602%200.687982%205.47153L4.35956%205.18419C4.61895%205.16389%204.845%204.99974%204.94458%204.75937L6.36101%201.3402C6.5072%200.987302%206.91179%200.819734%207.26469%200.965925C7.43413%201.03612%207.56876%201.17075%207.63896%201.3402L9.05539%204.75937C9.15496%204.99974%209.38101%205.16389%209.6404%205.18419L13.3322%205.47311C13.713%205.50291%2013.9975%205.83578%2013.9677%206.2166C13.9534%206.39979%2013.8667%206.56975%2013.7269%206.68896L10.9114%209.08928C10.7131%209.25826%2010.6267%209.52425%2010.6876%209.77748L11.5532%2013.3733C11.6426%2013.7447%2011.414%2014.1182%2011.0427%2014.2076C10.8642%2014.2506%2010.676%2014.2208%2010.5195%2014.1249L7.36128%2012.1902C7.13956%2012.0544%206.8604%2012.0544%206.63869%2012.1902Z'%20fill='%23FFCA5A'/%3e%3c/svg%3e" 
          alt=""
          class="nav_topup-stars-icon"
        >
        <div class="item_real_price">${Number(c.price).toLocaleString('ru-RU')}</div>
      </div>`;
  }

  card.innerHTML = `
      <div class="card_image">
          <img src="${imagePath}" alt="${c.name}" title="${c.name}" loading="${loadingAttr}">
      </div>
      <div class="case-info">
          <div class="case-name">${c.name}</div>
          <div class="card_prices">
              ${priceHtml}
          </div>
      </div>
  `;

  img.onerror = function () {
    const imageDiv = card.querySelector('.card_image');
    if (imageDiv) {
      imageDiv.innerHTML = `<div style="padding:10px;color:white;text-align:center;">${c.name}<br><small>(no image)</small></div>`;
    }
  };

  card.addEventListener('click', () => openCase(c.id));
  caseSelection.appendChild(card);
}

async function sellAllItems() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      throw new Error('Необходимо авторизоваться');
    }

    const inventory = await fetch(`/api/inventory/${userId}`, {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    }).then(res => res.json());
    if (inventory.length === 0) {
      showAlert('Ваш инвентарь пуст');
      return;
    }

    const confirmed = await new Promise(resolve => {
      Telegram.WebApp.showConfirm(
        `Вы уверены, что хотите продать все предметы (${inventory.length} шт.)?`,
        resolve
      );
    });

    if (!confirmed) return;

    const response = await fetch('/api/sell-all-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({})
    });

    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error('Сервер вернул некорректный ответ. Попробуйте позже.');
    }
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Ошибка при продаже');
    }

    balance = result.newBalance;
    updateBalance();
    await renderInventory();

    showAlert(
      `Продано ${result.soldCount} предметов на сумму ${result.totalValue} ⭐. Средства зачислены на баланс`,
      'success',
      { title: 'Продажа предметов' }
    );
  } catch (err) {
    console.error('Ошибка продажи:', err);
    showAlert(`❌ Ошибка: ${err.message}`);
  }
}

async function sellFromInventory(itemId) {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      throw new Error("Необходимо авторизоваться в Telegram");
    }

    const item = inventory.find(i => i.id === parseInt(itemId));
    const itemName = item?.item_name || 'Предмет';

    const response = await fetch('/api/sell-item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ itemId })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || "Ошибка сервера");
    }

    balance = data.newBalance;
    updateBalance();
    await renderInventory();

    showAlert(
      `Предмет "${itemName}" продан за ${data.itemValue} ⭐. Средства зачислены на баланс`,
      'success',
      { title: 'Продажа предмета' }
    );
  } catch (err) {
    console.error("Ошибка продажи:", err);
    showAlert(`Ошибка: ${err.message}`, 'error', { title: 'Ошибка продажи' });
  }
}

async function checkRecentDeposit(userId, minAmount) {
  try {
    const response = await fetch('/api/check-deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ minAmount })
    });

    const result = await response.json();
    return result.hasDeposit;
  } catch (err) {
    console.error('Error checking deposit:', err);
    return false;
  }
}

function updateMobileMenuActiveState(activeItem) {
  const items = document.querySelectorAll('.mob_menu_item');
  items.forEach(item => item.classList.remove('active'));

  // Hide upgrade overlay when navigating away
  if (activeItem !== 'upgrade') {
    const upgSec = document.getElementById('upgrade-section');
    if (upgSec) { upgSec.style.display = 'none'; upgSec.classList.add('hidden'); }
    const upgModal = document.getElementById('upgradePickerModal');
    if (upgModal) upgModal.classList.add('hidden');
  }

  // Restore live drop and banner only for cases page
  if (activeItem === 'cases') {
    const liveDropFeed = document.getElementById('liveDropFeed');
    if (liveDropFeed) liveDropFeed.style.display = '';
    const starsBanner = document.getElementById('starsBanner');
    if (starsBanner) starsBanner.style.display = '';
  }

  switch (activeItem) {
    case 'profile':
      document.getElementById('mobileProfileBtn').classList.add('active');
      break;
    case 'cases':
      document.getElementById('mobileCasesBtn').classList.add('active');
      break;
    case 'friends':
      document.getElementById('mobileFriendsBtn').classList.add('active');
      break;
    case 'deposit':
      document.getElementById('mobileDepositBtn').classList.add('active');
      break;
    case 'upgrade':
      document.getElementById('mobileUpgradeBtn')?.classList.add('active');
      break;
  }
}

async function openReferralShare() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      showAlert('⚠️ Необходимо авторизоваться');
      return;
    }
    const prepResp = await fetch('/api/daily-case/prepare-share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    if (!prepResp.ok) {
      const errData = await prepResp.json().catch(() => ({}));
      showAlert(`⚠️ ${errData.error || 'Ошибка подготовки сообщения'}`);
      return;
    }
    const { msgId } = await prepResp.json();
    if (typeof Telegram?.WebApp?.shareMessage === 'function') {
      Telegram.WebApp.shareMessage(msgId);
    } else {
      showAlert('⚠️ Обновите Telegram для использования этой функции');
    }
  } catch (err) {
    console.error('Referral share error:', err);
    showAlert('⚠️ Ошибка отправки');
  }
}

async function copyRefLink() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      showAlert('⚠️ Необходимо авторизоваться');
      return;
    }

    const BOT_USERNAME = window.__BOT_USERNAME || '';
    const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;

    const fallbackCopy = () => {
      const tempInput = document.createElement('input');
      tempInput.value = refLink;
      tempInput.style.position = 'fixed';
      tempInput.style.opacity = '0';
      document.body.appendChild(tempInput);
      tempInput.select();
      tempInput.setSelectionRange(0, 99999);
      try {
        document.execCommand('copy');
        showAlert('✅ Ссылка скопирована!');
      } catch (e) {
        showAlert('⚠️ Нажмите Ctrl+C для копирования. Ссылка: ' + refLink);
      }
      document.body.removeChild(tempInput);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(refLink);
        showAlert('✅ Ссылка скопирована в буфер обмена!');
      } catch (e) {
        fallbackCopy();
      }
    } else {
      fallbackCopy();
    }
  } catch (err) {
    console.error('Copy error:', err);
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) return;
    const refLink = `https://t.me/${window.__BOT_USERNAME || ''}?start=ref_${userId}`;
    const confirmed = await new Promise(resolve => {
      Telegram.WebApp.showConfirm(
        `Не удалось скопировать автоматически. Ваша ссылка:\n\n${refLink}\n\nОткрыть Telegram для ручного копирования?`,
        resolve
      );
    });
    if (confirmed) {
      Telegram.WebApp.openTelegramLink(refLink);
    }
  }
}

function openRefLink() {
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  if (!userId) {
    showAlert('⚠️ Необходимо авторизоваться');
    return;
  }

  const BOT_USERNAME = window.__BOT_USERNAME || '';
  const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
  Telegram.WebApp.openTelegramLink(refLink);
}

async function openCase(caseId) {
  window.scrollTo(0, 0);
  if (freeCaseCountdownIntervalId) {
    clearInterval(freeCaseCountdownIntervalId);
    freeCaseCountdownIntervalId = null;
  }
  const openCaseBtnEl = document.getElementById('openCaseBtn');
  if (openCaseBtnEl) {
    openCaseBtnEl.classList.remove('open-case-button--opened');
    openCaseBtnEl.disabled = false;
    const defaultBlock = openCaseBtnEl.querySelector('.open-case-default');
    const openedBlock = openCaseBtnEl.querySelector('.open-case-opened');
    if (defaultBlock) defaultBlock.style.display = '';
    if (openedBlock) openedBlock.remove();
  }

  const scrollContainer = document.scrollingElement || document.documentElement;
  scrollContainer.scrollTop = 0;
  currentCase = casesData[caseId];
  if (currentCase && currentCase.items && currentCase.items.length) {
    currentCase.items.forEach(item => { if (item && item.image) (new Image()).src = item.image; });
  }
  isCaseBeingOpened = false;
  isAnimationRunning = false;
  // При смене кейса сбрасываем демо и множитель х2–х5 в х1
  isDemoMode = false;
  openCount = 1;
  caseSelection.style.display = 'none';
  caseOpening.classList.add('active');
  renderCaseContents(currentCase);
  document.getElementById('caseTitle').textContent = currentCase.name;
  const isFreeCase = (currentCase.price === 0 || currentCase.price === '0') && !currentCase.referralOnly;
  const isReferralCase = !!currentCase.referralOnly;
  const openCaseIcon = openBtn.querySelector('.open-case-icon');
  if (openCaseIcon) openCaseIcon.style.display = (isFreeCase || isReferralCase) ? 'none' : '';
  casePriceValue.textContent = (isFreeCase || isReferralCase) ? '' : currentCase.price;
  casePriceValue.style.display = (isFreeCase || isReferralCase) ? 'none' : '';
  document.getElementById('casesCategories').style.display = 'none';

  // Скрыть все блоки по умолчанию
  document.getElementById('notEnoughReferralsBlock').style.display = 'none';

  if (isReferralCase) {
    document.getElementById('openCaseBtn').style.display = 'none';
    document.getElementById('notEnoughStarsBlock').style.display = 'none';
    document.getElementById('promoCaseBlock').style.display = 'none';

    // Подгрузить актуальный счётчик рефералов
    try {
      const refResp = await fetch('/api/referral-count', {
        headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
      });
      if (refResp.ok) referralCount = await refResp.json();
    } catch (e) { /* используем кешированное значение */ }

    const need = (currentCase.referralPrice || 0) - (referralCount.available || 0);
    if (need > 0) {
      document.getElementById('notEnoughReferralsBlock').style.display = 'flex';
      document.getElementById('notEnoughReferralsCount').textContent = need;
    } else {
      document.getElementById('openCaseBtn').style.display = 'flex';
    }
  } else if (currentCase.promoOnly) {
    document.getElementById('openCaseBtn').style.display = 'none';
    document.getElementById('notEnoughStarsBlock').style.display = 'none';
    document.getElementById('promoCaseBlock').style.display = 'block';
  } else {
    document.getElementById('notEnoughReferralsBlock').style.display = 'none';
    document.getElementById('promoCaseBlock').style.display = 'none';
    updateCaseOpenButtonState();
  }

  // Hide modifiers if case is free or referral
  const modifiersBlock = document.getElementById('caseModifiersBlock');
  if (isFreeCase || isReferralCase || currentCase.promoOnly) {
    modifiersBlock.style.display = 'none';
    isDemoMode = false;
    openCount = 1;
  } else {
    modifiersBlock.style.display = 'flex';
  }
  updateModifiersUI();

  caseImage.style.display = 'none';
  slotMachine.style.display = 'block';
  caseVisualContainer.classList.remove('about_item_bg');
  caseVisualContainer.classList.add('slot-mode');
  resultMessage.textContent = '';
  openBtn.disabled = false;

  if (isAnimationRunning) {
    cancelAnimationFrame(animationFrameId);
    isAnimationRunning = false;
    hideOpeningState();
  }

  // Set up items for rendering
  itemsList = currentCase.items.length < 8 ? [...currentCase.items, ...currentCase.items] : currentCase.items.slice();

  // Set vertical mode class based on openCount
  if (openCount > 1) {
    document.querySelector('.case_opening_process').classList.add('vertical-mode');
    slotTrack.innerHTML = '';
  } else {
    document.querySelector('.case_opening_process').classList.remove('vertical-mode');
    renderSlotItems(itemsList);
    slotTrack.style.transform = 'translate3d(0,0,0)';
  }
  // заранее декодируем картинки кейса, чтобы лента не подгружала их на ходу
  currentCase.items.forEach(it => { const im = new Image(); im.src = it.image; im.decode && im.decode().catch(() => { }); });

  isAnimationRunning = false;
  winningItem = null;
}

function setupModifierListeners() {
  const demoBtn = document.getElementById('demoModeBtn');
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      if (isAnimationRunning || isCaseBeingOpened) return;
      isDemoMode = !isDemoMode;
      updateModifiersUI();
    });
  }

  document.querySelectorAll('.case-multiplier-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (isAnimationRunning || isCaseBeingOpened) return;
      openCount = parseInt(e.target.dataset.count, 10) || 1;
      updateModifiersUI();
    });
  });
}

function updateModifiersUI() {
  const demoBtn = document.getElementById('demoModeBtn');
  if (demoBtn) {
    if (isDemoMode) {
      demoBtn.classList.add('active');
    } else {
      demoBtn.classList.remove('active');
    }
  }

  document.querySelectorAll('.case-multiplier-btn').forEach(btn => {
    if (parseInt(btn.dataset.count, 10) === openCount) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  updateCaseOpenButtonState(); // Re-eval balance requirements
}

function renderCaseContents(caseObj) {
  const sortedItems = [...caseObj.items].sort((a, b) => b.value - a.value);

  const starSvg = `<svg viewBox="0 0 14 15" fill="#FFCA5A" xmlns="http://www.w3.org/2000/svg" class="case_item-stars-icon" width="16" height="16"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.63869 12.1902L3.50621 14.1092C3.18049 14.3087 2.75468 14.2064 2.55515 13.8807C2.45769 13.7216 2.42864 13.5299 2.47457 13.3491L2.95948 11.4405C3.13452 10.7515 3.60599 10.1756 4.24682 9.86791L7.6642 8.22716C7.82352 8.15067 7.89067 7.95951 7.81418 7.80019C7.75223 7.67116 7.61214 7.59896 7.47111 7.62338L3.66713 8.28194C2.89387 8.41581 2.1009 8.20228 1.49941 7.69823L0.297703 6.69116C0.00493565 6.44581 -0.0335059 6.00958 0.211842 5.71682C0.33117 5.57442 0.502766 5.48602 0.687982 5.47153L4.35956 5.18419C4.61895 5.16389 4.845 4.99974 4.94458 4.75937L6.36101 1.3402C6.5072 0.987302 6.91179 0.819734 7.26469 0.965925C7.43413 1.03612 7.56876 1.17075 7.63896 1.3402L9.05539 4.75937C9.15496 4.99974 9.38101 5.16389 9.6404 5.18419L13.3322 5.47311C13.713 5.50291 13.9975 5.83578 13.9677 6.2166C13.9534 6.39979 13.8667 6.56975 13.7269 6.68896L10.9114 9.08928C10.7131 9.25826 10.6267 9.52425 10.6876 9.77748L11.5532 13.3733C11.6426 13.7447 11.414 14.1182 11.0427 14.2076C10.8642 14.2506 10.676 14.2208 10.5195 14.1249L7.36128 12.1902C7.13956 12.0544 6.8604 12.0544 6.63869 12.1902Z" fill="#FFCA5A"/></svg>`;

  let html = `
    <div class="case-contents-header">
      <div class="case-contents-header-line"></div>
      <h3>Содержимое кейса</h3>
      <div class="case-contents-header-line"></div>
    </div>
    <div class="case_items_content">`;

  sortedItems.forEach(item => {
    const rarity = item.rarity || 'common';
    const chance = item.chance || '??';
    const isTGS = item.image.endsWith('.tgs');
    const imageHtml = isTGS
      ? `<tgs-player class="case_item_tgs" mode="normal" hover="false" src="${item.image}" background="transparent"></tgs-player>`
      : `<span class="case_item-preloader" aria-hidden="true"></span><img src="${item.image}" alt="${item.name}" loading="eager">`;

    html += `
    <div class="case_item rarity-${rarity}">
      <span class="case_item-chance">${chance}</span>
      <div class="case_item-img">
        ${imageHtml}
      </div>
      <div class="case_item_content">
        <p class="case_item_name">${item.name}</p>
        <div class="case_item-price">
          ${starSvg}
          <span class="case_item-price-value">${Number(item.value).toLocaleString('ru-RU')}</span>
        </div>
      </div>
    </div>`;
  });

  html += `</div>`;
  caseContents.innerHTML = html;
  caseContents.querySelectorAll('.case_item-img img').forEach(img => {
    const loader = img.previousElementSibling;
    if (!loader || !loader.classList.contains('case_item-preloader')) return;
    if (img.complete) loader.remove();
    else img.onload = img.onerror = () => loader.remove();
  });
}

async function startAnimation(promoCode = null) {
  if (isAnimationRunning || !currentCase) return;

  const userId = tgUser?.id;
  if (!userId) {
    showAlert('⚠️ Необходимо авторизоваться');
    return;
  }

  if (isFreeCaseId(currentCase.id)) {
    try {
      const statusResp = await fetch('/api/daily-case/status?caseId=' + currentCase.id, {
        headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
      });
      if (!statusResp.ok) {
        console.error('Daily case status error:', statusResp.status);
        showAlert('⚠️ Не удалось проверить условия. Попробуйте позже.');
        return;
      }
      const status = await statusResp.json();
      if (!status.canOpen) {
        if (status.freeCaseOpenedToday || !status.needTasks) {
          updateFreeCaseButtonState();
          showAlert('⏳ Бесплатный кейс уже открыт. Следующий — через ' + formatCountdown(Math.max(0, Math.floor((new Date(status.nextResetAt) - Date.now()) / 1000))));
        } else {
          showDailyCaseModal(status);
        }
        return;
      }
    } catch (err) {
      console.error('Daily case status check error:', err);
      showAlert('⚠️ Ошибка проверки условий. Попробуйте позже.');
      return;
    }
  }

  if (currentCase.promoOnly && !promoCode) {
    showAlert('❌ Для этого кейса требуется промокод');
    return;
  }

  if (!isDemoMode && !currentCase.promoOnly && !currentCase.referralOnly && balance < (currentCase.price * openCount)) {
    showAlert(`❌ Недостаточно Stars! Нужно ещё ${(currentCase.price * openCount) - balance} ⭐`);
    return;
  }

  isCaseBeingOpened = true;
  revealSpinner(document.querySelector('.case_opening_process'));
  showOpeningState();
  openBtn.disabled = true;
  resultMessage.textContent = '';
  slotTrack.querySelectorAll('.slot-card.winner').forEach(c => c.classList.remove('winner'));

  try {
    const response = await fetch('/api/open-case', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({
        caseId: currentCase.id,
        promoCode: promoCode,
        isDemo: isDemoMode,
        count: openCount
      })
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("text/html") !== -1) {
        const errorMessage = await response.text();
        console.error("Server returned HTML error page:", errorMessage);
        throw new Error("Ошибка сервера. Подробности в консоли.");
      } else {
        const errorData = await response.json();
        if (errorData.code === 'cooldown' && isFreeCaseId(currentCase.id)) {
          updateFreeCaseButtonState();
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    }

    const data = await response.json();
    wonItems = data.gifts; // array of gifts
    let newBalance = data.newBalance;
    const isActuallyDemo = data.isDemo;

    const hasStarsPrize = (wonItems || []).some(w => {
      const n = String(w.name || '').toLowerCase().trim();
      return n === 'stars' || n === 'star' || n === '⭐' || n.includes('stars');
    });

    if (!isActuallyDemo && !currentCase.promoOnly && !currentCase.referralOnly) {
      if (hasStarsPrize) {
        const cost = (currentCase.price || 0) * openCount;
        balance = Math.max(0, balance - cost);
        updateBalance();
      } else {
        if (newBalance !== undefined) balance = newBalance;
        updateBalance();
        loadBalance();
      }
      // Если выпали stars — полный баланс (с учётом выигрыша) обновим в конце анимации (finishAnimation)
    }

    if (!isActuallyDemo) {
      for (const t of data.prizeTokens || []) {
        try {
          const confirmResponse = await fetch('/api/confirm-prize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': Telegram.WebApp.initData
            },
            body: JSON.stringify({
              prizeToken: t.token
            })
          });
          const confirmData = await confirmResponse.json();
          if (confirmResponse.ok && confirmData.success) {
            const index = wonItems.findIndex(w =>
              w.name === t.itemName && (w.dbId == null) && !w._autoSold
            );
            if (index !== -1) {
              if (confirmData.autoSold) {
                wonItems[index]._autoSold = true;
                wonItems[index]._creditedAmount = confirmData.creditedAmount;
              } else {
                wonItems[index].dbId = confirmData.itemId;
              }
            }
          }
        } catch (err) {
          console.error('Ошибка сохранения приза:', err);
        }
      }
    } else {
      wonItems.forEach(w => w._isDemo = true);
    }

    // Ленты короткие (STRIP карточек, выигрыш на WIN_AT): мало DOM — плавно даже при x5 на слабых телефонах
    const proc = document.querySelector('.case_opening_process');
    const columnsData = [];
    const pickStrip = (win) => {
      const pool = currentCase.items, out = new Array(SLOT_STRIP);
      for (let i = 0; i < SLOT_STRIP; i++) out[i] = pool[(Math.random() * pool.length) | 0];
      out[SLOT_WIN_AT] = pool.find(it => it.name === win.name && it.image === win.image) || win;
      return out;
    };

    if (openCount > 1) {
      proc.classList.add('vertical-mode');
      slotTrack.style.transform = 'none';
      slotTrack.innerHTML = wonItems.slice(0, openCount).map(w =>
        `<div class="case_opening_items_list slot-column"><div class="case_opening_items vertical-column-inner">${pickStrip(w).map(it => slotCardHtml(it, true)).join('')}</div>` +
        '<div class="slot-fade top"></div><div class="slot-fade bottom"></div></div>').join('');
      const cols = slotTrack.querySelectorAll('.vertical-column-inner');
      const c0 = cols[0].children, step = c0[1].offsetTop - c0[0].offsetTop, cardH = c0[0].offsetHeight;
      const center = (proc.offsetHeight || 200) / 2, jitter = (Math.random() - 0.5) * cardH * 0.3;
      cols.forEach((el, i) => columnsData.push({
        element: el, finalIndex: SLOT_WIN_AT, winningItem: wonItems[i] || wonItems[0],
        targetPosition: -(SLOT_WIN_AT * step) + center - cardH / 2 + jitter,
        duration: SLOT_MULTI_MS + i * SLOT_STAGGER_MS, step, stopped: false,
      }));
    } else {
      proc.classList.remove('vertical-mode');
      itemsList = pickStrip(wonItems[0]);
      renderSlotItems(itemsList);
      finalItemIndex = SLOT_WIN_AT;
      const c = slotTrack.children, step = c[1].offsetLeft - c[0].offsetLeft, cardW = c[0].offsetWidth;
      const containerWidth = document.querySelector('.case_opening_items_wrapper').offsetWidth;
      slotStep = step;
      targetPosition = -(finalItemIndex * step) + (containerWidth - cardW) / 2 + (Math.random() - 0.5) * cardW * 0.55;
    }

    // Attach column data to global state
    window.animationColumnsData = columnsData;


    isAnimationRunning = true;
    if (openCount === 1) slotTrack.style.transform = 'translate3d(0,0,0)';
    document.querySelector('.case_opening_process')?.classList.remove('dd-done');
    if (window.FX) { FX.slotReset(slotTrack); FX.whoosh(); }
    animationStartTime = null;
    requestAnimationFrame(animateSlotMachine);

  } catch (error) {
    const msg = error?.message || '';
    const isValidationError = /^(Требуется|Недостаточно|Срок действия|Вы уже использовали|Закончились активации|Промокод|Неверный|Этот промокод)/i.test(msg);
    if (!isValidationError) console.error('Ошибка открытия кейса:', error);
    isAnimationRunning = false;
    isCaseBeingOpened = false;
    hideOpeningState();
    openBtn.disabled = false;
    showAlert(msg ? `⚠️ ${msg}` : '⚠️ Ошибка при открытии кейса');
  }
}

const SLOT_STRIP = 48, SLOT_WIN_AT = 40, SLOT_SINGLE_MS = 6200, SLOT_MULTI_MS = 4600, SLOT_STAGGER_MS = 380;
let slotStep = 123;
const slotEase = p => 1 - Math.pow(1 - p, 3.5);

// если лента/колесо ушли за экран (долистали вниз до предметов) — плавно возвращаем их в центр
function revealSpinner(el) {
  if (!el) return;
  const r = el.getBoundingClientRect(), top = 64, bottom = innerHeight - 90;
  if (r.top < top || r.bottom > bottom) window.scrollTo({ top: Math.max(0, scrollY + r.top - top - 8), behavior: 'smooth' });
}

function animateSlotMachine(timestamp) {
  if (!animationStartTime) animationStartTime = timestamp;
  const elapsed = timestamp - animationStartTime;
  let running = false;

  if (openCount > 1 && window.animationColumnsData) {
    // x2–x5: колонки останавливаются по очереди, тики — по последней (самой долгой)
    const cols = window.animationColumnsData, last = cols.length - 1;
    cols.forEach((col, i) => {
      if (col.stopped) return;
      const p = Math.min(elapsed / col.duration, 1), y = col.targetPosition * slotEase(p);
      col.element.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      if (i === last && window.FX) FX.slotFrame(y, null, col.step);
      if (p >= 1) { col.stopped = true; if (window.FX) FX.stop(i); } else running = true;
    });
  } else {
    const p = Math.min(elapsed / SLOT_SINGLE_MS, 1);
    currentPosition = targetPosition * slotEase(p);
    slotTrack.style.transform = `translate3d(${currentPosition.toFixed(1)}px,0,0)`;
    if (window.FX) FX.slotFrame(currentPosition, null, slotStep);
    running = p < 1;
  }

  if (running) animationFrameId = requestAnimationFrame(animateSlotMachine);
  else finishAnimation();
}

function finishAnimation() {
  if (window.FX) FX.slotReset(slotTrack);
  document.querySelector('.case_opening_process')?.classList.add('dd-done');
  isAnimationRunning = false;
  isCaseBeingOpened = false;
  hideOpeningState();

  const isDemo = wonItems && wonItems.length > 0 && wonItems[0]._isDemo;
  const hasStarsPrize = (wonItems || []).some(w => {
    const n = String(w.name || '').toLowerCase().trim();
    return n === 'stars' || n === 'star' || n === '⭐' || n.includes('stars');
  });
  if (!isDemo && hasStarsPrize) {
    loadBalance().then(() => updateBalance());
  }

  if (openCount > 1 && window.animationColumnsData) {
    window.animationColumnsData.forEach(colData => {
      const cards = colData.element.children;
      dimNeighbours(cards, colData.finalIndex);
      const winCard = cards[colData.finalIndex];
      if (winCard) applyWinningStyle(winCard, colData.winningItem);
    });
  } else {
    dimNeighbours(slotTrack.children, finalItemIndex);
    highlightWinningCard();
  }

  setTimeout(() => {
    showWinModal(wonItems);
  }, 250);
  openBtn.disabled = false;
}

// Затемняем только видимых соседей выигрыша (а не всю ленту) — дешёвая анимация в конце
function dimNeighbours(cards, idx) {
  for (let i = Math.max(0, idx - 4); i <= Math.min(cards.length - 1, idx + 4); i++) if (i !== idx) cards[i].classList.add('dd-dim');
}

function applyWinningStyle(winCard, item) {
  const rarityColors = {
    uncommon: '#b4bed2', common: '#3b82f6', rare: '#22d3ee',
    epic: '#a855f7', purple: '#ec4899', mythic: '#ef4444', legendary: '#facc15',
  };
  const rarity = item?.rarity || 'common';
  const color = rarityColors[rarity] || '#3b82f6';
  winCard.classList.add('winner');
  winCard.style.setProperty('--win-color', color);
}

function highlightWinningCard() {
  if (!wonItems || !wonItems.length || finalItemIndex === undefined) return;
  const winCard = slotTrack.children[finalItemIndex];
  if (winCard) {
    applyWinningStyle(winCard, wonItems[0]);
  }
}

function showProfile() {
  closeWinModal();
  document.getElementById('deposit-section')?.classList.add('hidden');
  caseSelection.style.display = 'none';
  caseOpening.classList.remove('active');
  profileSection.classList.remove('hidden');
  document.getElementById('friends-section')?.classList.add('hidden');

  if (isAnimationRunning) {
    cancelAnimationFrame(animationFrameId);
    isAnimationRunning = false;
    hideOpeningState();
  }

  slotTrack.style.transform = 'translateX(0)';
  document.getElementById('casesCategories').style.display = 'none';
  document.getElementById('topNav').style.display = 'none';

  updateProfilePage();
  renderInventory();
}

async function renderInventory() {
  const userId = tgUser?.id;
  if (!userId) return;

  try {
    const response = await fetch(`/api/inventory/${userId}`, {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const invData = await response.json();
    inventory.length = 0;
    inventory.push(...(invData || []));

    const container = document.getElementById('inventoryList');
    container.innerHTML = '';

    if (invData.length === 0) {
      container.innerHTML = `
        <div class="empty-state empty-state-inventory">
          <img src="images/gifts/plush-pepes.webp" alt="" class="empty-state-inventory-img">
          <p class="empty-state-inventory-title">Пока что тут пусто</p>
          <p class="empty-state-inventory-sub">Открывай кейсы, чтобы здесь появились подарки</p>
          <button type="button" class="empty-state-go-cases">Перейти к кейсам</button>
        </div>
      `;
      container.querySelector('.empty-state-go-cases')?.addEventListener('click', goBackToCasesFromProfile);
      const cnt0 = document.getElementById('inventoryCount'); if (cnt0) cnt0.textContent = '';
      const sa0 = document.getElementById('sellAllBtn'); if (sa0) sa0.textContent = 'Продать всё';
      return;
    }

    // плитки как у кейсов: картинка, имя, цена, «Продать» / «Вывести»
    let total = 0;
    container.innerHTML = invData.map((item) => {
      total += Number(item.item_value) || 0;
      const canWithdraw = item.item_value >= 14;
      return `
        <div class="profile_items_list_item dd-inv-item r-${item.rarity || 'common'}" data-item-id="${item.id}">
          <img src="${item.item_image}" alt="" decoding="async">
          <div class="dd-inv-name">${item.item_name}</div>
          <div class="dd-inv-val"><i class="dd-star"></i>${Number(item.item_value).toLocaleString('ru-RU')}</div>
          <div class="dd-inv-actions">
            <button class="profile_item_action sell-btn" onclick="sellFromInventory('${item.id}')">Продать</button>
            ${canWithdraw ? `<button class="profile_item_action withdraw-btn" onclick="initWithdraw('${item.id}')">Вывести</button>` : ''}
          </div>
        </div>`;
    }).join('');
    const cnt = document.getElementById('inventoryCount'); if (cnt) cnt.textContent = invData.length;
    const sellAll = document.getElementById('sellAllBtn'); if (sellAll) sellAll.innerHTML = `Продать всё · <i class="dd-star"></i>${total.toLocaleString('ru-RU')}`;
  } catch (err) {
    console.error('Ошибка загрузки инвентаря:', err);
    showAlert('❌ Ошибка загрузки инвентаря');
  }
}

async function initWithdraw(itemId) {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      throw new Error("Необходимо авторизоваться");
    }

    async function showCustomConfirm() {
      return new Promise((resolve) => {
        const popup = document.getElementById("customConfirm");
        popup.style.display = "flex";

        document.getElementById("confirmOk").onclick = () => {
          popup.style.display = "none";
          resolve(true);
        };

        document.getElementById("confirmCancel").onclick = () => {
          popup.style.display = "none";
          resolve(false);
        };
      });
    }

    const confirmed = await showCustomConfirm();
    if (confirmed) {
    }

    if (!confirmed) return;

    const response = await fetch('/api/init-withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ itemId })
    });

    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error('Сервер вернул некорректный ответ. Попробуйте позже.');
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Ошибка при создании запроса на вывод');
    }

    showAlert('✅ ' + (result.message || 'Запрос на вывод создан') + '\nНапишите в поддержку ' + (window.__SUPPORT || '@RelayerDrade'), 'success', { title: 'Вывод' });
    try { Telegram.WebApp.openTelegramLink('https://t.me/' + String(window.__SUPPORT || 'RelayerDrade').replace(/^@/, '')); } catch (e) { }
    await renderInventory();
  } catch (err) {
    console.error("Withdraw error:", err);
    const msg = err.message || String(err);
    try {
      await fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData },
        body: JSON.stringify({ message: msg, stage: 'init-withdraw' })
      });
    } catch (_) { }
    showAlert(`❌ Ошибка при выводе: ${msg}`);
  }
}

function updateBalance() {
  if (topBalanceEl) {
    topBalanceEl.textContent = Number(balance).toLocaleString('ru-RU');
  }
  updateProfileBalance();
  updateCaseOpenButtonState();
}

function formatCountdown(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.max(0, seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function updateFreeCaseButtonState() {
  const openBtnEl = document.getElementById('openCaseBtn');
  if (!openBtnEl || !currentCase || !isFreeCaseId(currentCase.id)) return;

  fetch('/api/daily-case/status?caseId=' + currentCase.id, { headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData } })
    .then(res => res.ok ? res.json() : null)
    .then(status => {
      if (!status) return;
      const defaultBlock = openBtnEl.querySelector('.open-case-default');
      let openedBlock = openBtnEl.querySelector('.open-case-opened');
      if (status.freeCaseOpenedToday) {
        openBtnEl.classList.add('open-case-button--opened');
        openBtnEl.disabled = true;
        if (defaultBlock) defaultBlock.style.display = 'none';
        if (!openedBlock) {
          openedBlock = document.createElement('span');
          openedBlock.className = 'open-case-opened';
          openedBlock.style.display = 'flex';
          openedBlock.style.flexDirection = 'column';
          openedBlock.style.alignItems = 'center';
          openedBlock.style.gap = '4px';
          openedBlock.innerHTML = 'Кейс уже открыт<br><span class="free-case-countdown">Обновление через <span id="freeCaseCountdown">00:00:00</span></span>';
          openBtnEl.appendChild(openedBlock);
        }
        openedBlock.style.display = 'flex';
        const nextResetAt = status.nextResetAt;
        function tick() {
          const remaining = Math.max(0, Math.floor((new Date(nextResetAt) - Date.now()) / 1000));
          const el = document.getElementById('freeCaseCountdown');
          if (el) el.textContent = formatCountdown(remaining);
          if (remaining <= 0 && freeCaseCountdownIntervalId) {
            clearInterval(freeCaseCountdownIntervalId);
            freeCaseCountdownIntervalId = null;
            updateFreeCaseButtonState();
          }
        }
        tick();
        if (freeCaseCountdownIntervalId) clearInterval(freeCaseCountdownIntervalId);
        freeCaseCountdownIntervalId = setInterval(tick, 1000);
      } else {
        openBtnEl.classList.remove('open-case-button--opened');
        openBtnEl.disabled = false;
        if (defaultBlock) defaultBlock.style.display = '';
        if (openedBlock) openedBlock.style.display = 'none';
        if (freeCaseCountdownIntervalId) {
          clearInterval(freeCaseCountdownIntervalId);
          freeCaseCountdownIntervalId = null;
        }
      }
    })
    .catch(() => { });
}

function updateCaseOpenButtonState() {
  const openBtnEl = document.getElementById('openCaseBtn');
  const notEnoughBlock = document.getElementById('notEnoughStarsBlock');
  const countEl = document.getElementById('notEnoughStarsCount');
  if (!openBtnEl || !notEnoughBlock || !currentCase || currentCase.promoOnly || currentCase.referralOnly) return;
  if (!caseOpening.classList.contains('active')) return;

  if (isAnimationRunning || isCaseBeingOpened) {
    return;
  }

  if (isFreeCaseId(currentCase.id)) {
    openBtnEl.style.display = 'flex';
    notEnoughBlock.style.display = 'none';
    const defaultBlock = openBtnEl.querySelector('.open-case-default');
    if (defaultBlock) defaultBlock.textContent = 'Открыть';
    updateFreeCaseButtonState();
    return;
  }

  const defaultBlock = openBtnEl.querySelector('.open-case-default');

  const need = (currentCase.price * openCount) - balance;

  const starSvgStr = `<svg viewBox="0 0 14 15" fill="#FFCA5A" class="case_item-stars-icon" width="16" height="16"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.63869 12.1902L3.50621 14.1092C3.18049 14.3087 2.75468 14.2064 2.55515 13.8807C2.45769 13.7216 2.42864 13.5299 2.47457 13.3491L2.95948 11.4405C3.13452 10.7515 3.60599 10.1756 4.24682 9.86791L7.6642 8.22716C7.82352 8.15067 7.89067 7.95951 7.81418 7.80019C7.75223 7.67116 7.61214 7.59896 7.47111 7.62338L3.66713 8.28194C2.89387 8.41581 2.1009 8.20228 1.49941 7.69823L0.297703 6.69116C0.00493565 6.44581 -0.0335059 6.00958 0.211842 5.71682C0.33117 5.57442 0.502766 5.48602 0.687982 5.47153L4.35956 5.18419C4.61895 5.16389 4.845 4.99974 4.94458 4.75937L6.36101 1.3402C6.5072 0.987302 6.91179 0.819734 7.26469 0.965925C7.43413 1.03612 7.56876 1.17075 7.63896 1.3402L9.05539 4.75937C9.15496 4.99974 9.38101 5.16389 9.6404 5.18419L13.3322 5.47311C13.713 5.50291 13.9975 5.83578 13.9677 6.2166C13.9534 6.39979 13.8667 6.56975 13.7269 6.68896L10.9114 9.08928C10.7131 9.25826 10.6267 9.52425 10.6876 9.77748L11.5532 13.3733C11.6426 13.7447 11.414 14.1182 11.0427 14.2076C10.8642 14.2506 10.676 14.2208 10.5195 14.1249L7.36128 12.1902C7.13956 12.0544 6.8604 12.0544 6.63869 12.1902Z"></path></svg>`;

  // If demo mode, bypass balance check visually and functionally
  if (isDemoMode) {
    openBtnEl.style.display = 'flex';
    notEnoughBlock.style.display = 'none';
    if (defaultBlock) {
      const displayPrice = currentCase.price * openCount;
      defaultBlock.innerHTML = `<span>Открыть за ${displayPrice}</span> <span class="stars-icon">${starSvgStr}</span>`;
    }
  } else {
    // Regular balance execution
    if (need > 0) {
      openBtnEl.style.display = 'none';
      notEnoughBlock.style.display = 'flex';
      if (countEl) countEl.textContent = need;
    } else {
      openBtnEl.style.display = 'flex';
      notEnoughBlock.style.display = 'none';
      if (defaultBlock) {
        const displayPrice = currentCase.price * openCount;
        defaultBlock.innerHTML = `<span>Открыть за ${displayPrice}</span> <span class="stars-icon">${starSvgStr}</span>`;
      }
    }
  }
}

function updateProfileBalance() {
  const profileBalanceEl = document.getElementById('profilePageBalance');
  if (profileBalanceEl) {
    profileBalanceEl.textContent = Number(balance).toLocaleString('ru-RU');
  }
}

function updateProfilePage() {
  if (tgUser) {
    document.getElementById('profilePageName').textContent = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Игрок';
    const pa = document.getElementById('profilePageAvatar');
    if (tgUser.photo_url) pa.src = tgUser.photo_url;
    else { pa.style.display = 'none'; pa.parentElement.dataset.initial = (tgUser.first_name || 'И').trim().charAt(0).toUpperCase(); }
    document.getElementById('profilePageId').textContent = `#${tgUser.id}`;
  }
  document.getElementById('profilePageBalance').textContent = Number(balance).toLocaleString('ru-RU');
  checkRefPromoStatus();
}

function showOpeningState() {
  const existingOpeningDiv = document.getElementById('openingState');
  if (existingOpeningDiv) {
    return; // Если уже есть, не создаем новую
  }

  if (!openBtn) {
    console.error('❌ openBtn is null!');
    return;
  }

  openBtn.style.display = 'none';

  const openingDiv = document.createElement('div');
  openingDiv.className = 'case_opening_process_btn';
  openingDiv.id = 'openingState';
  openingDiv.innerHTML = `
    <div class="opening-loader">
      <span class="opening-text">Открытие</span>
      <div class="opening-spinner"></div>
    </div>
  `;

  if (openBtn.parentNode) {
    openBtn.parentNode.insertBefore(openingDiv, openBtn.nextSibling);
  } else {
    console.error('❌ openBtn.parentNode is null!');
  }
}

async function hideOpeningState() {
  const openingDiv = document.getElementById('openingState');
  if (openingDiv) {
    openingDiv.remove();
  }

  // Для реферальных кейсов — обновить счётчик и показать правильные кнопки
  if (currentCase && currentCase.referralOnly) {
    try {
      const refResp = await fetch('/api/referral-count', {
        headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
      });
      if (refResp.ok) referralCount = await refResp.json();
    } catch (e) { /* используем кешированное */ }

    const need = (currentCase.referralPrice || 0) - (referralCount.available || 0);
    if (need > 0) {
      document.getElementById('openCaseBtn').style.display = 'none';
      document.getElementById('notEnoughReferralsBlock').style.display = 'flex';
      document.getElementById('notEnoughReferralsCount').textContent = need;
    } else {
      document.getElementById('notEnoughReferralsBlock').style.display = 'none';
      document.getElementById('openCaseBtn').style.display = 'flex';
    }
  } else {
    updateCaseOpenButtonState();
  }
}

// Карточка ленты: без спиннеров и теней — их сотни, и каждая стоит кадров
function slotCardHtml(item, vertical) {
  const r = item.rarity || 'common';
  const img = `<div class="slot-card-img"><img alt="" src="${item.image}" decoding="async" draggable="false"></div>`;
  return vertical
    ? `<div class="slot-card slot-card-vertical r-${r}">${img}<div class="slot-card-value"><span aria-hidden="true">★</span> ${item.value != null ? Number(item.value).toLocaleString('ru-RU') : '—'}</div></div>`
    : `<div class="slot-card r-${r}">${img}<div class="slot-card-name">${item.name}</div></div>`;
}

function renderSlotItems(items) {
  slotTrack.innerHTML = items.map(it => slotCardHtml(it, false)).join('');
}

function showWinModal(itemsArray) {
  const modal = document.getElementById('winModal');
  const container = document.getElementById('winItemsContainer');
  const sellBtnText = document.getElementById('winSellBtnText');
  const winItemValue = document.getElementById('winItemValue');
  const sellBtn = document.getElementById('winSellBtn');
  const inventoryHint = document.getElementById('winInventoryHint');
  const autoSoldMsg = document.getElementById('winAutoSoldMsg');
  const demoHint = document.getElementById('winDemoHint');

  container.innerHTML = '';

  // Set demo visibility
  const isDemo = itemsArray && itemsArray.length > 0 && itemsArray[0]._isDemo;
  if (demoHint) demoHint.style.display = 'none';

  let totalValue = 0;
  let allAutoSold = true;
  let totalCredited = 0;

  // Add all items to container
  if (itemsArray && itemsArray.length) {
    // Switch single view to grid if multiple
    const multi = itemsArray.length > 1;
    container.className = multi ? `dd-win-grid n${itemsArray.length}` : "flex flex-col items-center gap-4";

    itemsArray.forEach(item => {
      totalValue += (item.value || 0);
      if (!item._autoSold) allAutoSold = false;
      if (item._autoSold) totalCredited += (item._creditedAmount || item.value);

      // x2–x5: компактная плитка с ценой — окно влезает в маленький экран, «Продать» всегда видно
      const html = multi ? `
        <div class="dd-win-tile r-${item.rarity || 'common'}">
          <img src="${item.image}" alt="" decoding="async" />
          <div class="dd-win-name" title="${item.name}">${item.name}</div>
          <div class="dd-win-val">★ ${Number(item.value || 0).toLocaleString('ru-RU')}</div>
        </div>` : `
        <div class="flex flex-col items-center">
          <div class="${itemsArray.length > 1 ? 'w-20 h-20' : 'w-36 h-36'} flex items-center justify-center mb-4"
            style="filter: drop-shadow(0 0 20px rgba(0,220,255,0.2));">
            <img src="${item.image}" alt="win" class="max-h-full max-w-full object-contain"
              style="animation: winItemFloat 2.5s ease-in-out infinite;" />
          </div>
          <div class="${itemsArray.length > 1 ? 'text-sm' : 'text-xl'} font-bold mb-1 text-center truncate w-full" style="font-family: 'Montserrat', sans-serif;" title="${item.name}">${item.name}</div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);

      if (!isDemo) addRealDrop(item.name, item.image, item.rarity);
    });
  }

  if (allAutoSold && !isDemo) {
    if (sellBtn) sellBtn.style.display = 'none';
    if (inventoryHint) inventoryHint.classList.add('hidden');
    if (autoSoldMsg) autoSoldMsg.classList.remove('hidden');
    const creditedEl = document.getElementById('winCreditedAmount');
    if (creditedEl) creditedEl.textContent = totalCredited;
    // Balance already updated in finishAnimation callback
  } else {
    if (sellBtn) {
      sellBtn.style.display = isDemo ? 'none' : 'flex';
      if (winItemValue) winItemValue.textContent = totalValue;
    }
    if (inventoryHint) inventoryHint.classList.toggle('hidden', isDemo);
    if (autoSoldMsg) autoSoldMsg.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.style.background = 'rgba(0,0,0,0)';
  const card = document.getElementById('winModalCard');
  if (card) {
    card.style.transform = 'scale(0.85)';
    card.style.opacity = '0';
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add('show');
      if (window.FX && !isDemo) FX.decorateWin(itemsArray || []);
    });
  });
}

function closeWinModal() {
  const modal = document.getElementById('winModal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 400);
}

async function sellPrize() {
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) throw new Error("Необходимо авторизоваться");
    if (!wonItems || wonItems.length === 0) return;

    // Disable sell button to prevent multiple clicks
    const sellBtn = document.getElementById('winSellBtn');
    if (sellBtn) sellBtn.disabled = true;

    for (let item of wonItems) {
      if (item._isDemo) continue;

      if (!item.dbId && item._prizeToken) {
        try {
          const saveResponse = await fetch('/api/confirm-prize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': Telegram.WebApp.initData
            },
            body: JSON.stringify({ prizeToken: item._prizeToken })
          });
          const saveData = await saveResponse.json();
          if (saveResponse.ok && saveData.success) {
            item.dbId = saveData.itemId;
          } else {
            console.error(saveData.error || "Не удалось сохранить предмет перед продажей");
          }
        } catch (e) {
          console.error("Ошибка сохранения перед продажей:", e);
        }
      }

      if (item.dbId) {
        const response = await fetch('/api/sell-item', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify({ userId, itemId: item.dbId })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          balance = data.newBalance;
          updateBalance();
          item._autoSold = true; // Mark as sold so we don't try again
        } else {
          console.error("Ошибка продажи:", data.error);
        }
      }
    }
    closeWinModal();
    if (sellBtn) sellBtn.disabled = false;
  } catch (error) {
    console.error("sellPrize error:", error);
    showAlert("❌ " + (error.message || "Ошибка продажи"));
    const sellBtn = document.getElementById('winSellBtn');
    if (sellBtn) sellBtn.disabled = false;
  }
}

async function keepPrize() {
  try {
    if (!winningItem) throw new Error("Предмет не найден");
    await renderInventory();
    closeWinModal();
    showAlert('✅ Предмет сохранён в инвентаре!');
  } catch (err) {
    console.error("Ошибка сохранения:", err);
    showAlert(`❌ Ошибка: ${err.message}`);
  }
}

// ============= НОВЫЙ РАЗДЕЛ ДРУЗЬЯ =============
let refBannerInterval = null;
let refCurrentSlide = 0;
let refCurrentPeriod = 'all';
let refAllReferrals = [];

function showFriendsSection() {
  document.getElementById('casesCategories').style.display = 'none';
  document.getElementById('case-selection').style.display = 'none';
  document.getElementById('case-opening').classList.remove('active');
  document.getElementById('profile-section').classList.add('hidden');
  document.getElementById('deposit-section')?.classList.add('hidden');
  document.getElementById('friends-section').classList.remove('hidden');
  document.getElementById('topNav').style.display = 'flex';

  // Показать основной контент, скрыть панель рефералов
  document.getElementById('myReferralsPanel').style.display = 'none';
  document.getElementById('refTabContentReferrals').style.display = '';
  document.getElementById('refBannerCarousel').style.display = '';
  document.querySelector('.ref-tabs').style.display = '';

  updateMobileMenuActiveState('friends');
  initRefBannerCarousel();
  loadRefPromo();
  loadRefCases();
}

// --- Banner Carousel ---
function initRefBannerCarousel() {
  if (refBannerInterval) clearInterval(refBannerInterval);
  refCurrentSlide = 0;
  setRefBannerSlide(0);

  const track = document.getElementById('refBannerTrack');
  let startX = 0;
  let diff = 0;

  track.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; diff = 0; }, { passive: true });
  track.addEventListener('touchmove', (e) => { diff = e.touches[0].clientX - startX; }, { passive: true });
  track.addEventListener('touchend', () => {
    if (Math.abs(diff) > 50) {
      setRefBannerSlide(diff > 0 ? 0 : 1);
    }
  });

  const dots = document.querySelectorAll('.ref-banner-dot');
  dots.forEach((dot, i) => dot.addEventListener('click', () => setRefBannerSlide(i)));

  refBannerInterval = setInterval(() => {
    setRefBannerSlide(refCurrentSlide === 0 ? 1 : 0);
  }, 4500);
}

function setRefBannerSlide(idx) {
  refCurrentSlide = idx;
  const track = document.getElementById('refBannerTrack');
  if (track) track.style.transform = `translateX(-${idx * 100}%)`;
  const dots = document.querySelectorAll('.ref-banner-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

// --- Tabs ---
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.ref-tab');
  if (!tab) return;
  document.querySelectorAll('.ref-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const isRef = tab.dataset.tab === 'referrals';
  document.getElementById('refTabContentReferrals').style.display = isRef ? '' : 'none';
  document.getElementById('refTabContentBonuses').style.display = isRef ? 'none' : '';
});

// --- My Referrals Panel ---
function showMyReferrals() {
  document.getElementById('refTabContentReferrals').style.display = 'none';
  document.getElementById('refTabContentBonuses').style.display = 'none';
  document.getElementById('refBannerCarousel').style.display = 'none';
  document.querySelector('.ref-tabs').style.display = 'none';
  document.getElementById('myReferralsPanel').style.display = '';
  loadReferralData(refCurrentPeriod);
}

function hideMyReferrals() {
  document.getElementById('myReferralsPanel').style.display = 'none';
  document.getElementById('refTabContentReferrals').style.display = '';
  document.getElementById('refBannerCarousel').style.display = '';
  document.querySelector('.ref-tabs').style.display = '';
}

async function loadReferralData(period) {
  period = period || 'all';
  try {
    const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
    if (!userId) return;

    const response = await fetch(`/api/referral-data?userId=${userId}&period=${period}`, {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    if (!response.ok) throw new Error('Failed to load referral data');

    const data = await response.json();
    refAllReferrals = data.referrals || [];
    document.getElementById('refTotalBadge').textContent = `Всего: ${data.totalCount || 0}`;
    renderReferrals(refAllReferrals);
  } catch (err) {
    console.error('Error loading referral data:', err);
  }
}

function renderReferrals(referrals) {
  const container = document.getElementById('refReferralsList');
  container.innerHTML = '';

  if (!referrals || referrals.length === 0) {
    container.innerHTML = '<div class="ref-empty-list">Нет рефералов за выбранный период</div>';
    return;
  }

  const avatarColors = ['#E85D04', '#2D6A4F', '#3B82F6', '#7C3AED', '#DC2626'];
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const starSvg = '<svg viewBox="0 0 14 15" fill="#FFCA5A" width="14" height="14"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.63869 12.1902L3.50621 14.1092C3.18049 14.3087 2.75468 14.2064 2.55515 13.8807C2.45769 13.7216 2.42864 13.5299 2.47457 13.3491L2.95948 11.4405C3.13452 10.7515 3.60599 10.1756 4.24682 9.86791L7.6642 8.22716C7.82352 8.15067 7.89067 7.95951 7.81418 7.80019C7.75223 7.67116 7.61214 7.59896 7.47111 7.62338L3.66713 8.28194C2.89387 8.41581 2.1009 8.20228 1.49941 7.69823L0.297703 6.69116C0.00493565 6.44581 -0.0335059 6.00958 0.211842 5.71682C0.33117 5.57442 0.502766 5.48602 0.687982 5.47153L4.35956 5.18419C4.61895 5.16389 4.845 4.99974 4.94458 4.75937L6.36101 1.3402C6.5072 0.987302 6.91179 0.819734 7.26469 0.965925C7.43413 1.03612 7.56876 1.17075 7.63896 1.3402L9.05539 4.75937C9.15496 4.99974 9.38101 5.16389 9.6404 5.18419L13.3322 5.47311C13.713 5.50291 13.9975 5.83578 13.9677 6.2166C13.9534 6.39979 13.8667 6.56975 13.7269 6.68896L10.9114 9.08928C10.7131 9.25826 10.6267 9.52425 10.6876 9.77748L11.5532 13.3733C11.6426 13.7447 11.414 14.1182 11.0427 14.2076C10.8642 14.2506 10.676 14.2208 10.5195 14.1249L7.36128 12.1902C7.13956 12.0544 6.8604 12.0544 6.63869 12.1902Z"/></svg>';

  referrals.forEach((friend, index) => {
    const name = friend.username ? friend.username : (friend.name || `Пользователь`);
    const initial = name.charAt(0).toUpperCase();
    const color = avatarColors[index % avatarColors.length];
    const safeUrl = friend.photo_url ? String(friend.photo_url).replace(/"/g, '&quot;') : '';
    const avatarHtml = safeUrl
      ? `<div class="ref-referral-avatar"><img src="${safeUrl}" alt="" onerror="this.parentElement.style.background='${color}';this.parentElement.textContent='${esc(initial)}'"></div>`
      : `<div class="ref-referral-avatar" style="background:${color}">${esc(initial)}</div>`;

    const row = document.createElement('div');
    row.className = 'ref-referral-row';
    row.innerHTML = `
      ${avatarHtml}
      <div class="ref-referral-name">${esc(name)}</div>
      <div class="ref-referral-deposit">${friend.total_deposits || 0} ${starSvg}</div>
    `;
    container.appendChild(row);
  });
}

// --- Period Modal ---
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.ref-period-option');
  if (!opt) return;
  refCurrentPeriod = opt.dataset.period;
  document.querySelectorAll('.ref-period-option').forEach(o => o.classList.remove('active'));
  opt.classList.add('active');
  const labels = { all: 'За все время', '30d': 'За месяц', '7d': 'За неделю', '1d': 'За день' };
  document.getElementById('refPeriodBtn').innerHTML = (labels[refCurrentPeriod] || 'За все время') + ' <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';
  document.getElementById('refPeriodModal').style.display = 'none';
  loadReferralData(refCurrentPeriod);
});

// --- Ref Promo Code ---
async function loadRefPromo() {
  try {
    const res = await fetch('/api/my-ref-promo', {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    const data = await res.json();
    if (data.code) {
      document.getElementById('refPromoExisting').style.display = '';
      document.getElementById('refPromoCreate').style.display = 'none';
      document.getElementById('refPromoCodeText').textContent = data.code;
      const earningsEl = document.getElementById('refPromoEarnings');
      if (earningsEl) earningsEl.textContent = data.earnings || 0;
    } else {
      document.getElementById('refPromoExisting').style.display = 'none';
      document.getElementById('refPromoCreate').style.display = '';
    }
  } catch (e) {
    console.error('loadRefPromo error:', e);
  }
}

async function submitRefPromo() {
  const input = document.getElementById('refPromoInput');
  const code = input.value.trim();
  if (code.length < 5 || code.length > 32) {
    showAlert('⚠️ Промокод должен быть от 5 до 32 символов');
    return;
  }
  const btn = document.getElementById('refPromoSubmitBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/create-ref-promo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    document.getElementById('refCreatePromoModal').style.display = 'none';
    input.value = '';
    showAlert('✅ Промокод создан!');
    loadRefPromo();
  } catch (err) {
    showAlert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// --- Ref Cases ---
async function loadRefCases() {
  try {
    const res = await fetch('/api/referral-cases-status', {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    const data = await res.json();
    renderRefCases(data.totalRefs || 0);
  } catch (e) {
    console.error('loadRefCases error:', e);
  }
}

function renderRefCases(totalRefs) {
  const grid = document.getElementById('refCasesGrid');
  if (!grid) return;
  const cases = [];
  grid.innerHTML = '';
  cases.forEach(c => {
    const unlocked = totalRefs >= c.need;
    const lockSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';
    const item = document.createElement('div');
    item.className = 'ref-case-item';
    item.innerHTML = `
      <img src="${c.image}" alt="">
      <div class="ref-case-lock ${unlocked ? 'ref-case-unlocked' : ''}">
        ${unlocked ? '✅' : lockSvg} ${totalRefs}/${c.need}
      </div>
    `;
    grid.appendChild(item);
  });
}

// --- Invite (share/copy) ---
function getRefLink() {
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  return `https://t.me/${window.__BOT_USERNAME || ''}?start=ref_${userId}`;
}

async function openRefShare() {
  const userId = Telegram.WebApp.initDataUnsafe?.user?.id;
  if (!userId) return;
  try {
    const prepResp = await fetch('/api/referral/prepare-share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const prepData = await prepResp.json();
    if (prepData.msgId && Telegram.WebApp.shareMessage) {
      Telegram.WebApp.shareMessage(prepData.msgId, (ok) => {
        if (ok) showAlert('✅ Отправлено!');
      });
    } else {
      // Fallback: обычная шара
      const link = getRefLink();
      const text = '🎁 Открывай кейсы и получай NFT-подарки в ' + (window.__BRAND || 'Gift Cases') + '!';
      const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      Telegram.WebApp.openTelegramLink(url);
    }
  } catch (err) {
    console.error('openRefShare error:', err);
    // Fallback
    const link = getRefLink();
    const text = '🎁 Открывай кейсы и получай NFT-подарки в ' + (window.__BRAND || 'Gift Cases') + '!';
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    Telegram.WebApp.openTelegramLink(url);
  }
}

function copyToClipboard(text) {
  // Используем textarea fallback как основной метод (обходит Permissions Policy)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject();
  } catch {
    document.body.removeChild(ta);
    return Promise.reject();
  }
}

function copyRefLink() {
  const link = getRefLink();
  copyToClipboard(link).then(() => {
    showAlert('✅ Ссылка скопирована!');
  }).catch(() => {
    showAlert('⚠️ Не удалось скопировать');
  });
}

// --- Profile Ref Promo Input ---
async function checkRefPromoStatus() {
  try {
    const res = await fetch('/api/ref-promo-status', {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    const data = await res.json();
    const card = document.getElementById('profileRefPromoCard');
    if (card) card.style.display = data.canUseRefPromo ? '' : 'none';
  } catch (e) {
    console.error('checkRefPromoStatus error:', e);
  }
}

async function applyRefPromoInProfile() {
  const input = document.getElementById('profileRefPromoInput');
  const code = input.value.trim();
  if (!code) { showAlert('⚠️ Введите промокод'); return; }

  const btn = document.getElementById('profileRefPromoApplyBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/use-ref-promo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');

    showAlert(`✅ +${data.bonus} Stars зачислено на баланс!`);
    input.value = '';
    document.getElementById('refActivatePromoModal').style.display = 'none';
    document.getElementById('profileRefPromoCard').style.display = 'none';

    // Обновляем баланс на странице
    if (data.newBalance != null) {
      document.getElementById('profilePageBalance').textContent = data.newBalance;
      const navBal = document.getElementById('navBalance');
      if (navBal) navBal.textContent = data.newBalance;
    }
  } catch (err) {
    showAlert('❌ ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// --- Event Listeners (delegated + direct) ---
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('showMyReferralsBtn')?.addEventListener('click', showMyReferrals);
  document.getElementById('hideMyReferralsBtn')?.addEventListener('click', hideMyReferrals);
  document.getElementById('refPeriodBtn')?.addEventListener('click', () => {
    document.getElementById('refPeriodModal').style.display = 'flex';
  });
  document.getElementById('refShareBtn')?.addEventListener('click', openRefShare);
  document.getElementById('refCopyLinkBtn')?.addEventListener('click', copyRefLink);
  document.getElementById('openCreatePromoBtn')?.addEventListener('click', () => {
    document.getElementById('refPromoInput').value = '';
    document.getElementById('refCreatePromoModal').style.display = 'flex';
  });
  document.getElementById('refPromoEditBtn')?.addEventListener('click', () => {
    document.getElementById('refPromoInput').value = '';
    document.getElementById('refPromoInput').placeholder = 'Введите новый промокод';
    document.getElementById('refCreatePromoModal').style.display = 'flex';
  });
  document.getElementById('refPromoCopyBtn')?.addEventListener('click', () => {
    const code = document.getElementById('refPromoCodeText').textContent;
    copyToClipboard(code).then(() => showAlert('✅ Промокод скопирован!')).catch(() => showAlert('⚠️ Не удалось скопировать'));
  });
  document.getElementById('refPromoSubmitBtn')?.addEventListener('click', submitRefPromo);
  document.getElementById('profileRefPromoApplyBtn')?.addEventListener('click', applyRefPromoInProfile);
});
// ============= КОНЕЦ РАЗДЕЛ ДРУЗЬЯ =============

function showAlert(message, type = 'info', options = {}) {
  try {
    showToast(message, type, options);
  } catch (e) {
    console.error('[showAlert] Error showing toast:', e);
    try {
      if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.showAlert) {
        Telegram.WebApp.showAlert(message);
      } else {
        alert(message);
      }
    } catch (e2) {
      alert(message);
    }
  }
}

function showToast(message, type = 'info', options = {}) {
  if (!document || !document.body) {
    try {
      if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.showAlert) {
        Telegram.WebApp.showAlert(message);
      } else {
        alert(message);
      }
    } catch (e) {
      alert(message);
    }
    return;
  }

  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const typeClass =
    type === 'success' ? 'toast-success' :
      type === 'error' ? 'toast-error' :
        type === 'warning' ? 'toast-warning' : 'toast-info';

  toast.className = `toast ${typeClass}`;
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(100%)';
  toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`
  };

  const icon = options.icon || icons[type] || icons.info;
  const title = options.title || '';

  if (title) {
    toast.innerHTML = `
      <div class="toast-icon-wrap">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Закрыть">&times;</button>
    `;
  } else {
    toast.innerHTML = `
      <div class="toast-icon-wrap">${icon}</div>
      <span class="toast-message-simple">${message}</span>
      <button class="toast-close" aria-label="Закрыть">&times;</button>
    `;
  }

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  });

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  const duration = options.duration || 4500;
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }
  }, duration);
}

function initTelegramUser() {
  const authorizedView = document.getElementById('authorized-view');
  const unauthorizedView = document.getElementById('unauthorized-view');

  if (tgUser && tgUser.id) {

    authorizedView.style.display = 'flex';
    unauthorizedView.style.display = 'none';

    document.getElementById("profileName").textContent = tgUser.first_name || "User";
    const avatar = document.getElementById("profileAvatar");
    if (avatar && tgUser.photo_url) {
      avatar.src = tgUser.photo_url;
    } else if (avatar) {
      // нет фото — кружок с первой буквой имени вместо битой картинки
      avatar.style.display = 'none';
      avatar.parentElement.dataset.initial = (tgUser.first_name || 'U').trim().charAt(0).toUpperCase();
    }

  } else {

    authorizedView.style.display = 'none';
    unauthorizedView.style.display = 'flex';
  }
}

function goBackToCasesFromProfile() {
  profileSection.classList.add('hidden');
  caseSelection.style.display = 'grid';
  document.getElementById('casesCategories').style.display = 'block';
  document.getElementById('topNav').style.display = 'flex';
}

function setupEventListeners() {
  document.getElementById('goToProfile')?.addEventListener('click', (e) => {
    e.preventDefault();
    showProfile();
  });
  document.getElementById('copyRefLinkBtn')?.addEventListener('click', copyRefLink);
  document.getElementById('copyRefLinkBtnd')?.addEventListener('click', openReferralShare);
  document.getElementById('profileInviteBtn')?.addEventListener('click', function () {
    showFriendsSection();
    updateMobileMenuActiveState('friends');
  });
  document.getElementById('inviteFriendsFromCaseBtn')?.addEventListener('click', () => {
    // Закрываем кейс и переходим во вкладку "Друзья"
    caseOpening.classList.remove('active');
    caseSelection.style.display = 'none';
    document.getElementById('casesCategories').style.display = 'none';
    showFriendsSection();
    updateMobileMenuActiveState('friends');
  });
  document.body.addEventListener('click', function (e) {
    const withdrawBtn = e.target.closest('.withdraw-btn');
    if (withdrawBtn) {
      e.preventDefault();
      const itemElement = withdrawBtn.closest('.profile_items_list_item');
      if (itemElement) {
        const itemId = itemElement.dataset.itemId; // Добавьте data-item-id к элементу в renderInventory()
        initWithdraw(itemId);
      }
    }
  });

  backBtn?.addEventListener('click', () => {
    document.getElementById('casesCategories').style.display = 'block';
    caseOpening.classList.remove('active');
    caseSelection.style.display = 'grid';
    resultMessage.textContent = '';
    isCaseBeingOpened = false;
    caseVisualContainer.classList.remove('slot-mode');
    caseVisualContainer.classList.add('about_item_bg');

    if (isAnimationRunning) {
      cancelAnimationFrame(animationFrameId);
      isAnimationRunning = false;
      hideOpeningState();
    }
    slotTrack.style.transform = 'translateX(0)';
  });

  openBtn?.addEventListener('click', () => {
    if (isAnimationRunning) {
      cancelAnimationFrame(animationFrameId);
      isAnimationRunning = false;
      hideOpeningState();
    }
    startAnimation();
  });

  document.getElementById('sellAllBtn')?.addEventListener('click', sellAllItems);
  document.body.addEventListener('click', function (e) {
  });

  document.getElementById('mobileFriendsBtn')?.addEventListener('click', showFriendsSection);
  document.getElementById('backToMenuFromFriends')?.addEventListener('click', () => {
    document.getElementById('friends-section').classList.add('hidden');
    document.getElementById('case-selection').style.display = 'grid';
    document.getElementById('casesCategories').style.display = 'block';
    document.getElementById('topNav').style.display = 'flex';
    updateMobileMenuActiveState('cases');
  });

  document.querySelectorAll('.category_chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.category_chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      let targetId = '';
      if (chip.textContent.includes('Все')) targetId = '';
      else if (chip.textContent.includes('Фарм')) targetId = 'farm-cases';
      else if (chip.textContent.includes('Обычные')) targetId = 'regular-cases';
      else if (chip.textContent.includes('ALL IN')) targetId = 'allin-cases';

      if (!targetId) {
        currentCategory = "all";
        renderCases();
        return;
      }

      currentCategory = targetId.replace('-cases', '');
      renderCases();

      setTimeout(() => {
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 50);
    });
  });

  document.getElementById('mobileProfileBtn')?.addEventListener('click', function () {
    document.getElementById('goToProfile').click();
    updateMobileMenuActiveState('profile');
    document.getElementById('friends-section').classList.add('hidden');
  });

  document.getElementById('mobileCasesBtn')?.addEventListener('click', function () {
    document.getElementById('deposit-section')?.classList.add('hidden');
    caseOpening.classList.remove('active');
    profileSection.classList.add('hidden');
    document.getElementById('friends-section').classList.add('hidden');
    document.getElementById('admin-section')?.classList.add('hidden');
    caseSelection.style.display = 'grid';
    caseSelection.classList.remove('hidden');
    document.getElementById('casesCategories').style.display = 'block';
    document.getElementById('topNav').style.display = 'flex';
    if (isAnimationRunning) {
      cancelAnimationFrame(animationFrameId);
      isAnimationRunning = false;
      hideOpeningState();
    }
    resultMessage.textContent = '';
    isCaseBeingOpened = false;
    caseVisualContainer.classList.remove('slot-mode');
    caseVisualContainer.classList.add('about_item_bg');
    slotTrack.style.transform = 'translateX(0)';
    openBtn.disabled = false;
    updateMobileMenuActiveState('cases');
    window.scrollTo(0, 0);
  });

  document.getElementById('mobileDepositBtn')?.addEventListener('click', function (e) {
    e.preventDefault();
    openStarsModal();
    updateMobileMenuActiveState('deposit');
  });
  document.getElementById('depositFromCaseBtn')?.addEventListener('click', function () {
    openStarsModal();
  });
  document.getElementById('backFromDeposit')?.addEventListener('click', function () {
    closeStarsModal();
  });
  document.getElementById('depositSubmitBtn')?.addEventListener('click', function () {
    handleStarsTopUp();
  });
  document.querySelectorAll('.deposit-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.deposit-tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      const tabName = this.getAttribute('data-tab');
      document.getElementById('depositStarsContent').classList.toggle('hidden', tabName !== 'stars');
      document.getElementById('depositTonContent').classList.toggle('hidden', tabName !== 'ton');
      if (tabName === 'ton' && typeof window.__tonApplyState === 'function') window.__tonApplyState();
    });
  });

  (function initTonDeposit() {
    const tonConnectWrap = document.getElementById('tonConnectWrap');
    const tonConnectRoot = document.getElementById('ton-connect');
    const tonConnectCustomBtn = document.getElementById('tonConnectCustomBtn');
    const tonConnectSdkWrap = document.getElementById('ton-connect-sdk-wrap');
    const tonDepositBtnWrap = document.getElementById('tonDepositBtnWrap');
    const tonWalletInfo = document.getElementById('tonWalletInfo');
    const tonWalletAddress = document.getElementById('tonWalletAddress');
    const tonWalletName = document.getElementById('tonWalletName');
    const tonWalletBalance = document.getElementById('tonWalletBalance');
    const tonAmountInput = document.getElementById('tonAmountInput');
    const tonPromoInput = document.getElementById('tonPromoInput');
    const tonDepositSubmitBtn = document.getElementById('tonDepositSubmitBtn');
    const tonConfirmBlock = document.getElementById('tonConfirmBlock');
    const tonOpenWalletBtn = document.getElementById('tonOpenWalletBtn');
    const tonStarsPreview = document.getElementById('tonStarsPreview');
    if (!tonConnectRoot || !tonDepositSubmitBtn) return;

    let tonConnectUI = null;
    let currentWalletOpenUrl = null;
    const manifestUrl = (typeof location !== 'undefined' && location.origin ? location.origin : '') + '/tonconnect-manifest.json';

    function getTonConnectionState() {
      if (!tonConnectUI) return { connected: false, account: null };
      try {
        var w = tonConnectUI.wallet;
        var a = tonConnectUI.account || (w && w.account) || (tonConnectUI.connector && tonConnectUI.connector.account);
        if (a) return { connected: true, account: a };
      } catch (_) { }
      return { connected: false, account: null };
    }

    function updateTonWalletUI(connected, account) {
      if (tonConnectCustomBtn) {
        if (connected) tonConnectCustomBtn.classList.add('hidden');
        else tonConnectCustomBtn.classList.remove('hidden');
      }
      if (tonConnectSdkWrap) tonConnectSdkWrap.classList.add('hidden');
      if (tonWalletInfo) {
        if (connected && account) {
          tonWalletInfo.classList.remove('hidden');
          var addr = (account.address || '').trim();
          tonWalletName.textContent = (account.walletInfo && account.walletInfo.name) ? account.walletInfo.name : 'TON кошелёк';
          var depositSection = document.getElementById('deposit-section');
          var tonContent = document.getElementById('depositTonContent');
          var tonTabVisible = !depositSection?.classList.contains('hidden') && tonContent && !tonContent.classList.contains('hidden');
          if (!tonTabVisible) {
            tonWalletAddress.textContent = addr.length > 12 ? addr.slice(0, 4) + '...' + addr.slice(-4) : addr || '…';
            tonWalletBalance.textContent = '—';
            tonWalletInfo.setAttribute('data-full-address', addr);
          } else {
            tonWalletAddress.textContent = '…';
            tonWalletBalance.textContent = '—';
            tonWalletInfo.setAttribute('data-full-address', addr);
            fetch('/api/ton/wallet-info?address=' + encodeURIComponent(addr), {
              headers: { 'X-Telegram-Init-Data': typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.initData ? Telegram.WebApp.initData : '' }
            }).then(function (r) { return r.json(); }).then(function (data) {
              if (!tonWalletInfo.getAttribute('data-full-address')) return;
              var formatted = data.addressFormatted || addr;
              tonWalletInfo.setAttribute('data-full-address', formatted);
              tonWalletAddress.textContent = formatted.length > 12 ? formatted.slice(0, 4) + '...' + formatted.slice(-4) : formatted || '—';
              tonWalletBalance.textContent = typeof data.balance === 'string' ? data.balance : (data.balance != null ? String(data.balance) : '—');
            }).catch(function () {
              if (tonWalletInfo.getAttribute('data-full-address')) {
                tonWalletAddress.textContent = addr.length > 12 ? addr.slice(0, 4) + '...' + addr.slice(-4) : addr || '—';
                tonWalletBalance.textContent = '—';
              }
            });
          }
        } else {
          tonWalletInfo.classList.add('hidden');
          tonWalletInfo.removeAttribute('data-full-address');
        }
      }
      var formGroupAmount = tonAmountInput && tonAmountInput.closest('.deposit-form-group');
      var formGroupPromo = tonPromoInput && tonPromoInput.closest('.deposit-form-group');
      if (connected) {
        if (tonAmountInput) { tonAmountInput.disabled = false; }
        if (tonPromoInput) { tonPromoInput.disabled = false; }
        if (formGroupAmount) formGroupAmount.classList.remove('disabled');
        if (formGroupPromo) formGroupPromo.classList.remove('disabled');
        if (tonDepositBtnWrap) tonDepositBtnWrap.classList.remove('hidden');
      } else {
        if (tonAmountInput) { tonAmountInput.disabled = true; tonAmountInput.value = ''; if (tonStarsPreview) tonStarsPreview.textContent = '≈0 ⭐'; }
        if (tonPromoInput) { tonPromoInput.disabled = true; }
        if (formGroupAmount) formGroupAmount.classList.add('disabled');
        if (formGroupPromo) formGroupPromo.classList.add('disabled');
        if (tonDepositBtnWrap) tonDepositBtnWrap.classList.add('hidden');
      }
      if (tonOpenWalletBtn) {
        var openUrl = currentWalletOpenUrl || 'https://tonkeeper.com';
        tonOpenWalletBtn.setAttribute('data-wallet-open-url', openUrl);
      }
      updateTonSubmitState();
    }

    function updateTonStarsPreview() {
      if (!tonStarsPreview || !tonAmountInput) return;
      var raw = String(tonAmountInput.value || '').trim().replace(',', '.');
      var amount = parseFloat(raw, 10);
      if (!Number.isFinite(amount) || amount < 0) {
        tonStarsPreview.textContent = '≈0 ⭐';
        return;
      }
      var stars = Math.floor(amount * 100);
      tonStarsPreview.textContent = '≈' + stars + ' ⭐';
    }

    function updateTonSubmitState() {
      if (!tonDepositSubmitBtn || !tonAmountInput) return;
      var amount = parseFloat(String(tonAmountInput.value).replace(',', '.'), 10);
      var hasAmount = Number.isFinite(amount) && amount > 0 && amount <= 500;
      var state = tonConnectUI ? getTonConnectionState() : { connected: false };
      tonDepositSubmitBtn.disabled = !state.connected || !hasAmount;
      updateTonStarsPreview();
    }

    function applyState() {
      if (!tonConnectUI) return;
      var state = getTonConnectionState();
      if (state.connected && tonConnectUI.wallet) {
        var w = tonConnectUI.wallet;
        if (!currentWalletOpenUrl) currentWalletOpenUrl = w.universalLink || (w.walletInfo && w.walletInfo.universalLink) || null;
      }
      updateTonWalletUI(state.connected, state.account);
    }
    window.__tonApplyState = applyState;

    function setupTonConnect(ui) {
      tonConnectUI = ui;
      tonConnectUI.onStatusChange(function (wallet) {
        var connected = !!wallet;
        var account = connected ? (wallet.account || wallet) : null;
        if (connected && wallet) {
          currentWalletOpenUrl = (wallet.universalLink || (wallet.walletInfo && wallet.walletInfo.universalLink)) || null;
          if (!currentWalletOpenUrl && account && account.walletInfo) {
            var name = (account.walletInfo.name || '').toLowerCase();
            if (name.indexOf('tonkeeper') !== -1) currentWalletOpenUrl = 'https://tonkeeper.com';
            else if (name.indexOf('wallet') !== -1 || name.indexOf('telegram') !== -1) currentWalletOpenUrl = 'https://t.me/wallet';
          }
          if (!currentWalletOpenUrl) currentWalletOpenUrl = 'https://tonkeeper.com';
        } else {
          currentWalletOpenUrl = null;
        }
        updateTonWalletUI(connected, account);
      });
      if (tonConnectUI.connectionRestored) {
        tonConnectUI.connectionRestored.then(applyState).catch(applyState);
      } else {
        applyState();
      }
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (tonConnectUI.connector && typeof tonConnectUI.connector.restoreConnection === 'function') {
          try {
            var p = tonConnectUI.connector.restoreConnection();
            if (p && typeof p.then === 'function') p.then(applyState, applyState);
            else applyState();
          } catch (_) { applyState(); }
        } else { applyState(); }
      });
    }

    if (typeof TON_CONNECT_UI === 'undefined' || !TON_CONNECT_UI.TonConnectUI) {
      tonDepositSubmitBtn.disabled = true;
      if (tonAmountInput) tonAmountInput.disabled = true;
      if (tonPromoInput) tonPromoInput.disabled = true;
      if (tonDepositBtnWrap) tonDepositBtnWrap.classList.add('hidden');
      return;
    }

    tonConnectCustomBtn && tonConnectCustomBtn.addEventListener('click', function () {
      if (tonConnectUI && typeof tonConnectUI.openModal === 'function') {
        try { tonConnectUI.openModal(); } catch (_) { }
      }
    });

    var tonWalletMenuBtn = document.getElementById('tonWalletMenuBtn');
    var tonWalletDropdown = document.getElementById('tonWalletDropdown');
    var tonWalletCopyAddress = document.getElementById('tonWalletCopyAddress');
    var tonWalletDisconnect = document.getElementById('tonWalletDisconnect');

    function closeTonWalletDropdown() {
      if (tonWalletDropdown) tonWalletDropdown.classList.add('hidden');
    }

    tonWalletMenuBtn && tonWalletMenuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (tonWalletDropdown) tonWalletDropdown.classList.toggle('hidden');
    });
    tonWalletCopyAddress && tonWalletCopyAddress.addEventListener('click', function () {
      var full = tonWalletInfo && tonWalletInfo.getAttribute('data-full-address');
      if (full && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(function () {
          if (typeof showAlert === 'function') showAlert('Адрес скопирован', 'success');
        }).catch(function () {
          if (typeof showAlert === 'function') showAlert('Не удалось скопировать', 'warning');
        });
      }
      closeTonWalletDropdown();
    });
    tonWalletDisconnect && tonWalletDisconnect.addEventListener('click', function () {
      if (tonConnectUI && tonConnectUI.connector && typeof tonConnectUI.connector.disconnect === 'function') {
        try {
          var p = tonConnectUI.connector.disconnect();
          if (p && typeof p.then === 'function') p.then(applyState, applyState);
          else applyState();
        } catch (_) { applyState(); }
      } else { applyState(); }
      closeTonWalletDropdown();
    });
    document.addEventListener('click', function () { closeTonWalletDropdown(); });

    function createTonConnectUI(config) {
      var opts = {
        manifestUrl: manifestUrl,
        buttonRootId: 'ton-connect',
        language: 'en',
        uiPreferences: { theme: 'DARK' }
      };
      var twaUrl = config && config.twaReturnUrl && String(config.twaReturnUrl).trim();
      if (twaUrl) {
        opts.actionsConfiguration = { twaReturnUrl: twaUrl, returnStrategy: 'back' };
      }
      var ui = new TON_CONNECT_UI.TonConnectUI(opts);
      setupTonConnect(ui);
    }

    var configFetched = false;
    var configTimeout = setTimeout(function () {
      if (configFetched) return;
      configFetched = true;
      createTonConnectUI(null);
    }, 2500);

    fetch('/api/ton/config', {
      headers: { 'X-Telegram-Init-Data': typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.initData ? Telegram.WebApp.initData : '' }
    }).then(function (r) { return r.json(); }).then(function (config) {
      if (configFetched) return;
      configFetched = true;
      clearTimeout(configTimeout);
      createTonConnectUI(config);
    }).catch(function () {
      if (configFetched) return;
      configFetched = true;
      clearTimeout(configTimeout);
      createTonConnectUI(null);
    });

    tonAmountInput?.addEventListener('input', updateTonSubmitState);
    tonAmountInput?.addEventListener('change', updateTonSubmitState);

    tonDepositSubmitBtn?.addEventListener('click', async function () {
      var state = tonConnectUI ? getTonConnectionState() : { connected: false };
      if (!tonConnectUI || !state.connected) {
        showAlert('Сначала подключите TON кошелёк.', 'warning');
        if (tonConnectUI && typeof tonConnectUI.openModal === 'function') {
          try { tonConnectUI.openModal(); } catch (_) { }
        }
        return;
      }
      const amountStr = String(tonAmountInput?.value || '').trim().replace(',', '.');
      const amountTon = parseFloat(amountStr, 10);
      if (!Number.isFinite(amountTon) || amountTon <= 0 || amountTon > 500) {
        showAlert('Укажите сумму от 0.1 до 500 TON (1 TON = 100 ⭐)', 'warning');
        return;
      }
      if (amountTon < 0.1) {
        showAlert('Минимальная сумма пополнения 0.1 TON', 'warning');
        return;
      }
      const promoCode = tonPromoInput?.value ? String(tonPromoInput.value).trim() : '';
      try {
        const res = await fetch('/api/ton/deposit-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData },
          // адрес кошелька — чтобы зачислить, даже если кошелёк потеряет комментарий к переводу
          body: JSON.stringify({ amountTon: amountTon, promoCode: promoCode || undefined, fromAddress: (state.account && state.account.address) || '' })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showAlert(data.error || 'Не удалось создать платёж', 'error');
          return;
        }
        const tx = {
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [{
            address: data.walletAddress,
            amount: data.amountNano,
            payload: data.commentBoc
          }]
        };
        document.querySelector('.deposit-ton-block')?.classList.add('hidden');
        tonConfirmBlock?.classList.remove('hidden');
        const intentId = data.intentId;
        const maxAttempts = 50;
        const checkIntervalMs = 3000;
        let cancelled = false;
        tonConnectUI.sendTransaction(tx).catch(function (sendErr) {
          const msg = String(sendErr?.message || '');
          if (msg.includes('declined') || msg.includes('Cancel')) cancelled = 'cancelled';
          else if (!msg.includes('not sent') && !msg.includes('Transaction was not sent')) cancelled = 'error';
        });
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(function (r) { setTimeout(r, i === 0 ? 4000 : checkIntervalMs); });
          if (cancelled === 'cancelled') {
            document.querySelector('.deposit-ton-block')?.classList.remove('hidden');
            tonConfirmBlock?.classList.add('hidden');
            showAlert('Если перевод всё же ушёл — он зачислится сам за 1–2 минуты, бот пришлёт сообщение.', 'info', { title: 'Платёж отменён' });
            return;
          }
          if (cancelled === 'error') {
            document.querySelector('.deposit-ton-block')?.classList.remove('hidden');
            tonConfirmBlock?.classList.add('hidden');
            showAlert('Если вы подтвердили перевод в кошельке — он зачислится сам за 1–2 минуты, бот пришлёт сообщение.', 'warning', { title: 'Кошелёк не ответил' });
            return;
          }
          const checkRes = await fetch('/api/ton/check-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData },
            body: JSON.stringify({ intentId: intentId })
          });
          if (checkRes.status === 429) {
            await new Promise(function (r) { setTimeout(r, 15000); });
            i--;
            continue;
          }
          var checkData;
          try {
            checkData = await checkRes.json();
          } catch (_) {
            continue;
          }
          if (checkData.status === 'completed' && checkData.credited) {
            try { tonConnectUI.closeModal(); } catch (_) { }
            document.querySelector('.deposit-ton-block')?.classList.remove('hidden');
            tonConfirmBlock?.classList.add('hidden');
            try {
              const balanceRes = await fetch('/api/get-balance', {
                headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
              });
              const balanceData = await balanceRes.json();
              if (balanceRes.ok && balanceData.balance !== undefined) {
                balance = balanceData.balance;
                updateBalance();
                updateProfilePage();
                updateCaseOpenButtonState();
              }
            } catch (_) { }
            showAlert('Баланс пополнен на ' + checkData.credited + ' ⭐', 'success', { title: 'Пополнение' });
            return;
          }
        }
        try { tonConnectUI.closeModal(); } catch (_) { }
        document.querySelector('.deposit-ton-block')?.classList.remove('hidden');
        tonConfirmBlock?.classList.add('hidden');
        showAlert('Перевод ещё не дошёл. Как только он появится в сети — баланс пополнится сам, бот пришлёт сообщение.', 'warning');
      } catch (err) {
        document.querySelector('.deposit-ton-block')?.classList.remove('hidden');
        tonConfirmBlock?.classList.add('hidden');
        console.error(err);
        showAlert('Ошибка: ' + (err?.message || 'попробуйте позже'), 'error');
      }
    });

    tonOpenWalletBtn?.addEventListener('click', function () {
      var url = (tonOpenWalletBtn && tonOpenWalletBtn.getAttribute('data-wallet-open-url')) || currentWalletOpenUrl || 'https://tonkeeper.com';
      if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.openLink) {
        Telegram.WebApp.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    });
  })();

  document.getElementById('openAdminPanelBtn')?.addEventListener('click', () => {
    if (!isAdmin) return;
    showAdminPanel();
  });

  document.getElementById('openAdminFromProfile')?.addEventListener('click', () => {
    if (!isAdmin) return;
    showAdminPanel();
  });

  document.querySelector('.open_case_btn')?.addEventListener('click', async function () {
    const promoInput = document.querySelector('.promo-input');
    const promoCode = promoInput.value.trim();

    if (!promoCode) {
      showAlert('Введите код активации');
      return;
    }

    const userId = tgUser?.id;
    if (!userId) {
      showAlert('Необходимо авторизоваться');
      return;
    }

    try {
      const response = await fetch('/api/check-promo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': Telegram.WebApp.initData
        },
        body: JSON.stringify({ promoCode })
      });

      const result = await response.json();

      if (!result.valid) {
        showAlert('❌ Промокод неверный или закончились активации');
        return;
      }

      const targetCaseId = result.caseId || 'case2';
      const targetCase = casesData[targetCaseId];
      const minDeposit = result.minDepositLast24h ?? targetCase?.minDepositLast24h ?? 1;

      if (minDeposit > 0) {
        const hasDeposit = await checkRecentDeposit(userId, minDeposit);
        if (!hasDeposit) {
          showAlert(`❌ Для открытия этого кейса необходимо пополнить минимум ${minDeposit} ⭐ за последние 24 часа`);
          openStarsModal();
          return;
        }
      }

      openCase(targetCaseId);
      startAnimation(promoCode);
    } catch (err) {
      console.error('Ошибка проверки промокода:', err);
      showAlert('⚠️ Ошибка проверки промокода');
    }
  });

  document.getElementById('buyTgStarsLink')?.addEventListener('click', function (e) {
    e.preventDefault();
    if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
      Telegram.WebApp.openTelegramLink('https://t.me/PremiumBot');
    } else {
      window.open('https://t.me/PremiumBot', '_blank');
    }
  });

}

document.getElementById('mobileUpgradeBtn')?.addEventListener('click', function () {
  showUpgradeSection();
  updateMobileMenuActiveState('upgrade');
});

let adminPanelLoaded = false;

async function loadAdminPanelHTML() {
  if (adminPanelLoaded) return true;
  try {
    const res = await fetch('/api/admin/panel', {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    if (!res.ok) return false;
    const html = await res.text();
    const adminSection = document.getElementById('admin-section');
    if (adminSection) {
      adminSection.innerHTML = html;
      initAdminEventListeners();
      adminPanelLoaded = true;
    }
    return true;
  } catch (err) {
    console.error('Failed to load admin panel:', err);
    return false;
  }
}

function initAdminEventListeners() {
  document.getElementById('backToMenuFromAdmin')?.addEventListener('click', () => {
    hideAdminPanel();
  });

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (!isAdmin) return;
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
      if (target === 'dashboard') {
        document.getElementById('adminDashboardTab')?.classList.remove('hidden');
        loadAdminDashboard();
      } else if (target === 'users') {
        document.getElementById('adminUsersTab')?.classList.remove('hidden');
        initAdminUserSearch();
        loadAdminUsers();
      } else if (target === 'cases') {
        document.getElementById('adminCasesTab')?.classList.remove('hidden');
        loadAdminCases();
      } else if (target === 'promos') {
        document.getElementById('adminPromosTab')?.classList.remove('hidden');
        loadAdminPromos();
      } else if (target === 'withdrawals') {
        document.getElementById('adminWithdrawalsTab')?.classList.remove('hidden');
        loadAdminWithdrawals();
      } else if (target === 'broadcast') {
        document.getElementById('adminBroadcastTab')?.classList.remove('hidden');
      } else if (target === 'broadcast-history') {
        document.getElementById('adminBroadcastHistoryTab')?.classList.remove('hidden');
        loadAdminBroadcastHistory();
      } else if (target === 'logs') {
        document.getElementById('adminLogsTab')?.classList.remove('hidden');
        loadAdminLogs();
      } else if (target === 'referrals') {
        document.getElementById('adminReferralsTab')?.classList.remove('hidden');
        loadAdminReferrals();
      } else if (target === 'errors') {
        document.getElementById('adminErrorsTab')?.classList.remove('hidden');
        loadAdminErrors();
      }
    });
  });

  document.getElementById('broadcastBoldBtn')?.addEventListener('click', () => {
    const ta = document.getElementById('broadcastText');
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const val = ta.value;
    if (start === end) return;
    const sel = val.slice(start, end);
    ta.value = val.slice(0, start) + '<b>' + sel + '</b>' + val.slice(end);
    ta.selectionStart = start; ta.selectionEnd = end + 7;
    ta.focus();
  });

  var broadcastPhotoFileId = null;
  var broadcastPreviewImgUrl = null;
  var broadcastPreviewDataUrl = null;

  document.getElementById('broadcastAddButton')?.addEventListener('click', () => {
    const list = document.getElementById('broadcastButtonsList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'broadcast-button-row';
    row.innerHTML = `
      <input type="text" class="broadcast-btn-text" placeholder="Текст кнопки" maxlength="64">
      <input type="url" class="broadcast-btn-url" placeholder="https://...">
      <button type="button" class="broadcast-remove-btn">×</button>
    `;
    row.querySelector('.broadcast-remove-btn').addEventListener('click', () => row.remove());
    list.appendChild(row);
  });

  document.getElementById('broadcastFileLabel')?.addEventListener('click', () => {
    if (!broadcastPhotoFileId) document.getElementById('broadcastPhotoFile')?.click();
  });
  document.getElementById('broadcastPhotoFile')?.addEventListener('change', async (e) => {
    const file = e.target?.files?.[0];
    const labelEl = document.getElementById('broadcastFileLabel');
    const clearBtn = document.getElementById('broadcastClearFile');
    if (!file || !file.type.startsWith('image/')) {
      if (labelEl) labelEl.textContent = 'или загрузить файл';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Файл не больше 10 МБ');
      e.target.value = '';
      return;
    }
    if (broadcastPreviewImgUrl) URL.revokeObjectURL(broadcastPreviewImgUrl);
    broadcastPreviewImgUrl = URL.createObjectURL(file);
    broadcastPreviewDataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    if (labelEl) labelEl.textContent = 'Загрузка...';
    try {
      const base64 = broadcastPreviewDataUrl;
      const res = await fetch('/api/admin/upload-broadcast-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData },
        body: JSON.stringify({ photo: base64 })
      });
      const data = await res.json();
      if (res.ok && data.fileId) {
        broadcastPhotoFileId = data.fileId;
        if (labelEl) labelEl.textContent = `Загружено: ${file.name}`;
        if (clearBtn) { clearBtn.classList.remove('hidden'); }
        document.getElementById('broadcastPhotoUrl')?.setAttribute('disabled', 'disabled');
      } else {
        if (labelEl) labelEl.textContent = 'или загрузить файл';
        showAlert(data.error || 'Ошибка загрузки');
      }
    } catch (err) {
      if (labelEl) labelEl.textContent = 'или загрузить файл';
      showAlert('Ошибка загрузки');
    }
  });
  document.getElementById('broadcastClearFile')?.addEventListener('click', () => {
    broadcastPhotoFileId = null;
    broadcastPreviewDataUrl = null;
    if (broadcastPreviewImgUrl) {
      URL.revokeObjectURL(broadcastPreviewImgUrl);
      broadcastPreviewImgUrl = null;
    }
    const input = document.getElementById('broadcastPhotoFile');
    if (input) input.value = '';
    const labelEl = document.getElementById('broadcastFileLabel');
    if (labelEl) labelEl.textContent = 'или загрузить файл';
    document.getElementById('broadcastClearFile')?.classList.add('hidden');
    document.getElementById('broadcastPhotoUrl')?.removeAttribute('disabled');
  });

  document.getElementById('broadcastPreviewBtn')?.addEventListener('click', () => {
    const text = (document.getElementById('broadcastText')?.value || '').trim();
    const photoUrlInput = document.getElementById('broadcastPhotoUrl');
    const photoUrl = (photoUrlInput?.value || '').trim();
    const box = document.getElementById('broadcastPreviewBox');
    if (!box) return;
    const imgSrc = broadcastPreviewDataUrl || broadcastPreviewImgUrl || photoUrl || null;
    const hasPhoto = !!(imgSrc || broadcastPhotoFileId);
    const rows = document.querySelectorAll('.broadcast-button-row');
    const buttons = [];
    rows.forEach(r => {
      const t = r.querySelector('.broadcast-btn-text')?.value?.trim();
      const u = r.querySelector('.broadcast-btn-url')?.value?.trim();
      if (t && u) buttons.push({ text: t, url: u });
    });
    let html = '<div class="broadcast-preview-inner">';
    if (hasPhoto) {
      if (imgSrc) {
        const safeSrc = imgSrc.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        html += `<div class="broadcast-preview-img">
          <img src="${safeSrc}" alt="" onerror="this.style.display='none';var s=this.nextElementSibling;if(s)s.style.display='block';">
          <span class="broadcast-preview-photo-fallback" style="display:none;">Фото прикреплено</span>
        </div>`;
      } else {
        html += '<div class="broadcast-preview-img"><span class="broadcast-preview-photo-fallback">Фото прикреплено</span></div>';
      }
    }
    if (text) html += `<div class="broadcast-preview-text">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')}</div>`;
    if (buttons.length) {
      html += '<div class="broadcast-preview-btns">';
      buttons.forEach(b => { html += `<span class="broadcast-preview-link">${(b.text || '').replace(/</g, '&lt;')}</span>`; });
      html += '</div>';
    }
    if (!hasPhoto && !text) html += '<span class="broadcast-preview-empty">Нет текста и картинки</span>';
    html += '</div>';
    box.innerHTML = html;
    box.classList.remove('hidden');
  });

  document.getElementById('broadcastSendBtn')?.addEventListener('click', async () => {
    if (!isAdmin) return;
    const textEl = document.getElementById('broadcastText');
    const photoEl = document.getElementById('broadcastPhotoUrl');
    const resultEl = document.getElementById('broadcastResult');
    const statsEl = document.getElementById('broadcastStats');
    const sendBtn = document.getElementById('broadcastSendBtn');
    const text = (textEl?.value || '').trim();
    const photoUrl = (!broadcastPhotoFileId && photoEl?.value) ? photoEl.value.trim() : '';
    if (!text && !photoUrl && !broadcastPhotoFileId) {
      showAlert('Введите текст или прикрепите картинку');
      return;
    }
    const rows = document.querySelectorAll('.broadcast-button-row');
    const buttons = [];
    rows.forEach(r => {
      const t = r.querySelector('.broadcast-btn-text')?.value?.trim();
      const u = r.querySelector('.broadcast-btn-url')?.value?.trim();
      if (t && u) buttons.push({ text: t, url: u });
    });
    if (sendBtn) sendBtn.disabled = true;
    if (statsEl) statsEl.classList.add('hidden');
    if (resultEl) {
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <div class="broadcast-progress-wrap">
          <div class="broadcast-progress-text">Запуск рассылки...</div>
          <div class="broadcast-progress-bar"><div class="broadcast-progress-fill" style="width:0%"></div></div>
          <div class="broadcast-progress-count"></div>
        </div>
      `;
      resultEl.style.color = '';
    }
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData },
        body: JSON.stringify({
          text: text || ' ',
          photoUrl: photoUrl || undefined,
          photoFileId: broadcastPhotoFileId || undefined,
          buttons
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (resultEl) resultEl.classList.add('hidden');
        if (statsEl) { statsEl.classList.remove('hidden'); statsEl.textContent = data.error || 'Ошибка'; statsEl.style.color = '#ef4444'; }
        if (sendBtn) sendBtn.disabled = false;
        return;
      }

      const pollInterval = setInterval(async () => {
        try {
          const sr = await fetch('/api/admin/broadcast-status', {
            headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
          });
          const st = await sr.json();
          const processed = st.sent + st.failed;
          const pct = st.total > 0 ? Math.round((processed / st.total) * 100) : 0;

          if (resultEl) {
            const fill = resultEl.querySelector('.broadcast-progress-fill');
            const countEl = resultEl.querySelector('.broadcast-progress-count');
            const textEl2 = resultEl.querySelector('.broadcast-progress-text');
            if (fill) fill.style.width = pct + '%';
            if (countEl) countEl.textContent = `${processed} / ${st.total} (${pct}%)`;
            if (textEl2) textEl2.textContent = 'Рассылка идёт...';
          }

          if (st.done) {
            clearInterval(pollInterval);
            if (resultEl) resultEl.classList.add('hidden');
            if (statsEl) {
              statsEl.classList.remove('hidden');
              if (!st.error) {
                statsEl.innerHTML = `
                  <div class="broadcast-success-msg">Рассылка завершена</div>
                  <div class="broadcast-stats-card">
                    <div class="broadcast-stats-title">Статистика рассылки</div>
                    <div class="broadcast-stats-row"><span>Получили сообщение</span><strong>${st.sent}</strong></div>
                    <div class="broadcast-stats-row"><span>Ошибок доставки</span><strong>${st.failed}</strong></div>
                    <div class="broadcast-stats-row"><span>Всего пользователей</span><strong>${st.total}</strong></div>
                  </div>
                `;
                statsEl.style.color = '';
              } else {
                statsEl.textContent = 'Ошибка: ' + st.error;
                statsEl.style.color = '#ef4444';
              }
            }
            if (sendBtn) sendBtn.disabled = false;
          }
        } catch (e) {
          console.error('Broadcast poll error:', e);
        }
      }, 2000);

    } catch (err) {
      if (resultEl) resultEl.classList.add('hidden');
      if (statsEl) { statsEl.classList.remove('hidden'); statsEl.textContent = 'Ошибка сети'; statsEl.style.color = '#ef4444'; }
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  document.getElementById('adminCreatePromoBtn')?.addEventListener('click', async () => {
    if (!isAdmin) return;
    const codeInput = document.getElementById('adminPromoCodeInput');
    const maxInput = document.getElementById('adminPromoMaxInput');
    const depositPercentInput = document.getElementById('adminPromoDepositPercentInput');
    const minDepositInput = document.getElementById('adminPromoMinDepositInput');
    const code = codeInput.value.trim();
    const max = parseInt(maxInput.value) || 1;

    if (!code) {
      showAlert('Введите код промокода');
      return;
    }

    const body = { code, maxActivations: max };

    if (currentPromoType === 'deposit') {
      const depositPercent = parseInt(depositPercentInput?.value, 10);
      if (!depositPercent || depositPercent < 1 || depositPercent > 100) {
        showAlert('Укажите бонус % (от 1 до 100)');
        return;
      }
      body.depositPercent = depositPercent;
    } else {
      body.caseId = 'case2';
      const minDepRaw = minDepositInput?.value;
      const minDep = typeof minDepRaw === 'string' ? minDepRaw.trim() : String(minDepRaw ?? '').trim();
      if (minDep !== '') {
        const n = parseInt(minDep, 10);
        if (!isNaN(n) && n >= 0) body.minDepositLast24h = n;
      }
    }

    try {
      const res = await fetch('/api/admin/promos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': Telegram.WebApp.initData
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showAlert(data.error || 'Не удалось создать промокод');
        return;
      }
      codeInput.value = '';
      maxInput.value = '';
      if (depositPercentInput) depositPercentInput.value = '';
      if (minDepositInput) minDepositInput.value = '';
      await loadAdminPromos();
      showAlert('✅ Промокод создан');
    } catch (err) {
      console.error('Ошибка создания промокода:', err);
      showAlert('Ошибка сервера при создании промокода');
    }
  });

  document.getElementById('adminCreateCaseBtn')?.addEventListener('click', async () => {
    if (!isAdmin) return;
    const nameInput = document.getElementById('adminNewCaseNameInput');
    const priceInput = document.getElementById('adminNewCasePriceInput');
    const imageInput = document.getElementById('adminNewCaseImageInput');
    const minDepInput = document.getElementById('adminNewCaseMinDepInput');
    const promoCheckbox = document.getElementById('adminNewCasePromoOnlyInput');

    const name = nameInput.value.trim();
    const price = parseInt(priceInput.value) || 0;
    const image = imageInput.value.trim();
    const minDep = minDepInput.value ? parseInt(minDepInput.value) : null;

    if (!name) {
      showAlert('Введите имя кейса', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/admin/cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': Telegram.WebApp.initData
        },
        body: JSON.stringify({
          name,
          price,
          image,
          promo_only: !!promoCheckbox.checked,
          min_deposit_last24h: minDep,
          enabled: true,
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showAlert(data.error || 'Не удалось создать кейс', 'error');
        return;
      }
      nameInput.value = '';
      priceInput.value = '';
      imageInput.value = '';
      minDepInput.value = '';
      promoCheckbox.checked = false;
      showAlert(`✅ Кейс создан (id: ${data.case_id})`, 'success');
      loadAdminCases();
    } catch (err) {
      console.error('Ошибка создания кейса:', err);
      showAlert('Ошибка сервера при создании кейса', 'error');
    }
  });
}

async function showAdminPanel() {
  caseSelection.style.display = 'none';
  caseOpening.classList.remove('active');
  profileSection.classList.add('hidden');
  document.getElementById('friends-section')?.classList.add('hidden');
  document.getElementById('casesCategories').style.display = 'none';

  const loaded = await loadAdminPanelHTML();
  if (!loaded) {
    showAlert('Нет доступа к админ-панели');
    caseSelection.style.display = 'grid';
    document.getElementById('casesCategories').style.display = 'block';
    return;
  }

  const adminSection = document.getElementById('admin-section');
  if (adminSection) {
    adminSection.classList.remove('hidden');
  }

  loadAdminDashboard();
}

function hideAdminPanel() {
  const adminSection = document.getElementById('admin-section');
  if (adminSection) {
    adminSection.classList.add('hidden');
  }

  caseSelection.style.display = 'grid';
  document.getElementById('casesCategories').style.display = 'block';
  document.getElementById('friends-section')?.classList.add('hidden');
  profileSection.classList.add('hidden');
}

async function loadAdminDashboard() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin stats error:', data);
      return;
    }
    const container = document.getElementById('adminStats');
    if (!container) return;

    container.innerHTML = `
      <div class="admin-card">
        <div class="admin-card-label">Total users</div>
        <div class="admin-card-value">${data.users.total}</div>
        <div class="admin-muted">30d: ${data.users.last30}, 7d: ${data.users.last7}, 1d: ${data.users.last1}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Total deposits</div>
        <div class="admin-card-value">${data.deposits.total}</div>
        <div class="admin-muted">Ops: ${data.deposits.totalCount}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Deposits 30d</div>
        <div class="admin-card-value">${data.deposits.last30}</div>
        <div class="admin-muted">Ops: ${data.deposits.last30Count}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Deposits 7d</div>
        <div class="admin-card-value">${data.deposits.last7}</div>
        <div class="admin-muted">Ops: ${data.deposits.last7Count}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Deposits 1d</div>
        <div class="admin-card-value">${data.deposits.last1}</div>
        <div class="admin-muted">Ops: ${data.deposits.last1Count}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Case opens (all)</div>
        <div class="admin-card-value">${data.cases.totalOpens}</div>
        <div class="admin-muted">30d: ${data.cases.last30}, 7d: ${data.cases.last7}, 1d: ${data.cases.last1}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Top case</div>
        <div class="admin-card-value">${data.cases.topCaseName || '—'}</div>
        <div class="admin-muted">Opens: ${data.cases.topCaseCount}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-label">Top item</div>
        <div class="admin-card-value">${data.cases.topItemName || '—'}</div>
        <div class="admin-muted">Drops: ${data.cases.topItemCount}</div>
      </div>
    `;
  } catch (err) {
    console.error('Ошибка загрузки статистики админки:', err);
  }
}

async function loadAdminReferrals() {
  const container = document.getElementById('adminReferralsList');
  if (!container) return;
  container.innerHTML = '<p class="admin-muted">Загрузка...</p>';
  try {
    const res = await fetch('/api/admin/referrals?limit=200', {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = '<p class="admin-muted">Ошибка загрузки</p>';
      return;
    }
    const rows = data.referrals || [];
    if (rows.length === 0) {
      container.innerHTML = '<p class="admin-muted">Нет пользователей с рефералами</p>';
      return;
    }
    let html = `<div style="margin-bottom:10px;color:#64748b;font-size:13px;">Всего: <strong style="color:#cbd5e1;">${data.total}</strong> пользователей с рефералами</div>`;
    html += '<table class="admin-referrals-table">';
    html += '<thead><tr>';
    html += '<th>#</th>';
    html += '<th>Пользователь</th>';
    html += '<th>Рефералов</th>';
    html += '</tr></thead><tbody>';
    rows.forEach((r, i) => {
      const name = r.username ? `@${r.username}` : (r.first_name || '—');
      html += `<tr>`;
      html += `<td>${i + 1}</td>`;
      html += `<td><span class="ref-username">${name}</span><br><span class="ref-id">${r.telegram_id}</span></td>`;
      html += `<td>${r.referral_count}</td>`;
      html += `</tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Ошибка загрузки рефералов:', err);
    container.innerHTML = '<p class="admin-muted">Ошибка сети</p>';
  }
}

async function loadAdminCases() {
  try {
    const res = await fetch('/api/admin/cases', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin cases error:', data);
      return;
    }
    const list = document.getElementById('adminCasesList');
    if (!list) return;
    list.innerHTML = '';

    data.cases.forEach(c => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.dataset.caseId = c.case_id;
      row.innerHTML = `
        <div>
          <div><strong>${c.name}</strong> (${c.case_id})</div>
          <div class="admin-muted">Price: ${c.price} ⭐ • Items: ${c.items_count}</div>
        </div>
        <div style="text-align:right;">
          <div>Order: ${c.display_order}</div>
          <div class="admin-muted">${c.enabled ? 'ENABLED' : 'DISABLED'}${c.promo_only ? ' • PROMO' : ''}</div>
        </div>
      `;
      row.addEventListener('click', () => loadAdminCaseDetails(c.case_id));
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Ошибка загрузки кейсов админки:', err);
  }
}

async function loadAdminCaseDetails(caseId) {
  try {
    const res = await fetch(`/api/admin/cases/${caseId}`, {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin case details error:', data);
      return;
    }

    const container = document.getElementById('adminCaseDetails');
    if (!container) return;

    const meta = data.meta || {};
    const base = data.base || {};
    const items = data.items || [];

    const effectiveName = meta.name || base.name || caseId;
    const effectivePrice = meta.price != null ? meta.price : (base.price || 0);
    const effectiveImage = meta.image || base.image || '';
    const effectiveOrder = meta.display_order != null ? meta.display_order : 0;
    const effectivePromoOnly = meta.promo_only != null ? !!meta.promo_only : !!base.promoOnly;
    const effectiveMinDep = meta.min_deposit_last24h != null
      ? meta.min_deposit_last24h
      : (base.minDepositLast24h || '');

    container.innerHTML = `
      <h3>Case ${caseId}</h3>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        <label style="font-size:12px;">Name</label>
        <input id="adminCaseNameInput" type="text" value="${effectiveName}" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
        <label style="font-size:12px;">Price ⭐</label>
        <input id="adminCasePriceInput" type="number" value="${effectivePrice}" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
        <label style="font-size:12px;">Image URL</label>
        <input id="adminCaseImageInput" type="text" value="${effectiveImage}" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
        <label style="font-size:12px;">Display order</label>
        <input id="adminCaseOrderInput" type="number" value="${effectiveOrder}" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
        <label style="font-size:12px;">Min deposit last 24h ⭐ (for promo)</label>
        <input id="adminCaseMinDepInput" type="number" value="${effectiveMinDep || ''}" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input id="adminCasePromoOnlyInput" type="checkbox" ${effectivePromoOnly ? 'checked' : ''} />
          Promo-only case
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input id="adminCaseEnabledInput" type="checkbox" ${meta.enabled === 0 ? '' : 'checked'} />
          Enabled
        </label>
        <button class="admin-btn-small approve" id="adminSaveCaseMetaBtn" style="align-self:flex-start;margin-top:4px;">Save case</button>
      </div>

      <h4>Items (${items.length})</h4>
      <div id="adminCaseItemsList" class="admin-muted" style="max-height:120px;overflow-y:auto;margin-bottom:8px;">
        ${items.length ? items.map(i => `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span>#${i.id} ${i.name} (${i.value} ⭐)</span>
            <button class="admin-btn-small reject" data-item-id="${i.id}">Delete</button>
          </div>
        `).join('') : 'No custom items (используются дефолтные из конфига).'}
      </div>
      <div style="margin-top:8px;">
        <h4>Add item</h4>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <input id="adminNewItemName" type="text" placeholder="Name" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
          <input id="adminNewItemValue" type="number" placeholder="Value ⭐" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
          <input id="adminNewItemImage" type="text" placeholder="Image URL" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
          <input id="adminNewItemRarity" type="text" placeholder="Rarity (optional)" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
          <input id="adminNewItemChance" type="text" placeholder="Chance text (optional)" style="background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:6px 8px;color:#fff;font-size:13px;" />
          <button class="admin-btn-small approve" id="adminAddItemBtn" style="align-self:flex-start;margin-top:4px;">Add item</button>
        </div>
      </div>
    `;

    document.getElementById('adminSaveCaseMetaBtn')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('adminCaseNameInput');
      const priceInput = document.getElementById('adminCasePriceInput');
      const imageInput = document.getElementById('adminCaseImageInput');
      const orderInput = document.getElementById('adminCaseOrderInput');
      const promoCheckbox = document.getElementById('adminCasePromoOnlyInput');
      const enabledCheckbox = document.getElementById('adminCaseEnabledInput');
      const minDepInput = document.getElementById('adminCaseMinDepInput');

      const body = {
        name: nameInput.value.trim(),
        price: parseInt(priceInput.value) || 0,
        image: imageInput.value.trim(),
        display_order: parseInt(orderInput.value) || 0,
        promo_only: !!promoCheckbox.checked,
        enabled: !!enabledCheckbox.checked,
        min_deposit_last24h: minDepInput.value ? parseInt(minDepInput.value) : null,
      };

      try {
        const res2 = await fetch(`/api/admin/cases/${caseId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify(body)
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось сохранить кейс');
          return;
        }
        showAlert('✅ Кейс обновлён');
        loadAdminCases();
        loadAdminCaseDetails(caseId);
      } catch (err) {
        console.error('Ошибка сохранения кейса:', err);
      }
    });

    document.getElementById('adminAddItemBtn')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('adminNewItemName');
      const valueInput = document.getElementById('adminNewItemValue');
      const imageInput = document.getElementById('adminNewItemImage');
      const rarityInput = document.getElementById('adminNewItemRarity');
      const chanceInput = document.getElementById('adminNewItemChance');

      const name = nameInput.value.trim();
      const value = parseFloat(valueInput.value);
      const image = imageInput.value.trim();

      if (!name || !image || isNaN(value)) {
        showAlert('Заполните название, цену и картинку');
        return;
      }

      try {
        const res2 = await fetch(`/api/admin/cases/${caseId}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify({
            name,
            value,
            image,
            rarity: rarityInput.value.trim() || null,
            chance: chanceInput.value.trim() || null,
          })
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось добавить предмет');
          return;
        }
        showAlert('✅ Предмет добавлен');
        loadAdminCaseDetails(caseId);
      } catch (err) {
        console.error('Ошибка добавления предмета:', err);
      }
    });

    document.querySelectorAll('#adminCaseItemsList .admin-btn-small.reject')?.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-item-id');
        if (!id) return;
        try {
          const res2 = await fetch(`/api/admin/cases/${caseId}/items/${id}`, {
            method: 'DELETE',
            headers: {
              'X-Telegram-Init-Data': Telegram.WebApp.initData
            }
          });
          const d2 = await res2.json();
          if (!res2.ok || !d2.success) {
            showAlert(d2.error || 'Не удалось удалить предмет');
            return;
          }
          showAlert('✅ Предмет удалён');
          loadAdminCaseDetails(caseId);
        } catch (err) {
          console.error('Ошибка удаления предмета:', err);
        }
      });
    });
  } catch (err) {
    console.error('Ошибка загрузки деталей кейса админки:', err);
  }
}

let adminUserSearchTimeout = null;

function initAdminUserSearch() {
  const input = document.getElementById('adminUserSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(adminUserSearchTimeout);
    adminUserSearchTimeout = setTimeout(() => loadAdminUsers(input.value.trim()), 300);
  });
}

async function loadAdminUsers(search) {
  try {
    const q = search ? `&search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`/api/admin/users?limit=50&offset=0${q}`, {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin users error:', data);
      return;
    }

    const list = document.getElementById('adminUsersList');
    if (!list) return;
    list.innerHTML = '';

    if (!data.users || data.users.length === 0) {
      list.innerHTML = '<p class="admin-muted">No users found.</p>';
      return;
    }

    data.users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.dataset.userId = u.telegram_id;
      row.innerHTML = `
        <div>
          <div><strong>${u.first_name || ''}</strong> ${u.username ? '@' + u.username : ''}</div>
          <div class="admin-muted">ID: ${u.telegram_id}</div>
        </div>
        <div style="text-align:right;">
          <div>${u.balance} ⭐</div>
          <div class="admin-muted">${u.is_banned ? '<span style="color:#ef4444;">BANNED</span>' : ''} ${u.is_admin ? '<span style="color:#3b82f6;">ADMIN</span>' : ''}</div>
        </div>
      `;
      row.addEventListener('click', () => loadAdminUserDetails(u.telegram_id));
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Ошибка загрузки пользователей админки:', err);
  }
}

async function loadAdminUserDetails(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin user details error:', data);
      return;
    }

    const container = document.getElementById('adminUserDetails');
    if (!container) return;

    const user = data.user;
    const inventory = data.inventory || [];
    const deposits = data.deposits || [];
    const withdrawals = data.withdrawals || [];
    const logs = data.logs || [];
    const referrer = data.referrer || null;
    const referrals = data.referrals || [];
    const referralsCount = data.referralsCount ?? referrals.length;

    let regDate = user.created_at;
    try {
      const d = new Date(user.created_at + 'Z');
      regDate = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    } catch { }

    const totalDeposits = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="flex:1;">
          <h3 style="margin:0;">${user.first_name || ''} ${user.username ? '@' + user.username : ''}</h3>
          <div class="admin-muted" style="margin-top:2px;">ID: ${user.telegram_id} · Reg: ${regDate}</div>
        </div>
        <div style="text-align:right;">
          ${user.is_banned ? '<span style="color:#ef4444;font-weight:600;font-size:12px;background:rgba(239,68,68,0.15);padding:2px 8px;border-radius:6px;">BANNED</span>' : '<span style="color:#22c55e;font-size:12px;background:rgba(34,197,94,0.15);padding:2px 8px;border-radius:6px;">Active</span>'}
          ${user.is_admin ? '<span style="color:#3b82f6;font-size:12px;background:rgba(59,130,246,0.15);padding:2px 8px;border-radius:6px;margin-left:4px;">ADMIN</span>' : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:#131417;border-radius:8px;padding:8px 10px;">
          <div class="admin-muted" style="font-size:11px;">Balance</div>
          <div style="font-size:16px;font-weight:600;">${user.balance} ⭐</div>
        </div>
        <div style="background:#131417;border-radius:8px;padding:8px 10px;">
          <div class="admin-muted" style="font-size:11px;">Total deposits</div>
          <div style="font-size:16px;font-weight:600;">${totalDeposits} ⭐</div>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div class="admin-muted" style="font-size:11px;margin-bottom:4px;">Реферер (кто привёл)</div>
        <div style="background:#131417;border-radius:8px;padding:6px 10px;font-size:13px;">
          ${referrer ? `${referrer.first_name || ''} ${referrer.username ? '@' + referrer.username : ''} (ID: ${referrer.telegram_id})` : '—'}
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div class="admin-muted" style="font-size:11px;margin-bottom:4px;">Рефералы (кого привёл): ${referralsCount}</div>
        <div style="background:#131417;border-radius:8px;padding:6px 10px;max-height:80px;overflow-y:auto;font-size:12px;">
          ${referrals.length ? referrals.map(r => `${r.first_name || ''} ${r.username ? '@' + r.username : ''} (ID: ${r.telegram_id})`).join('<br>') : '—'}
        </div>
      </div>
      <div class="admin-row-actions" style="margin-bottom:10px;">
        <button class="admin-btn-small ${user.is_banned ? 'approve' : 'reject'}" id="adminToggleBanBtn">
          ${user.is_banned ? 'Unban' : 'Ban'}
        </button>
        <button class="admin-btn-small" id="adminGiveAdminBtn">
          ${user.is_admin ? 'Remove admin' : 'Make admin'}
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        <div class="admin-muted" style="font-size:11px;">Adjust balance</div>
        <div style="display:flex;gap:6px;">
          <input id="adminBalanceDeltaInput" type="number" placeholder="Δ balance" style="flex:1;background:#131417;border-radius:8px;border:1px solid #2d2f33;padding:4px 8px;color:#fff;font-size:13px;" />
          <button class="admin-btn-small approve" id="adminApplyBalanceDeltaBtn">Apply</button>
          <button class="admin-btn-small reject" id="adminSetZeroBalanceBtn">Set 0</button>
        </div>
      </div>
      <div class="admin-user-detail-tabs" style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
        <button class="admin-btn-small active" data-detail-tab="inventory" style="font-size:11px;">Inventory (${inventory.length})</button>
        <button class="admin-btn-small" data-detail-tab="deposits" style="font-size:11px;">Deposits (${deposits.length})</button>
        <button class="admin-btn-small" data-detail-tab="withdrawals" style="font-size:11px;">Withdrawals (${withdrawals.length})</button>
        <button class="admin-btn-small" data-detail-tab="logs" style="font-size:11px;">Logs (${logs.length})</button>
      </div>
      <div id="userDetailInventory" class="admin-muted" style="max-height:200px;overflow-y:auto;">
        ${inventory.length ? inventory.map(i => `<div style="padding:3px 0;border-bottom:1px solid #1e2028;">${i.item_name} <span style="opacity:0.6;">(${i.item_value} ⭐) [${i.item_rarity || 'common'}]</span></div>`).join('') : '<p>Empty inventory</p>'}
      </div>
      <div id="userDetailDeposits" class="admin-muted hidden" style="max-height:200px;overflow-y:auto;">
        ${deposits.length ? deposits.map(d => {
      let dt = d.created_at;
      try { dt = new Date(d.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }); } catch { }
      return `<div style="padding:3px 0;border-bottom:1px solid #1e2028;"><span style="color:#22c55e;">+${d.amount} ⭐</span> <span style="opacity:0.5;font-size:11px;">${dt}</span></div>`;
    }).join('') : '<p>No deposits</p>'}
      </div>
      <div id="userDetailWithdrawals" class="admin-muted hidden" style="max-height:200px;overflow-y:auto;">
        ${withdrawals.length ? withdrawals.map(w => {
      let dt = w.created_at;
      try { dt = new Date(w.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }); } catch { }
      const statusColor = w.status === 'completed' ? '#22c55e' : w.status === 'rejected' ? '#ef4444' : '#f59e0b';
      return `<div style="padding:3px 0;border-bottom:1px solid #1e2028;">${w.item_name} (${w.item_value} ⭐) <span style="color:${statusColor};font-size:11px;">[${w.status}]</span> <span style="opacity:0.5;font-size:11px;">${dt}</span></div>`;
    }).join('') : '<p>No withdrawals</p>'}
      </div>
      <div id="userDetailLogs" class="admin-muted hidden" style="max-height:200px;overflow-y:auto;">
        ${logs.length ? logs.map(l => {
      let details = {};
      try { details = l.action_details ? JSON.parse(l.action_details) : {}; } catch { details = { raw: l.action_details }; }
      let actionText = l.action_type;
      if (l.action_type === 'case_open_success' || l.action_type === 'case_open') actionText = 'Открытие кейса';
      else if (l.action_type === 'error') actionText = '❗ Ошибка';
      else if (l.action_type === 'deposit') actionText = 'Пополнение';
      else if (l.action_type === 'user_created') actionText = 'Новый пользователь';
      else if (l.action_type === 'referral_linked') actionText = 'Реферал привязан';
      else if (l.action_type === 'item_sold') actionText = 'Продажа предмета';
      else if (l.action_type === 'item_sold_bulk') actionText = 'Массовая продажа';
      let moscowTime = l.created_at;
      try { moscowTime = new Date(l.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }); } catch { }
      const caseInfo = details.caseName || details.case_id || '';
      const itemInfo = details.itemName ? details.itemName + (details.itemValue ? ' (' + details.itemValue + ' ⭐)' : '') : (details.item_name ? details.item_name + (details.item_value != null ? ' (' + details.item_value + ' ⭐)' : '') : (details.item || ''));
      const stageInfo = details.stage ? 'Этап: ' + details.stage + '. ' : '';
      const errInfo = details.error ? 'Ошибка: ' + details.error : (details.raw || '');
      const amountInfo = details.amount ? '+' + details.amount + ' ⭐' : '';
      const referrerInfo = details.referrer_id ? 'Реферер ID: ' + details.referrer_id : '';
      const bulkInfo = details.count != null ? 'Продано: ' + details.count + ' шт., сумма: ' + (details.totalValue ?? '') + ' ⭐' : '';
      const userCreatedInfo = (details.username || details.first_name) ? (details.username ? '@' + details.username : '') + ' ' + (details.first_name || '') : '';
      const extra = referrerInfo || bulkInfo || userCreatedInfo || '';
      return '<div style="padding:3px 0;border-bottom:1px solid #1e2028;"><strong>' + actionText + '</strong>' + (caseInfo ? ' · ' + caseInfo : '') + (itemInfo ? ' · ' + itemInfo : '') + (amountInfo ? ' · ' + amountInfo : '') + (extra ? ' · ' + extra : '') + '<br><span style="opacity:0.5;font-size:11px;">' + moscowTime + ' ' + stageInfo + errInfo + '</span></div>';
    }).join('') : '<p>No logs</p>'}
      </div>
      <button class="admin-btn-small reject" id="adminDeleteUserBtn" style="margin-top:10px;">Delete user</button>
    `;

    container.querySelectorAll('[data-detail-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('[data-detail-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        ['Inventory', 'Deposits', 'Withdrawals', 'Logs'].forEach(name => {
          const el = document.getElementById('userDetail' + name);
          if (el) el.classList.toggle('hidden', tab.dataset.detailTab !== name.toLowerCase());
        });
      });
    });

    document.getElementById('adminToggleBanBtn')?.addEventListener('click', async () => {
      try {
        const url = user.is_banned ? `/api/admin/users/${userId}/unban` : `/api/admin/users/${userId}/ban`;
        const res2 = await fetch(url, {
          method: 'POST',
          headers: {
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          }
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось изменить бан');
          return;
        }
        showAlert('✅ Статус бана изменён');
        loadAdminUsers();
        loadAdminUserDetails(userId);
      } catch (err) {
        console.error('Ошибка toggle ban:', err);
      }
    });

    document.getElementById('adminGiveAdminBtn')?.addEventListener('click', async () => {
      try {
        const res2 = await fetch(`/api/admin/users/${userId}/set-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify({ isAdmin: !user.is_admin })
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось изменить права админа');
          return;
        }
        showAlert('✅ Права админа изменены');
        loadAdminUsers();
        loadAdminUserDetails(userId);
      } catch (err) {
        console.error('Ошибка set-admin:', err);
      }
    });

    document.getElementById('adminApplyBalanceDeltaBtn')?.addEventListener('click', async () => {
      const deltaInput = document.getElementById('adminBalanceDeltaInput');
      const delta = parseFloat(deltaInput.value);
      if (isNaN(delta) || !isFinite(delta)) {
        showAlert('Введите корректное изменение баланса');
        return;
      }
      try {
        const res2 = await fetch(`/api/admin/users/${userId}/adjust-balance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify({ delta })
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось изменить баланс');
          return;
        }
        showAlert('✅ Баланс изменён');
        loadAdminUsers();
        loadAdminUserDetails(userId);
      } catch (err) {
        console.error('Ошибка adjust-balance:', err);
      }
    });

    document.getElementById('adminSetZeroBalanceBtn')?.addEventListener('click', async () => {
      const current = user.balance || 0;
      if (!current) {
        showAlert('Баланс уже 0');
        return;
      }
      try {
        const res2 = await fetch(`/api/admin/users/${userId}/adjust-balance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          },
          body: JSON.stringify({ delta: -current })
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось изменить баланс');
          return;
        }
        showAlert('✅ Баланс обнулён');
        loadAdminUsers();
        loadAdminUserDetails(userId);
      } catch (err) {
        console.error('Ошибка set-zero-balance:', err);
      }
    });

    document.getElementById('adminDeleteUserBtn')?.addEventListener('click', async () => {
      const confirmed = confirm(`Вы уверены, что хотите удалить пользователя #${user.telegram_id}? Это действие нельзя отменить.`);
      if (!confirmed) return;
      try {
        const res2 = await fetch(`/api/admin/users/${userId}`, {
          method: 'DELETE',
          headers: {
            'X-Telegram-Init-Data': Telegram.WebApp.initData
          }
        });
        const d2 = await res2.json();
        if (!res2.ok || !d2.success) {
          showAlert(d2.error || 'Не удалось удалить пользователя', 'error');
          return;
        }
        showAlert('✅ Пользователь удалён', 'success');
        loadAdminUsers();
        container.innerHTML = '<p class="admin-muted">Select a user to see details.</p>';
      } catch (err) {
        console.error('Ошибка delete-user:', err);
        showAlert('Ошибка удаления пользователя', 'error');
      }
    });
  } catch (err) {
    console.error('Ошибка загрузки деталей пользователя админки:', err);
  }
}

function switchPromoType(type) {
  currentPromoType = type;
  document.querySelectorAll('.promo-type-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.promoType === type);
  });
  const caseFields = document.getElementById('promoFieldsCase');
  const depositFields = document.getElementById('promoFieldsDeposit');
  if (caseFields) caseFields.style.display = type === 'case' ? '' : 'none';
  if (depositFields) depositFields.style.display = type === 'deposit' ? '' : 'none';
}

async function loadAdminPromos() {
  try {
    const res = await fetch('/api/admin/promos', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin promos error:', data);
      return;
    }
    const list = document.getElementById('adminPromosList');
    if (!list) return;
    list.innerHTML = '';

    data.promos.forEach(p => {
      const isDeposit = p.deposit_percent != null && p.deposit_percent > 0;
      const badge = isDeposit
        ? '<span class="promo-badge badge-deposit">Пополнение</span>'
        : '<span class="promo-badge badge-case">Кейс</span>';
      let desc;
      if (isDeposit) {
        desc = `+${p.deposit_percent}% к пополнению`;
      } else {
        desc = `Кейс: ${p.case_id || 'case2'}`;
        if (p.min_deposit_last24h != null && p.min_deposit_last24h > 0) {
          desc += ` · мин ${p.min_deposit_last24h}⭐ за 24ч`;
        }
      }

      const row = document.createElement('div');
      row.className = 'admin-promo-row';
      row.innerHTML = `
        <div><strong>${p.code}</strong> ${badge}</div>
        <div class="admin-muted">${desc} &middot; Uses: ${p.activations_count}/${p.max_activations}</div>
        <div class="admin-row-actions">
          <button class="admin-btn-small reject" data-code="${p.code}">Delete</button>
        </div>
      `;
      row.querySelector('.admin-btn-small.reject')?.addEventListener('click', async () => {
        try {
          const res2 = await fetch(`/api/admin/promos/${encodeURIComponent(p.code)}`, {
            method: 'DELETE',
            headers: {
              'X-Telegram-Init-Data': Telegram.WebApp.initData
            }
          });
          const d2 = await res2.json();
          if (!res2.ok || !d2.success) {
            showAlert(d2.error || 'Не удалось удалить промокод');
            return;
          }
          showAlert('✅ Промокод удалён');
          loadAdminPromos();
        } catch (err) {
          console.error('Ошибка удаления промокода:', err);
        }
      });
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Ошибка загрузки промокодов админки:', err);
  }
}

async function loadAdminWithdrawals() {
  try {
    const res = await fetch('/api/admin/withdrawals?status=pending', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin withdrawals error:', data);
      return;
    }
    const list = document.getElementById('adminWithdrawalsList');
    if (!list) return;
    list.innerHTML = '';

    if (!data.withdrawals || data.withdrawals.length === 0) {
      list.innerHTML = '<p class="admin-muted">No pending withdrawals.</p>';
      return;
    }

    data.withdrawals.forEach(w => {
      let createdTime = w.created_at;
      try { createdTime = new Date(w.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }); } catch { }

      const row = document.createElement('div');
      row.className = 'admin-withdraw-row';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div><strong>#${w.id}</strong> ${w.item_name} (${w.item_value} ⭐)</div>
            <div class="admin-muted" style="margin-top:2px;">
              ${w.username
          ? `<a href="https://t.me/${w.username}" target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:underline;">@${w.username}</a>`
          : `<span style="opacity:0.6;">${w.first_name || 'ID:' + w.user_id}</span>`
        }
            </div>
            <div class="admin-muted" style="font-size:11px;">${createdTime}</div>
          </div>
          <div class="admin-row-actions" style="flex-shrink:0;margin-left:8px;">
            <button class="admin-btn-small approve">Approve</button>
            <button class="admin-btn-small reject">Reject</button>
          </div>
        </div>
      `;

      const approveBtn = row.querySelector('.admin-btn-small.approve');
      const rejectBtn = row.querySelector('.admin-btn-small.reject');
      approveBtn?.addEventListener('click', async () => {
        try {
          const res2 = await fetch(`/api/admin/withdrawals/${w.id}/approve`, {
            method: 'POST',
            headers: {
              'X-Telegram-Init-Data': Telegram.WebApp.initData
            }
          });
          const d2 = await res2.json();
          if (!res2.ok || !d2.success) {
            showAlert(d2.error || 'Не удалось подтвердить вывод');
            return;
          }
          showAlert('✅ Вывод подтверждён');
          loadAdminWithdrawals();
        } catch (err) {
          console.error('Ошибка approve withdraw:', err);
        }
      });
      rejectBtn?.addEventListener('click', async () => {
        try {
          const res2 = await fetch(`/api/admin/withdrawals/${w.id}/reject`, {
            method: 'POST',
            headers: {
              'X-Telegram-Init-Data': Telegram.WebApp.initData
            }
          });
          const d2 = await res2.json();
          if (!res2.ok || !d2.success) {
            showAlert(d2.error || 'Не удалось отклонить вывод');
            return;
          }
          showAlert('✅ Вывод отклонён, предмет возвращён в инвентарь');
          loadAdminWithdrawals();
        } catch (err) {
          console.error('Ошибка reject withdraw:', err);
        }
      });
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Ошибка загрузки выводов админки:', err);
  }
}

async function loadAdminBroadcastHistory() {
  try {
    const res = await fetch('/api/admin/broadcast-history?limit=50', {
      headers: { 'X-Telegram-Init-Data': Telegram.WebApp.initData }
    });
    const items = await res.json();
    const list = document.getElementById('adminBroadcastHistoryList');
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = '<p class="admin-muted">История рассылок пуста.</p>';
      return;
    }
    items.forEach(b => {
      const created = b.created_at ? (() => {
        try { return new Date(b.created_at + 'Z').toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }); } catch { return b.created_at; }
      })() : '';
      const text = (b.message_text || '').replace(/<[^>]+>/g, '').trim();
      const snippet = text.length > 80 ? text.slice(0, 80) + '…' : text;
      const buttons = b.buttons || [];
      const card = document.createElement('div');
      card.className = 'broadcast-history-card';
      card.innerHTML = `
        <div class="broadcast-history-head">
          <span class="broadcast-history-date">${created}</span>
          ${b.has_photo ? '<span class="broadcast-history-badge">Фото</span>' : ''}
          ${buttons.length ? `<span class="broadcast-history-badge">${buttons.length} кноп.</span>` : ''}
        </div>
        <div class="broadcast-history-preview">${(snippet || '(без текста)').replace(/</g, '&lt;')}</div>
        <div class="broadcast-history-stats">
          <span>Получили: <strong>${b.sent_count}</strong></span>
          <span>Ошибок: <strong>${b.failed_count}</strong></span>
          <span>Всего: <strong>${b.total_count}</strong></span>
        </div>
        <div class="broadcast-history-full hidden"></div>
      `;
      const fullDiv = card.querySelector('.broadcast-history-full');
      if (text.length > 80 || buttons.length > 0) {
        const fullContent = document.createElement('div');
        fullContent.innerHTML = `<div class="broadcast-history-text">${(b.message_text || '').replace(/</g, '&lt;').replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')}</div>` +
          (buttons.length ? `<div class="broadcast-history-btns">${buttons.map(btn => `<span class="broadcast-preview-link">${(btn.text || '').replace(/</g, '&lt;')}</span>`).join('')}</div>` : '');
        fullDiv.appendChild(fullContent);
        const previewEl = card.querySelector('.broadcast-history-preview');
        previewEl.style.cursor = 'pointer';
        previewEl.title = 'Нажмите, чтобы развернуть';
        previewEl.addEventListener('click', () => {
          fullDiv.classList.toggle('hidden');
        });
      }
      list.appendChild(card);
    });
  } catch (err) {
    console.error('Ошибка загрузки истории рассылок:', err);
    const list = document.getElementById('adminBroadcastHistoryList');
    if (list) list.innerHTML = '<p class="admin-muted">Ошибка загрузки.</p>';
  }
}

async function loadAdminLogs() {
  try {
    const res = await fetch('/api/admin/logs?limit=200', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin logs error:', data);
      return;
    }
    const list = document.getElementById('adminLogsList');
    if (!list) return;
    list.innerHTML = '';

    if (!data.logs || data.logs.length === 0) {
      list.innerHTML = '<p class="admin-muted">No logs yet.</p>';
      return;
    }

    data.logs.forEach(l => {
      const row = document.createElement('div');
      row.className = 'admin-log-row';

      let details = {};
      try {
        details = l.action_details ? JSON.parse(l.action_details) : {};
      } catch {
        details = { raw: l.action_details };
      }

      const username = l.username ? `@${l.username}` : (l.first_name || `ID ${l.user_id}`);

      let actionText = l.action_type;
      let actionColor = '#fff';
      if (l.action_type === 'case_open_success' || l.action_type === 'case_open') {
        actionText = 'Открытие кейса';
        actionColor = '#a78bfa';
      } else if (l.action_type === 'error') {
        actionText = 'Ошибка';
        actionColor = '#ef4444';
      } else if (l.action_type === 'deposit') {
        actionText = 'Пополнение';
        actionColor = '#22c55e';
      } else if (l.action_type === 'user_created') {
        actionText = 'Новый пользователь';
        actionColor = '#3b82f6';
      } else if (l.action_type === 'referral_linked') {
        actionText = 'Реферал привязан';
        actionColor = '#8b5cf6';
      } else if (l.action_type === 'item_sold') {
        actionText = 'Продажа предмета';
        actionColor = '#f59e0b';
      } else if (l.action_type === 'item_sold_bulk') {
        actionText = 'Массовая продажа';
        actionColor = '#f59e0b';
      }

      const caseInfo = details.caseName || details.case_id || '';
      const itemInfo = details.itemName
        ? `${details.itemName}${details.itemValue ? ` (${details.itemValue} ⭐)` : ''}`
        : (details.item_name ? `${details.item_name}${details.item_value != null ? ` (${details.item_value} ⭐)` : ''}` : (details.item || ''));
      const amountInfo = details.amount ? `+${details.amount} ⭐` : '';
      const methodInfo = details.method ? `(${details.method})` : '';
      const referrerInfo = details.referrer_id ? `Реферер ID: ${details.referrer_id}. ` : '';
      const bulkInfo = details.count != null ? `Продано: ${details.count} шт., сумма: ${details.totalValue ?? ''} ⭐. ` : '';
      const userCreatedInfo = (details.username || details.first_name) ? `@${details.username || ''} ${details.first_name || ''}. ` : '';

      let moscowTime = l.created_at;
      try {
        const d = new Date(l.created_at + 'Z');
        moscowTime = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      } catch { }

      const stageInfo = details.stage ? `Этап: ${details.stage}. ` : '';

      row.innerHTML = `
        <div><strong>${username}</strong> — <span style="color:${actionColor}">${actionText}</span></div>
        <div class="admin-muted">${moscowTime}</div>
        <div class="admin-muted">
          ${caseInfo ? `Кейс: ${caseInfo}. ` : ''}
          ${itemInfo ? `Предмет: ${itemInfo}. ` : ''}
          ${amountInfo ? `Сумма: ${amountInfo} ${methodInfo}. ` : ''}
          ${referrerInfo}
          ${bulkInfo}
          ${userCreatedInfo}
          ${stageInfo}
          ${details.error ? `Ошибка: ${details.error}` : (details.raw || '')}
        </div>
      `;
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Ошибка загрузки логов админки:', err);
  }
}

async function loadAdminErrors() {
  try {
    const res = await fetch('/api/admin/logs?limit=200&type=error', {
      headers: {
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Admin errors logs error:', data);
      return;
    }
    const list = document.getElementById('adminErrorsList');
    if (!list) return;
    list.innerHTML = '';

    if (!data.logs || data.logs.length === 0) {
      list.innerHTML = '<p class="admin-muted">No errors yet.</p>';
      return;
    }

    data.logs.forEach(l => {
      const row = document.createElement('div');
      row.className = 'admin-log-row';

      let details = {};
      try {
        details = l.action_details ? JSON.parse(l.action_details) : {};
      } catch {
        details = { raw: l.action_details };
      }

      const username = l.username ? `@${l.username}` : (l.first_name || `ID ${l.user_id}`);

      let moscowTime = l.created_at;
      try {
        const d = new Date(l.created_at + 'Z');
        moscowTime = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      } catch { }

      const stageInfo = details.stage ? `Этап: ${details.stage}. ` : '';

      row.innerHTML = `
        <div><strong>${username}</strong> — Ошибка</div>
        <div class="admin-muted">${moscowTime}</div>
        <div class="admin-muted">
          ${stageInfo}
          ${details.error ? `Ошибка: ${details.error}` : (details.raw || '')}
        </div>
      `;
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Ошибка загрузки error-логов админки:', err);
  }
}

let fakeOnline = 1324;
let liveDropInterval = null;
let onlineInterval = null;
const MAX_LIVE_ITEMS = 30;

function formatOnline(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function updateFakeOnline() {
  const el = document.getElementById('onlineCount');
  if (!el) return;

  const change = Math.floor(Math.random() * 25) - 10;
  fakeOnline = Math.max(900, Math.min(2200, fakeOnline + change));
  el.textContent = formatOnline(fakeOnline);
}

function getRandomCaseItem() {
  if (!casesData || Object.keys(casesData).length === 0) return null;

  const allItems = [];
  Object.values(casesData).forEach(c => {
    if (c && c.items) {
      c.items.forEach(item => {
        if (item.image) allItems.push(item);
      });
    }
  });

  if (allItems.length === 0) return null;

  // в ленте LIVE чаще показываем подарки с настоящими иконками
  const realItems = allItems.filter(i => /\.png$/.test(i.image));
  const srcItems = realItems.length && Math.random() < 0.85 ? realItems : allItems;
  const expensiveItems = srcItems.filter(i => (i.value || 0) >= 300);
  const cheapItems = srcItems.filter(i => (i.value || 0) < 300 && (i.value || 0) > 0);

  if (expensiveItems.length > 0 && Math.random() < 0.8) {
    return expensiveItems[Math.floor(Math.random() * expensiveItems.length)];
  }

  const pool = srcItems;
  return pool[Math.floor(Math.random() * pool.length)];
}

function createLiveDropElement(item) {
  const div = document.createElement('div');
  const rarity = item.rarity || 'common';
  div.className = `live-drop-item rarity-${rarity}`;

  const isTGS = item.image && item.image.endsWith('.tgs');
  const imgHtml = isTGS
    ? `<tgs-player class="live-drop-item-img" mode="normal" src="${item.image}" background="transparent" style="width:50px;height:50px;"></tgs-player>`
    : `<img class="live-drop-item-img" src="${item.image}" alt="${item.name}" onerror="this.style.display='none'">`;

  div.innerHTML = imgHtml;

  return div;
}

function addLiveDrop() {
  const track = document.getElementById('liveDropTrack');
  if (!track) return;

  const item = getRandomCaseItem();
  if (!item) return;

  const el = createLiveDropElement(item);

  track.insertBefore(el, track.firstChild);

  while (track.children.length > MAX_LIVE_ITEMS) {
    track.removeChild(track.lastChild);
  }
}

function syncLiveDropVisibility() {
  const categories = document.getElementById('casesCategories');
  const feed = document.getElementById('liveDropFeed');
  const starsBanner = document.getElementById('starsBanner');
  if (!categories || !feed) return;

  const observer = new MutationObserver(() => {
    const isHidden = categories.style.display === 'none';
    feed.style.display = isHidden ? 'none' : '';
    if (starsBanner) starsBanner.style.display = isHidden ? 'none' : '';
  });
  observer.observe(categories, { attributes: true, attributeFilter: ['style'] });
}

function initLiveDropFeed() {
  for (let i = 0; i < 15; i++) {
    addLiveDrop();
  }

  function scheduleNextDrop() {
    const delay = 1000 + Math.random() * 2000;
    liveDropInterval = setTimeout(() => {
      addLiveDrop();
      scheduleNextDrop();
    }, delay);
  }
  scheduleNextDrop();

  syncLiveDropVisibility();

  // Stars banner click — open in Telegram
  const starsBanner = document.getElementById('starsBanner');
  if (starsBanner) {
    starsBanner.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
        Telegram.WebApp.openTelegramLink('https://t.me/PremiumBot');
      } else {
        window.open('https://t.me/PremiumBot', '_blank');
      }
    });
  }
}

function addRealDrop(itemName, itemImage, itemRarity) {
  const track = document.getElementById('liveDropTrack');
  if (!track) return;

  const item = { name: itemName, image: itemImage, rarity: itemRarity || 'common' };
  const el = createLiveDropElement(item);
  el.style.borderColor = '#ffd700';
  el.style.boxShadow = '0 0 8px rgba(255, 215, 0, 0.3)';

  track.insertBefore(el, track.firstChild);

  while (track.children.length > MAX_LIVE_ITEMS) {
    track.removeChild(track.lastChild);
  }
}

let _dailyCaseStatus = null;
let _dailyCaseShareCooldown = false;

function showDailyCaseModal(status) {
  _dailyCaseStatus = status;
  const modal = document.getElementById('dailyCaseModal');
  if (!modal) return;

  const shareTask = document.getElementById('dailyCaseShareTask');
  const channelTask = document.getElementById('dailyCaseChannelTask');
  const shareSubtitle = document.getElementById('dailyCaseShareSubtitle');
  const channelSubtitle = document.getElementById('dailyCaseChannelSubtitle');

  shareTask.style.display = 'flex';
  if (status.sharesDone) {
    shareTask.classList.add('done');
    shareSubtitle.textContent = 'Выполнено';
  } else {
    shareTask.classList.remove('done');
    shareSubtitle.textContent = 'Поделись сообщением в 3 личных чатах';
  }

  if (status.subscribed) {
    channelTask.classList.add('done');
    channelSubtitle.textContent = 'Подписка подтверждена';
  } else {
    channelTask.classList.remove('done');
    channelSubtitle.textContent = 'И вернись сюда';
  }

  modal.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  });
}

function closeDailyCaseModal() {
  const modal = document.getElementById('dailyCaseModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 400);
}

async function handleDailyCaseShare() {
  if (!_dailyCaseStatus) return;
  if (_dailyCaseStatus.sharesDone) return;
  if (_dailyCaseShareCooldown) {
    showAlert('Подождите пару секунд...');
    return;
  }

  _dailyCaseShareCooldown = true;
  setTimeout(() => { _dailyCaseShareCooldown = false; }, 1500);

  try {
    const prepResp = await fetch('/api/daily-case/prepare-share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });

    if (!prepResp.ok) {
      const errData = await prepResp.json().catch(() => ({}));
      console.error('Prepare share error:', errData);
      showAlert(`⚠️ ${errData.error || 'Ошибка подготовки сообщения'}`);
      _dailyCaseShareCooldown = false;
      return;
    }

    const { msgId } = await prepResp.json();

    if (typeof Telegram?.WebApp?.shareMessage === 'function') {
      Telegram.WebApp.shareMessage(msgId, async (sent) => {
        if (sent !== false) {
          await _recordShareAndUpdateUI();
        }
        _dailyCaseShareCooldown = false;
      });
    } else {
      showAlert('⚠️ Обновите Telegram для использования этой функции');
      _dailyCaseShareCooldown = false;
    }
  } catch (err) {
    console.error('Share error:', err);
    showAlert('⚠️ Ошибка отправки');
    _dailyCaseShareCooldown = false;
  }
}

async function _recordShareAndUpdateUI() {
  try {
    const resp = await fetch('/api/daily-case/record-share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (_dailyCaseStatus) {
        _dailyCaseStatus.shareCount = data.shareCount;
        _dailyCaseStatus.sharesDone = data.sharesDone;

        const shareTask = document.getElementById('dailyCaseShareTask');
        const shareSubtitle = document.getElementById('dailyCaseShareSubtitle');
        if (_dailyCaseStatus.sharesDone) {
          shareTask?.classList.add('done');
          if (shareSubtitle) shareSubtitle.textContent = 'Выполнено';
        } else {
          if (shareSubtitle) shareSubtitle.textContent = 'Поделись сообщением в 3 личных чатах';
        }
      }
    }
  } catch (err) {
    console.error('Record share error:', err);
  }
}

function handleDailyCaseChannel() {
  const channelUsername = _dailyCaseStatus?.channelUsername;
  if (!channelUsername) {
    showAlert('Канал не настроен');
    return;
  }

  const cleanUsername = channelUsername.replace(/^@/, '');
  const channelUrl = `https://t.me/${cleanUsername}`;
  // переход в канал засчитывается как подписка (режим SUB_CHECK=click)
  fetch('/api/daily-case/channel-click', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': Telegram.WebApp.initData } }).catch(() => { });

  try {
    Telegram.WebApp.openTelegramLink(channelUrl);
  } catch (e) {
    window.open(channelUrl, '_blank');
  }
}

async function verifyDailyCaseTasks() {
  const btn = document.querySelector('.daily-case-verify-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Проверяем...';

  try {
    const resp = await fetch('/api/daily-case/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': Telegram.WebApp.initData
      }
    });

    const data = await resp.json();

    if (data.success) {
      closeDailyCaseModal();
      startAnimation();
    } else {
      _dailyCaseStatus.subscribed = data.subscribed;
      _dailyCaseStatus.sharesDone = data.sharesDone;
      _dailyCaseStatus.shareCount = data.shareCount;

      const channelTask = document.getElementById('dailyCaseChannelTask');
      const channelSubtitle = document.getElementById('dailyCaseChannelSubtitle');
      const shareTask = document.getElementById('dailyCaseShareTask');
      const shareSubtitle = document.getElementById('dailyCaseShareSubtitle');

      if (data.subscribed) {
        channelTask.classList.add('done');
        channelSubtitle.textContent = 'Подписка подтверждена';
      } else {
        channelTask.classList.remove('done');
        channelSubtitle.textContent = 'И вернись сюда';
      }

      if (data.sharesDone) {
        shareTask.classList.add('done');
        shareSubtitle.textContent = 'Выполнено';
      } else {
        shareTask.classList.remove('done');
        shareSubtitle.textContent = 'Поделись сообщением в 3 личных чатах';
      }

      const errors = [];
      if (!data.subscribed) errors.push('Подписаться на канал');
      if (!data.sharesDone) errors.push('Отправить сообщение 3 друзьям');
      if (errors.length > 0) {
        showAlert(`❌ Необходимо: ${errors.join(', ')}`);
      }
    }
  } catch (err) {
    console.error('Daily case verify error:', err);
    showAlert('⚠️ Ошибка проверки');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Проверить';
  }
}

document.getElementById('dailyCaseModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeDailyCaseModal();
  }
});

window.openCase = openCase;
window.sellPrize = sellPrize;
window.keepPrize = keepPrize;
window.closeWinModal = closeWinModal;
window.openStarsModal = openStarsModal;
window.closeStarsModal = closeStarsModal;
window.handleStarsTopUp = handleStarsTopUp;
window.sellFromInventory = sellFromInventory;
window.showFriendsSection = showFriendsSection;
window.copyRefLink = copyRefLink;
window.showAlert = showAlert;
window.showToast = showToast;
window.addRealDrop = addRealDrop;
window.closeDailyCaseModal = closeDailyCaseModal;
window.handleDailyCaseShare = handleDailyCaseShare;
window.handleDailyCaseChannel = handleDailyCaseChannel;
window.verifyDailyCaseTasks = verifyDailyCaseTasks;

window.testToast = function () {
  showToast('Простое уведомление без заголовка', 'info');
  setTimeout(() => showToast('Детальное уведомление с заголовком', 'success', { title: 'Успех!' }), 500);
  setTimeout(() => showToast('Предмет "Тестовый предмет" продан за 100 ⭐. Средства зачислены на баланс', 'success', { title: 'Продажа предмета' }), 1000);
  setTimeout(() => showToast('Что-то пошло не так', 'error', { title: 'Ошибка' }), 1500);
  setTimeout(() => showToast('Внимание! Это предупреждение', 'warning', { title: 'Предупреждение' }), 2000);
};

// Апгрейд — в js/upgrade.js
