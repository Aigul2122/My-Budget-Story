/* My Budget Story — общий слой данных, версия 2.
   Хранит счета, операции и категории в localStorage.
   ВАЖНО: для корректной совместной работы всех страниц открывайте приложение
   через локальный сервер (см. serve.py), а не как file://. */

(function (global) {
  const STORAGE_KEY = 'mbs_data_v2';
  const CURRENCIES = ['KZT', 'USD', 'EUR'];

  const ACCOUNT_TYPES = {
    bank:    { label: 'Банковский счёт', countsInAvailable: true },
    card:    { label: 'Карта',           countsInAvailable: true },
    wallet:  { label: 'Кошелёк',         countsInAvailable: true },
    safe:    { label: 'Сейф',            countsInAvailable: true },
    deposit: { label: 'Депозит',         countsInAvailable: false }
  };

  const OBJECT_PRESETS = ['Квартира', 'Офис', 'Парковочное место', 'Автомобиль'];

  const REASON_TEXT = {
    currency_mismatch: 'Перевод возможен только между счетами в одной валюте. Обмен валют будет отдельной операцией.',
    same_account: 'Выберите два разных счёта для перевода.',
    in_use: 'Нельзя удалить — есть операции, которые на это ссылаются. Можно заархивировать.',
    not_found: 'Запись не найдена.',
    invalid_amount: 'Сумма должна быть больше нуля.',
    invalid_name: 'Введите название.'
  };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  const CATEGORY_SUBCATEGORIES = {
    income: {
      'Аренда': ['Кыз Жибек 19', 'Астана Нурсая', 'Парковочные места'],
      'Депозиты': ['Депозит Kaspi Bank', 'Депозит Halyk Bank'],
      'Пенсия': ['Пенсия'],
      'Продажа имущества': [],
      'Подарки': [],
      'Прочие источники': []
    },
    expense: {
      'Жильё и недвижимость': [
        'Электричество и вода (Зелёные холмы)', 'Газ (Зелёные холмы)',
        'Электричество и вода (Панфилова 92)', 'Газ (Панфилова 92)',
        'Ремонт — услуги', 'Ремонт — стройматериалы',
        'Налог на имущество', 'Интернет', 'Сигнализация'
      ],
      'Дом и быт': ['Домработница', 'Садовник', 'Полив', 'Бытовая химия', 'Товары для дома', 'Техника', 'Мебель'],
      'Транспорт': ['Обслуживание', 'Бензин', 'Мойка', 'Парковка', 'Страховка', 'Налог', 'Штрафы', 'Такси'],
      'Питание': ['Продукты', 'Рестораны'],
      'Здоровье': ['Врачи', 'Анализы', 'Лекарства'],
      'Личные расходы': ['Связь', 'Салон', 'Косметолог', 'Одежда', 'Обувь', 'Образование'],
      'Приложения': ['GPT', 'Gemini', 'Claude', 'Youtube', 'Apple Music', 'Canva', 'CapCut'],
      'Семья': ['Дети', 'Внуки', 'Подарки', 'Родственники'],
      'Гольф': ['Green fee', 'Багги', 'Кедди'],
      'Отдых и развлечения': ['Билеты', 'Отели', 'Экскурсии', 'Мероприятия'],
      'Долг': [],
      'Прочее': ['Прочее'],
      'Непредвиденные расходы': []
    }
  };

  function defaultCategories() {
    const cats = [];
    Object.entries(CATEGORY_SUBCATEGORIES).forEach(([type, groups]) => {
      Object.entries(groups).forEach(([name, subcategories]) => {
        cats.push({ id: uid('cat'), name, type, subcategories: subcategories.slice(), archived: false });
      });
    });
    return cats;
  }

  // Дополняет уже существующие категории подкатегориями из CATEGORY_SUBCATEGORIES
  // и добавляет категории, которых ещё нет — не трогая архивные/переименованные
  // категории и не удаляя ничего, что пользователь уже завёл сам.
  function applyCategorySubcategories(data) {
    if (data.categorySubcategoriesVersion === 1) return false;
    Object.entries(CATEGORY_SUBCATEGORIES).forEach(([type, groups]) => {
      Object.entries(groups).forEach(([name, subcategories]) => {
        const existing = data.categories.find(c => c.type === type && c.name === name);
        if (existing) {
          const have = Array.isArray(existing.subcategories) ? existing.subcategories : [];
          existing.subcategories = have.concat(subcategories.filter(s => !have.includes(s)));
        } else {
          data.categories.push({ id: uid('cat'), name, type, subcategories: subcategories.slice(), archived: false });
        }
      });
    });
    data.categories.forEach(c => {
      if (!Array.isArray(c.subcategories)) c.subcategories = [];
    });
    data.categorySubcategoriesVersion = 1;
    saveData(data);
    return true;
  }

  function defaultData() {
    return { accounts: [], transactions: [], categories: defaultCategories(), properties: [] };
  }

  function loadData() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.accounts)) parsed.accounts = [];
      if (!Array.isArray(parsed.transactions)) parsed.transactions = [];
      if (!Array.isArray(parsed.categories) || !parsed.categories.length) parsed.categories = defaultCategories();
      if (!Array.isArray(parsed.properties)) parsed.properties = [];
      parsed.accounts.forEach(a => { if (a.scope !== 'family') a.scope = 'personal'; });
      applyCategorySubcategories(parsed);
      return parsed;
    } catch (e) {
      console.error('MBS: не удалось прочитать localStorage', e);
      return defaultData();
    }
  }

  function saveData(data) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('MBS: не удалось сохранить в localStorage', e);
    }
  }

  // ---------- ACCOUNTS ----------

  function addAccount(data, { name, type, currency, initialBalance, scope }) {
    data.accounts.push({
      id: uid('acc'),
      name: (name || '').trim(),
      type,
      currency: CURRENCIES.includes(currency) ? currency : 'KZT',
      initialBalance: Number(initialBalance) || 0,
      scope: scope === 'family' ? 'family' : 'personal',
      archived: false,
      createdAt: new Date().toISOString()
    });
    saveData(data);
    return { ok: true };
  }

  function updateAccount(data, id, patch) {
    const acc = data.accounts.find(a => a.id === id);
    if (!acc) return { ok: false, reason: 'not_found' };
    Object.assign(acc, patch, { initialBalance: Number(patch.initialBalance ?? acc.initialBalance) || 0 });
    saveData(data);
    return { ok: true };
  }

  function setAccountArchived(data, id, archived) {
    const acc = data.accounts.find(a => a.id === id);
    if (!acc) return { ok: false, reason: 'not_found' };
    acc.archived = !!archived;
    saveData(data);
    return { ok: true };
  }

  function accountHasTransactions(data, id) {
    return data.transactions.some(t => t.accountId === id || t.fromAccountId === id || t.toAccountId === id);
  }

  function deleteAccount(data, id) {
    if (accountHasTransactions(data, id)) return { ok: false, reason: 'in_use' };
    data.accounts = data.accounts.filter(a => a.id !== id);
    saveData(data);
    return { ok: true };
  }

  // ---------- PROPERTIES (недвижимость и другое имущество) ----------

  function addProperty(data, { name, value, currency, note }) {
    if (!name || !name.trim()) return { ok: false, reason: 'invalid_name' };
    data.properties.push({
      id: uid('prop'),
      name: name.trim(),
      value: Number(value) || 0,
      currency: CURRENCIES.includes(currency) ? currency : 'KZT',
      note: (note || '').trim(),
      scope: 'family',
      archived: false,
      createdAt: new Date().toISOString()
    });
    saveData(data);
    return { ok: true };
  }

  function updateProperty(data, id, patch) {
    const p = data.properties.find(p => p.id === id);
    if (!p) return { ok: false, reason: 'not_found' };
    Object.assign(p, patch, { value: Number(patch.value ?? p.value) || 0 });
    saveData(data);
    return { ok: true };
  }

  function setPropertyArchived(data, id, archived) {
    const p = data.properties.find(p => p.id === id);
    if (!p) return { ok: false, reason: 'not_found' };
    p.archived = !!archived;
    saveData(data);
    return { ok: true };
  }

  function deleteProperty(data, id) {
    data.properties = data.properties.filter(p => p.id !== id);
    saveData(data);
    return { ok: true };
  }

  // ---------- CATEGORIES ----------

  function addCategory(data, { name, type }) {
    if (!name || !name.trim()) return { ok: false, reason: 'invalid_name' };
    data.categories.push({ id: uid('cat'), name: name.trim(), type, subcategories: [], archived: false });
    saveData(data);
    return { ok: true };
  }

  function renameCategory(data, id, name) {
    const cat = data.categories.find(c => c.id === id);
    if (!cat) return { ok: false, reason: 'not_found' };
    cat.name = (name || '').trim() || cat.name;
    saveData(data);
    return { ok: true };
  }

  function setCategoryArchived(data, id, archived) {
    const cat = data.categories.find(c => c.id === id);
    if (!cat) return { ok: false, reason: 'not_found' };
    cat.archived = !!archived;
    saveData(data);
    return { ok: true };
  }

  function categoryInUse(data, id) {
    return data.transactions.some(t => t.categoryId === id);
  }

  function deleteCategory(data, id) {
    if (categoryInUse(data, id)) return { ok: false, reason: 'in_use' };
    data.categories = data.categories.filter(c => c.id !== id);
    saveData(data);
    return { ok: true };
  }

  // ---------- TRANSACTIONS ----------

  function canTransfer(data, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return { ok: false, reason: 'same_account' };
    const from = data.accounts.find(a => a.id === fromId);
    const to = data.accounts.find(a => a.id === toId);
    if (!from || !to) return { ok: false, reason: 'not_found' };
    if (from.currency !== to.currency) return { ok: false, reason: 'currency_mismatch' };
    return { ok: true };
  }

  function addTransaction(data, tx) {
    const amount = Number(tx.amount);
    if (!amount || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    if (tx.type === 'transfer') {
      const check = canTransfer(data, tx.fromAccountId, tx.toAccountId);
      if (!check.ok) return check;
    }
    data.transactions.push(Object.assign({ id: uid('tx'), createdAt: new Date().toISOString() }, tx, { amount }));
    saveData(data);
    return { ok: true };
  }

  function updateTransaction(data, id, patch) {
    const tx = data.transactions.find(t => t.id === id);
    if (!tx) return { ok: false, reason: 'not_found' };
    const merged = Object.assign({}, tx, patch);
    const amount = Number(merged.amount);
    if (!amount || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    if (merged.type === 'transfer') {
      const check = canTransfer(data, merged.fromAccountId, merged.toAccountId);
      if (!check.ok) return check;
    }
    Object.assign(tx, patch, { amount });
    saveData(data);
    return { ok: true };
  }

  function deleteTransaction(data, id) {
    data.transactions = data.transactions.filter(t => t.id !== id);
    saveData(data);
    return { ok: true };
  }

  // ---------- CALCULATIONS ----------

  function computeAccountBalance(data, accountId) {
    const acc = data.accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    let balance = Number(acc.initialBalance) || 0;
    data.transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income' && t.accountId === accountId) balance += amt;
      if (t.type === 'expense' && t.accountId === accountId) balance -= amt;
      if (t.type === 'transfer') {
        if (t.fromAccountId === accountId) balance -= amt;
        if (t.toAccountId === accountId) balance += amt;
      }
    });
    return balance;
  }

  // Итоги считаются ОТДЕЛЬНО по каждой валюте — деньги в разных валютах никогда не складываются.
  // Архивные счета с ненулевым остатком по-прежнему учитываются в капитале.
  function computeTotalsByCurrency(data) {
    const available = {}, deposits = {}, total = {};
    CURRENCIES.forEach(c => { available[c] = 0; deposits[c] = 0; total[c] = 0; });
    data.accounts.forEach(a => {
      const bal = computeAccountBalance(data, a.id);
      if (a.archived && bal === 0) return; // архивный пустой счёт не засоряет итоги
      const cfg = ACCOUNT_TYPES[a.type] || {};
      const cur = CURRENCIES.includes(a.currency) ? a.currency : 'KZT';
      if (cfg.countsInAvailable) available[cur] += bal; else deposits[cur] += bal;
      total[cur] += bal;
    });
    return { available, deposits, total };
  }

  // Валюты, в которых есть хотя бы один счёт (даже с нулевым остатком) —
  // такие валюты нужно показывать в итогах, а не только валюты с ненулевой суммой.
  function existingCurrencies(data) {
    const set = CURRENCIES.filter(c => data.accounts.some(a => a.currency === c));
    return set.length ? set : ['KZT'];
  }

  function monthKey(dateStr) {
    return (dateStr || '').slice(0, 7); // YYYY-MM
  }

  function currentMonthKey() {
    return monthKey(new Date().toISOString());
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  const MONTH_NAMES_RU = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    const name = MONTH_NAMES_RU[m - 1] || '';
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
  }

  // Доход/расход за месяц — тоже по валютам (переводы не входят никогда)
  function computeMonthSummaryByCurrency(data, yearMonth) {
    const ym = yearMonth || currentMonthKey();
    const income = {}, expense = {};
    CURRENCIES.forEach(c => { income[c] = 0; expense[c] = 0; });
    data.transactions.forEach(t => {
      if (monthKey(t.date) !== ym) return;
      if (t.type !== 'income' && t.type !== 'expense') return;
      const acc = data.accounts.find(a => a.id === t.accountId);
      const cur = acc ? acc.currency : 'KZT';
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') income[cur] += amt;
      if (t.type === 'expense') expense[cur] += amt;
    });
    return { income, expense };
  }

  function formatMoney(n, currency) {
    const rounded = Math.round(Number(n) || 0);
    const str = rounded.toLocaleString('ru-RU');
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₸';
    return `${str} ${symbol}`;
  }

  // Возвращает массив строк вида "1 234 567 ₸" — по одной строке на каждую валюту
  // из переданного списка (обычно existingCurrencies), даже если сумма равна нулю.
  // Без явного списка — старое поведение (только ненулевые валюты, минимум одна строка).
  function formatByCurrency(obj, currencies) {
    if (currencies && currencies.length) {
      return currencies.map(c => formatMoney(obj[c] || 0, c));
    }
    const parts = CURRENCIES.filter(c => obj[c]).map(c => formatMoney(obj[c], c));
    return parts.length ? parts : [formatMoney(0, 'KZT')];
  }

  // ---------- BACKUP ----------

  function exportJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) {
      throw new Error('Файл не похож на резервную копию My Budget Story');
    }
    if (!Array.isArray(parsed.categories) || !parsed.categories.length) parsed.categories = defaultCategories();
    if (!Array.isArray(parsed.properties)) parsed.properties = [];
    return parsed;
  }

  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportTransactionsCSV(data) {
    const accName = id => { const a = data.accounts.find(a => a.id === id); return a ? a.name : ''; };
    const catName = id => { const c = data.categories.find(c => c.id === id); return c ? c.name : ''; };
    const header = ['Дата','Тип','Сумма','Валюта','Счёт','Со счёта','На счёт','Категория','Подкатегория','Получатель/источник','Объект','Комментарий'];
    const rows = data.transactions.map(t => {
      const acc = data.accounts.find(a => a.id === t.accountId);
      const fromAcc = data.accounts.find(a => a.id === t.fromAccountId);
      return [
        t.date || '',
        t.type === 'income' ? 'Доход' : t.type === 'expense' ? 'Расход' : 'Перевод',
        t.amount || 0,
        acc ? acc.currency : (fromAcc ? fromAcc.currency : ''),
        t.type !== 'transfer' ? accName(t.accountId) : '',
        t.type === 'transfer' ? accName(t.fromAccountId) : '',
        t.type === 'transfer' ? accName(t.toAccountId) : '',
        t.type !== 'transfer' ? catName(t.categoryId) : '',
        t.subcategory || '',
        t.counterparty || '',
        t.objectName || '',
        t.comment || ''
      ].map(csvEscape).join(';');
    });
    return '\uFEFF' + [header.map(csvEscape).join(';')].concat(rows).join('\n');
  }

  global.MBS = {
    STORAGE_KEY, CURRENCIES, ACCOUNT_TYPES, OBJECT_PRESETS, REASON_TEXT,
    uid, loadData, saveData, defaultData, defaultCategories, applyCategorySubcategories,
    addAccount, updateAccount, setAccountArchived, deleteAccount, accountHasTransactions,
    addProperty, updateProperty, setPropertyArchived, deleteProperty,
    addCategory, renameCategory, setCategoryArchived, deleteCategory, categoryInUse,
    canTransfer, addTransaction, updateTransaction, deleteTransaction,
    computeAccountBalance, computeTotalsByCurrency, computeMonthSummaryByCurrency, existingCurrencies,
    monthKey, currentMonthKey, shiftMonth, monthLabel,
    formatMoney, formatByCurrency,
    exportJSON, importJSON, exportTransactionsCSV
  };
})(window);
