"use strict";

/*
  FinTracker
  ----------

  Основная логика приложения.

  Архитектура категорий:

  categories
    ├── parent_id = null      → основная категория
    └── parent_id = UUID      → подкатегория

  transactions.category_id
    → ВСЕГДА основная категория.

  transaction_items.category_id
    → подкатегория конкретной позиции либо NULL.

  Пример:

  500 ₽ → Магнит → Продукты
    ├── Рис — 100 ₽ → Крупы
    └── Мороженое Максибон — 400 ₽ → Мороженое

  При этом:

  transaction.category_id = Продукты

  Наличие transaction_items никогда не обнуляет
  category_id самой транзакции.
*/


/* =========================================================
   SUPABASE
========================================================= */

const { createClient } = window.supabase;

const supabaseClient = createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);


/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,

  initialized: false,
  enteringApp: false,

  currentPage: "dashboard",

  selectedMonth: getMonthKey(new Date()),

  transactions: [],
  categories: [],
  merchants: [],
  budgets: [],

  transactionType: "expense",
  editingTransaction: null,

  analyticsPeriod: "month",
  analyticsTransactions: [],

  loading: false,
  saving: false
};


/* =========================================================
   CONSTANTS
========================================================= */

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

const ICONS = {
  expense: "−",
  income: "+"
};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = selector => document.querySelector(selector);

const $$ = selector => [
  ...document.querySelectorAll(selector)
];


function setText(selector, value) {
  const element = $(selector);

  if (element) {
    element.textContent = value ?? "";
  }
}


function setValue(selector, value) {
  const element = $(selector);

  if (element) {
    element.value = value ?? "";
  }
}


/* =========================================================
   INIT
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);


async function init() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;

  setupEvents();
  setMonthUI();

  try {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error(error);
      showAuth();
    } else if (session?.user) {
      await enterApp(session.user);
    } else {
      showAuth();
    }
  } catch (error) {
    console.error(error);
    showAuth();
  }

  supabaseClient.auth.onAuthStateChange(
    async (event, session) => {

      if (
        event === "SIGNED_IN" &&
        session?.user
      ) {
        await enterApp(session.user);
      }

      if (event === "SIGNED_OUT") {
        resetState();
        showAuth();
      }
    }
  );
}


/* =========================================================
   AUTH UI
========================================================= */

function showAuth() {
  const auth = $("#auth-screen");
  const main = $("#main-screen");

  auth?.classList.remove("hidden");
  main?.classList.add("hidden");
}


function showMain() {
  const auth = $("#auth-screen");
  const main = $("#main-screen");

  auth?.classList.add("hidden");
  main?.classList.remove("hidden");
}


async function enterApp(user) {
  if (!user) {
    return;
  }

  if (
    state.enteringApp &&
    state.user?.id === user.id
  ) {
    return;
  }

  state.enteringApp = true;

  try {
    state.user = user;

    showMain();

    setText(
      "#user-email",
      user.email || ""
    );

    await ensureUserProfile();
    await loadReferenceData();
    await loadMonthData();

    renderEverything();
  } catch (error) {
    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  } finally {
    state.enteringApp = false;
  }
}


function resetState() {
  state.user = null;

  state.transactions = [];
  state.categories = [];
  state.merchants = [];
  state.budgets = [];
  state.analyticsTransactions = [];

  state.editingTransaction = null;
  state.transactionType = "expense";
  state.currentPage = "dashboard";

  closeAllModals();
}


/* =========================================================
   PROFILE
========================================================= */

async function ensureUserProfile() {
  if (!state.user?.id) {
    return;
  }

  const {
    error
  } = await supabaseClient
    .from("profiles")
    .upsert(
      {
        id: state.user.id,
        email: state.user.email
      },
      {
        onConflict: "id"
      }
    );

  if (error) {
    console.warn(
      "Profile upsert:",
      error.message
    );
  }
}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  /* -----------------------------------------
     AUTH
  ----------------------------------------- */

  $$(".auth-tab").forEach(button => {
    button.addEventListener(
      "click",
      () => {

        const tab =
          button.dataset.authTab;

        $$(".auth-tab").forEach(item => {
          item.classList.remove("active");
        });

        button.classList.add("active");

        $("#login-form")?.classList.toggle(
          "hidden",
          tab !== "login"
        );

        $("#register-form")?.classList.toggle(
          "hidden",
          tab !== "register"
        );

        setAuthMessage("");
      }
    );
  });


  $("#login-form")?.addEventListener(
    "submit",
    login
  );


  $("#register-form")?.addEventListener(
    "submit",
    register
  );


  $("#forgot-password")?.addEventListener(
    "click",
    resetPassword
  );


  $("#logout-button")?.addEventListener(
    "click",
    async () => {
      await supabaseClient.auth.signOut();
    }
  );


  /* -----------------------------------------
     NAVIGATION
  ----------------------------------------- */

  $$(".nav-button").forEach(button => {
    button.addEventListener(
      "click",
      () => {
        navigate(button.dataset.page);
      }
    );
  });


  $$(".link-button[data-page]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          navigate(button.dataset.page);
        }
      );
    }
  );


  /* -----------------------------------------
     QUICK ACTIONS
  ----------------------------------------- */

  $("#quick-expense")?.addEventListener(
    "click",
    () => {
      openTransactionModal("expense");
    }
  );


  $("#quick-income")?.addEventListener(
    "click",
    () => {
      openTransactionModal("income");
    }
  );


  $("#transactions-add")?.addEventListener(
    "click",
    () => {
      openTransactionModal("expense");
    }
  );


  $("#quick-add-category")?.addEventListener(
    "click",
    () => {
      openQuickCategoryModal(
        getSelectedTransactionMainCategoryId()
      );
    }
  );


  $("#quick-category-form")?.addEventListener(
    "submit",
    addQuickCategory
  );


  /* -----------------------------------------
     USER MENU
  ----------------------------------------- */

  $("#user-menu-button")?.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      const menu = $("#user-menu");

      if (!menu) {
        return;
      }

      const hidden =
        menu.classList.toggle("hidden");

      $("#user-menu-button")
        ?.setAttribute(
          "aria-expanded",
          String(!hidden)
        );
    }
  );


  document.addEventListener(
    "click",
    event => {

      const menu = $("#user-menu");

      if (
        menu &&
        !event.target.closest("#user-menu") &&
        !event.target.closest("#user-menu-button")
      ) {
        menu.classList.add("hidden");

        $("#user-menu-button")
          ?.setAttribute(
            "aria-expanded",
            "false"
          );
      }
    }
  );


  /* -----------------------------------------
     MONTH
  ----------------------------------------- */

  $("#month-picker-button")?.addEventListener(
    "click",
    () => {

      setValue(
        "#month-input",
        state.selectedMonth
      );

      openModal("month-modal");
    }
  );


  $("#month-save")?.addEventListener(
    "click",
    async () => {

      const value =
        $("#month-input")?.value;

      if (!value) {
        return;
      }

      state.selectedMonth = value;

      closeModal("month-modal");

      setMonthUI();

      await reloadCurrentMonth();
    }
  );


  /* -----------------------------------------
     TRANSACTION TYPE
  ----------------------------------------- */

  $$(".transaction-type").forEach(button => {
    button.addEventListener(
      "click",
      () => {
        setTransactionType(
          button.dataset.transactionType
        );
      }
    );
  });


  /* -----------------------------------------
     TRANSACTION FORM
  ----------------------------------------- */

  $("#transaction-form")?.addEventListener(
    "submit",
    saveTransaction
  );


  $("#transaction-category")?.addEventListener(
    "change",
    event => {
      handleMainCategoryChange(
        event.target.value
      );
    }
  );


  $("#add-item-button")?.addEventListener(
    "click",
    () => {
      addItemRow();
    }
  );


  $("#transaction-amount")?.addEventListener(
    "input",
    updateItemsTotal
  );


  $("#transaction-items")?.addEventListener(
    "input",
    updateItemsTotal
  );


  $("#transaction-items")?.addEventListener(
    "change",
    event => {

      if (
        event.target.matches(
          ".item-category"
        )
      ) {
        updateItemsTotal();
      }
    }
  );


  $("#transaction-items")?.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "[data-remove-item]"
        );

      if (!button) {
        return;
      }

      const row =
        button.closest(".item-row");

      row?.remove();

      updateItemsTotal();
    }
  );


  /* -----------------------------------------
     SEARCH / FILTERS
  ----------------------------------------- */

  $("#transaction-search")?.addEventListener(
    "input",
    renderTransactions
  );


  $("#transaction-type-filter")?.addEventListener(
    "change",
    renderTransactions
  );


  $("#transaction-category-filter")?.addEventListener(
    "change",
    renderTransactions
  );


  /* -----------------------------------------
     ANALYTICS
  ----------------------------------------- */

  $$(".period-button").forEach(button => {
    button.addEventListener(
      "click",
      async () => {

        $$(".period-button").forEach(item => {
          item.classList.remove("active");
        });

        button.classList.add("active");

        state.analyticsPeriod =
          button.dataset.period;

        await renderAnalytics();
      }
    );
  });


  /* -----------------------------------------
     BUDGETS
  ----------------------------------------- */

  $("#add-budget-button")?.addEventListener(
    "click",
    openBudgetModal
  );


  $("#budget-form")?.addEventListener(
    "submit",
    saveBudget
  );


  /* -----------------------------------------
     SETTINGS
  ----------------------------------------- */

  $("#category-form")?.addEventListener(
    "submit",
    addCategory
  );


  $("#merchant-form")?.addEventListener(
    "submit",
    addMerchant
  );


  /* -----------------------------------------
     EXPORT
  ----------------------------------------- */

  $("#export-data")?.addEventListener(
    "click",
    exportData
  );


  /* -----------------------------------------
     MODALS
  ----------------------------------------- */

  $$("[data-close-modal]").forEach(button => {
    button.addEventListener(
      "click",
      () => {
        closeModal(
          button.dataset.closeModal
        );
      }
    );
  });


  $$(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener(
      "click",
      () => {

        const modal =
          backdrop.closest(".modal");

        if (modal) {
          closeModal(modal.id);
        }
      }
    );
  });


  document.addEventListener(
    "keydown",
    event => {

      if (event.key === "Escape") {
        closeAllModals();
      }
    }
  );


  /* -----------------------------------------
     DELEGATED ACTIONS
  ----------------------------------------- */

  document.addEventListener(
    "click",
    handleDelegatedActions
  );
}


/* =========================================================
   DELEGATED ACTIONS
========================================================= */

function handleDelegatedActions(event) {

  const editButton =
    event.target.closest(
      "[data-edit-transaction]"
    );

  if (editButton) {
    editTransaction(
      editButton.dataset.editTransaction
    );

    return;
  }


  const deleteTransactionButton =
    event.target.closest(
      "[data-delete-transaction]"
    );

  if (deleteTransactionButton) {
    deleteTransaction(
      deleteTransactionButton.dataset.deleteTransaction
    );

    return;
  }


  const deleteCategoryButton =
    event.target.closest(
      "[data-delete-category]"
    );

  if (deleteCategoryButton) {
    deleteCategory(
      deleteCategoryButton.dataset.deleteCategory
    );

    return;
  }


  const addChildCategoryButton =
    event.target.closest(
      "[data-add-child-category]"
    );

  if (addChildCategoryButton) {
    openQuickCategoryModal(
      addChildCategoryButton.dataset.addChildCategory
    );

    return;
  }


  const deleteMerchantButton =
    event.target.closest(
      "[data-delete-merchant]"
    );

  if (deleteMerchantButton) {
    deleteMerchant(
      deleteMerchantButton.dataset.deleteMerchant
    );

    return;
  }


  const deleteBudgetButton =
    event.target.closest(
      "[data-delete-budget]"
    );

  if (deleteBudgetButton) {
    deleteBudget(
      deleteBudgetButton.dataset.deleteBudget
    );
  }
}


/* =========================================================
   AUTH
========================================================= */

async function login(event) {
  event.preventDefault();

  const email =
    $("#login-email")?.value.trim();

  const password =
    $("#login-password")?.value || "";

  if (!email || !password) {
    setAuthMessage(
      "Введите почту и пароль."
    );

    return;
  }

  setAuthMessage(
    "Выполняется вход..."
  );

  const {
    error
  } = await supabaseClient.auth
    .signInWithPassword({
      email,
      password
    });

  if (error) {
    setAuthMessage(
      translateAuthError(error)
    );

    return;
  }

  setAuthMessage("");
}


async function register(event) {
  event.preventDefault();

  const email =
    $("#register-email")?.value.trim();

  const password =
    $("#register-password")?.value || "";

  const confirm =
    $("#register-password-confirm")?.value || "";

  if (password !== confirm) {
    setAuthMessage(
      "Пароли не совпадают."
    );

    return;
  }

  if (password.length < 6) {
    setAuthMessage(
      "Пароль должен содержать минимум 6 символов."
    );

    return;
  }

  setAuthMessage(
    "Создаём аккаунт..."
  );

  const {
    data,
    error
  } = await supabaseClient.auth
    .signUp({
      email,
      password
    });

  if (error) {
    setAuthMessage(
      translateAuthError(error)
    );

    return;
  }

  if (!data.session) {
    setAuthMessage(
      "Аккаунт создан. Проверьте почту для подтверждения адреса."
    );
  } else {
    setAuthMessage("");
  }
}


async function resetPassword() {
  const email =
    $("#login-email")?.value.trim();

  if (!email) {
    setAuthMessage(
      "Сначала укажите почту."
    );

    return;
  }

  const {
    error
  } = await supabaseClient.auth
    .resetPasswordForEmail(
      email,
      {
        redirectTo:
          window.location.origin
      }
    );

  if (error) {
    setAuthMessage(
      translateAuthError(error)
    );

    return;
  }

  setAuthMessage(
    "Письмо для восстановления отправлено."
  );
}


function setAuthMessage(message) {
  setText(
    "#auth-message",
    message
  );
}


function translateAuthError(error) {
  const message =
    error?.message || "";

  const lower =
    message.toLowerCase();

  if (
    lower.includes(
      "invalid login credentials"
    )
  ) {
    return "Неверная почта или пароль.";
  }

  if (
    lower.includes(
      "user already registered"
    )
  ) {
    return "Пользователь с такой почтой уже зарегистрирован.";
  }

  if (
    lower.includes(
      "email not confirmed"
    )
  ) {
    return "Почта ещё не подтверждена.";
  }

  if (
    lower.includes("password")
  ) {
    return "Пароль не соответствует требованиям.";
  }

  return (
    message ||
    "Не удалось выполнить операцию."
  );
}


/* =========================================================
   NAVIGATION
========================================================= */

async function navigate(page) {
  if (!page) {
    return;
  }

  state.currentPage = page;

  $$(".page").forEach(element => {
    element.classList.toggle(
      "active",
      element.id === `page-${page}`
    );
  });

  $$(".nav-button").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  if (page === "analytics") {
    await renderAnalytics();
  }

  if (page === "budgets") {
    renderBudgets();
  }

  if (page === "settings") {
    renderSettings();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   DATA LOADING
========================================================= */

async function loadReferenceData() {

  const [
    categoriesResult,
    merchantsResult
  ] = await Promise.all([

    supabaseClient
      .from("categories")
      .select("*")
      .order("name"),

    supabaseClient
      .from("merchants")
      .select("*")
      .order("name")
  ]);

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  if (merchantsResult.error) {
    throw merchantsResult.error;
  }

  state.categories =
    categoriesResult.data || [];

  state.merchants =
    merchantsResult.data || [];
}


async function loadMonthData() {

  const range =
    getMonthRange(
      state.selectedMonth
    );

  const [
    transactionsResult,
    budgetsResult
  ] = await Promise.all([

    supabaseClient
      .from("transactions")
      .select(`
        *,
        category:categories (
          id,
          name,
          type,
          parent_id
        ),
        transaction_items (
          id,
          name,
          amount,
          category_id,
          category:categories (
            id,
            name,
            type,
            parent_id
          )
        )
      `)
      .gte(
        "date",
        range.start
      )
      .lte(
        "date",
        range.end
      )
      .order(
        "date",
        {
          ascending: false
        }
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      ),

    supabaseClient
      .from("budgets")
      .select(`
        *,
        category:categories (
          id,
          name,
          type,
          parent_id
        )
      `)
      .eq(
        "month",
        state.selectedMonth
      )
      .order(
        "amount",
        {
          ascending: false
        }
      )
  ]);

  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  if (budgetsResult.error) {
    throw budgetsResult.error;
  }

  state.transactions =
    transactionsResult.data || [];

  state.budgets =
    budgetsResult.data || [];
}


async function reloadCurrentMonth() {
  try {
    setLoading(true);

    await loadMonthData();

    renderEverything();
  } catch (error) {
    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  } finally {
    setLoading(false);
  }
}


async function fetchAllTransactions() {

  const PAGE_SIZE = 1000;

  let offset = 0;
  let all = [];

  while (true) {

    const {
      data,
      error
    } = await supabaseClient
      .from("transactions")
      .select(`
        *,
        category:categories (
          id,
          name,
          type,
          parent_id
        ),
        transaction_items (
          id,
          name,
          amount,
          category_id,
          category:categories (
            id,
            name,
            type,
            parent_id
          )
        )
      `)
      .order(
        "date",
        {
          ascending: false
        }
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .range(
        offset,
        offset + PAGE_SIZE - 1
      );

    if (error) {
      throw error;
    }

    const rows = data || [];

    all = all.concat(rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return all;
}


/* =========================================================
   RENDER EVERYTHING
========================================================= */

function renderEverything() {
  setMonthUI();

  populateCategoryFilters();
  populateBudgetCategories();
  populateMerchantOptions();

  renderDashboard();
  renderTransactions();
  renderBudgets();
  renderSettings();
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  const income =
    sum(
      state.transactions
        .filter(
          transaction =>
            transaction.type === "income"
        )
        .map(
          transaction =>
            Number(transaction.amount)
        )
    );

  const expenses =
    sum(
      state.transactions
        .filter(
          transaction =>
            transaction.type === "expense"
        )
        .map(
          transaction =>
            Number(transaction.amount)
        )
    );

  calculateAllTimeBalance()
    .then(balance => {
      setText(
        "#balance-value",
        money(balance)
      );
    })
    .catch(error => {
      console.error(error);
    });

  const remaining =
    income - expenses;

  setText(
    "#income-value",
    money(income)
  );

  setText(
    "#expense-value",
    money(expenses)
  );

  setText(
    "#remaining-value",
    money(remaining)
  );

  setText(
    "#dashboard-month-title",
    formatMonthTitle(
      state.selectedMonth
    )
  );

  renderCategoryOverview();
  renderRecentTransactions();
  renderInsights();
}


async function calculateAllTimeBalance() {
  const transactions =
    await fetchAllTransactions();

  return transactions.reduce(
    (total, transaction) => {

      const amount =
        Number(transaction.amount) || 0;

      if (
        transaction.type === "income"
      ) {
        return total + amount;
      }

      return total - amount;

    },
    0
  );
}


/* =========================================================
   CATEGORY OVERVIEW
========================================================= */

function renderCategoryOverview() {

  const container =
    $("#category-overview");

  if (!container) {
    return;
  }

  const expenses =
    state.transactions.filter(
      transaction =>
        transaction.type === "expense"
    );

  if (!expenses.length) {
    container.innerHTML =
      emptyState(
        "В этом месяце расходов пока нет."
      );

    return;
  }

  const groups =
    aggregateMainCategories(
      expenses
    );

  const total =
    sum(
      expenses.map(
        transaction =>
          Number(transaction.amount)
      )
    );

  const rows =
    [...groups.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 8);

  container.innerHTML =
    rows.map(
      ([name, amount]) => {

        const percent =
          total > 0
            ? Math.round(
                amount / total * 100
              )
            : 0;

        return `
          <div class="category-row">

            <div class="category-main">

              <div class="category-name">
                <span>
                  ${escapeHtml(name)}
                </span>

                <span>
                  ${money(amount)}
                </span>
              </div>

              <div class="progress">
                <div
                  class="progress-bar"
                  style="width:${percent}%"
                ></div>
              </div>

            </div>

          </div>
        `;
      }
    ).join("");
}


/* =========================================================
   RECENT TRANSACTIONS
========================================================= */

function renderRecentTransactions() {

  const container =
    $("#recent-transactions");

  if (!container) {
    return;
  }

  const rows =
    state.transactions.slice(0, 7);

  if (!rows.length) {
    container.innerHTML =
      emptyState(
        "Операций пока нет."
      );

    return;
  }

  container.innerHTML =
    rows
      .map(renderTransactionRow)
      .join("");
}


/* =========================================================
   TRANSACTIONS
========================================================= */

function renderTransactions() {

  const container =
    $("#all-transactions");

  if (!container) {
    return;
  }

  const search =
    (
      $("#transaction-search")
        ?.value || ""
    )
      .trim()
      .toLowerCase();

  const type =
    $("#transaction-type-filter")
      ?.value || "all";

  const category =
    $("#transaction-category-filter")
      ?.value || "all";

  const transactions =
    state.transactions.filter(
      transaction => {

        if (
          type !== "all" &&
          transaction.type !== type
        ) {
          return false;
        }

        if (
          category !== "all" &&
          !transactionMatchesCategory(
            transaction,
            category
          )
        ) {
          return false;
        }

        if (!search) {
          return true;
        }

        return transactionSearchText(
          transaction
        )
          .toLowerCase()
          .includes(search);
      }
    );

  if (!transactions.length) {
    container.innerHTML =
      emptyState(
        "Ничего не найдено."
      );

    return;
  }

  container.innerHTML =
    transactions
      .map(renderTransactionRow)
      .join("");
}


function renderTransactionRow(
  transaction
) {

  const isIncome =
    transaction.type === "income";

  const merchant =
    transaction.merchant ||
    transaction.income_source ||
    "Без названия";

  const category =
    getTransactionCategoryLabel(
      transaction
    );

  const date =
    formatDate(
      transaction.date
    );

  const amount =
    Number(transaction.amount) || 0;

  const sign =
    isIncome
      ? "+"
      : "−";

  return `
    <div
      class="transaction-row"
      data-transaction-id="${escapeHtml(
        transaction.id
      )}"
    >

      <div class="transaction-icon">
        ${ICONS[transaction.type] || "•"}
      </div>

      <div class="transaction-content">

        <div class="transaction-title">
          ${escapeHtml(merchant)}
        </div>

        <div class="transaction-subtitle">
          ${escapeHtml(category)}
          ${
            category && date
              ? " · "
              : ""
          }
          ${escapeHtml(date)}
        </div>

      </div>

      <div
        class="transaction-amount ${
          isIncome
            ? "income"
            : "expense"
        }"
      >
        ${sign}${money(amount)}
      </div>

      <div class="transaction-actions">

        <button
          class="icon-button"
          type="button"
          title="Изменить"
          data-edit-transaction="${escapeHtml(
            transaction.id
          )}"
        >
          ✎
        </button>

        <button
          class="icon-button"
          type="button"
          title="Удалить"
          data-delete-transaction="${escapeHtml(
            transaction.id
          )}"
        >
          ×
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   TRANSACTION MODAL
========================================================= */

function openTransactionModal(
  type = "expense",
  transaction = null
) {

  state.transactionType =
    type === "income"
      ? "income"
      : "expense";

  state.editingTransaction =
    transaction;

  setValue(
    "#transaction-id",
    transaction?.id || ""
  );

  setValue(
    "#transaction-amount",
    transaction?.amount || ""
  );

  setValue(
    "#transaction-date",
    transaction?.date ||
      transactionDateForNewTransaction()
  );

  setValue(
    "#transaction-merchant",
    transaction?.merchant || ""
  );

  setValue(
    "#transaction-note",
    transaction?.comment || ""
  );

  setTransactionType(
    state.transactionType,
    false
  );

  const mainCategoryId =
    getTransactionMainCategoryId(
      transaction
    );

  populateTransactionCategories(
    mainCategoryId
  );

  const items =
    $("#transaction-items");

  if (items) {
    items.innerHTML = "";
  }

  if (
    transaction?.transaction_items?.length
  ) {
    transaction.transaction_items
      .forEach(item => {
        addItemRow(item);
      });
  }

  updateItemsTotal();

  setText(
    "#transaction-modal-title",
    transaction
      ? "Редактировать"
      : state.transactionType === "income"
        ? "Доход"
        : "Расход"
  );

  setText(
    "#transaction-modal-eyebrow",
    transaction
      ? "Редактирование"
      : "Новая операция"
  );

  openModal(
    "transaction-modal"
  );

  setTimeout(() => {
    $("#transaction-amount")?.focus();
  }, 120);
}


function resetTransactionForm() {

  $("#transaction-form")?.reset();

  setValue(
    "#transaction-id",
    ""
  );

  const items =
    $("#transaction-items");

  if (items) {
    items.innerHTML = "";
  }

  state.editingTransaction = null;

  setTransactionType(
    "expense"
  );

  updateItemsTotal();
}


function setTransactionType(
  type,
  renderCategory = true
) {

  state.transactionType =
    type === "income"
      ? "income"
      : "expense";

  $$(".transaction-type").forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.transactionType ===
          state.transactionType
      );
    }
  );

  $$(".expense-only").forEach(
    element => {

      element.classList.toggle(
        "hidden",
        state.transactionType !==
          "expense"
      );
    }
  );

  $$(".income-only").forEach(
    element => {

      element.classList.toggle(
        "hidden",
        state.transactionType !==
          "income"
      );
    }
  );

  setText(
    "#transaction-modal-title",
    state.transactionType === "income"
      ? "Доход"
      : "Расход"
  );

  if (renderCategory) {
    populateTransactionCategories();
  }
}


/* =========================================================
   MAIN CATEGORY SELECTION
========================================================= */

function populateTransactionCategories(
  selectedId = null
) {

  const select =
    $("#transaction-category");

  if (!select) {
    return;
  }

  const categories =
    getTransactionMainCategories();

  select.innerHTML = "";

  if (!categories.length) {

    const option =
      document.createElement("option");

    option.value = "";
    option.textContent =
      "Категорий пока нет";

    select.appendChild(option);

    renderTransactionCategoryChips("");

    return;
  }

  categories.forEach(category => {

    const option =
      document.createElement("option");

    option.value =
      category.id;

    option.textContent =
      category.name;

    select.appendChild(option);
  });

  if (
    selectedId &&
    categories.some(
      category =>
        category.id === selectedId
    )
  ) {
    select.value =
      selectedId;
  }

  if (!select.value) {
    select.value =
      categories[0].id;
  }

  renderTransactionCategoryChips(
    select.value
  );
}


function renderTransactionCategoryChips(
  selectedId
) {

  const container =
    $("#transaction-category-chips");

  if (!container) {
    return;
  }

  const categories =
    getTransactionMainCategories();

  if (!categories.length) {
    container.innerHTML =
      `<span class="category-empty">
        Добавьте основную категорию в настройках.
      </span>`;

    return;
  }

  container.innerHTML =
    categories
      .map(category => {

        const active =
          String(category.id) ===
          String(selectedId);

        return `
          <button
            type="button"
            class="transaction-category-chip ${
              active
                ? "active"
                : ""
            }"
            data-category-id="${escapeHtmlAttribute(
              category.id
            )}"
          >
            ${escapeHtml(category.name)}
          </button>
        `;
      })
      .join("");

  container
    .querySelectorAll(
      "[data-category-id]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const id =
            button.dataset.categoryId;

          setValue(
            "#transaction-category",
            id
          );

          handleMainCategoryChange(
            id
          );
        }
      );
    });
}


function handleMainCategoryChange(
  categoryId
) {

  if (!categoryId) {
    return;
  }

  setValue(
    "#transaction-category",
    categoryId
  );

  renderTransactionCategoryChips(
    categoryId
  );

  refreshAllItemCategoryOptions();
}


/* =========================================================
   ITEM ROWS
========================================================= */

function addItemRow(item = null) {

  const container =
    $("#transaction-items");

  if (!container) {
    return;
  }

  const row =
    document.createElement("div");

  row.className =
    "item-row";

  const itemName =
    item?.name || "";

  const itemAmount =
    item?.amount ?? "";

  const itemCategory =
    item?.category_id || "";

  row.innerHTML = `
    <input
      class="item-name"
      type="text"
      placeholder="Название товара"
      value="${escapeHtmlAttribute(
        itemName
      )}"
      autocomplete="off"
    >

    <input
      class="item-amount"
      type="number"
      min="0.01"
      step="0.01"
      placeholder="0"
      value="${escapeHtmlAttribute(
        itemAmount
      )}"
      inputmode="decimal"
    >

    <select
      class="item-category"
      aria-label="Подкатегория товара"
    ></select>

    <button
      class="icon-button item-remove-button"
      type="button"
      data-remove-item
      title="Удалить позицию"
      aria-label="Удалить позицию"
    >
      ×
    </button>
  `;

  container.appendChild(row);

  populateItemCategorySelect(
    row,
    itemCategory
  );

  updateItemsTotal();
}


function populateItemCategorySelect(
  row,
  selectedId = ""
) {

  const select =
    row.querySelector(
      ".item-category"
    );

  if (!select) {
    return;
  }

  const mainCategoryId =
    $("#transaction-category")
      ?.value || "";

  const children =
    getChildCategories(
      mainCategoryId
    );

  select.innerHTML = "";

  const emptyOption =
    document.createElement("option");

  emptyOption.value = "";
  emptyOption.textContent =
    children.length
      ? "Без подкатегории"
      : "Нет подкатегорий";

  select.appendChild(
    emptyOption
  );

  children.forEach(category => {

    const option =
      document.createElement("option");

    option.value =
      category.id;

    option.textContent =
      category.name;

    select.appendChild(option);
  });

  if (
    selectedId &&
    children.some(
      category =>
        category.id === selectedId
    )
  ) {
    select.value =
      selectedId;
  } else {
    select.value = "";
  }

  select.disabled =
    children.length === 0;
}


function refreshAllItemCategoryOptions() {

  $$("#transaction-items .item-row")
    .forEach(row => {

      const current =
        row.querySelector(
          ".item-category"
        )?.value || "";

      populateItemCategorySelect(
        row,
        current
      );
    });
}


function getFormItems() {

  const rows =
    $$("#transaction-items .item-row");

  return rows.map(row => {

    const name =
      row.querySelector(
        ".item-name"
      )?.value.trim() || "";

    const amount =
      Number(
        row.querySelector(
          ".item-amount"
        )?.value || 0
      );

    const categoryId =
      row.querySelector(
        ".item-category"
      )?.value || null;

    return {
      name,
      amount,
      category_id: categoryId
    };
  });
}


function updateItemsTotal() {

  const items =
    getFormItems();

  const total =
    sum(
      items.map(
        item =>
          Number(item.amount) || 0
      )
    );

  const totalElement =
    $("#transaction-items-total");

  if (totalElement) {

    if (!items.length) {
      totalElement.textContent =
        "Детализация необязательна.";
    } else {
      totalElement.textContent =
        `Позиции: ${money(total)}`;
    }
  }
}


/* =========================================================
   SAVE TRANSACTION
========================================================= */

async function saveTransaction(event) {
  event.preventDefault();

  if (state.saving) {
    return;
  }

  const type =
    state.transactionType;

  const amount =
    roundMoney(
      Number(
        $("#transaction-amount")
          ?.value || 0
      )
    );

  const date =
    $("#transaction-date")
      ?.value;

  const categoryId =
    $("#transaction-category")
      ?.value || null;

  if (
    !amount ||
    amount <= 0
  ) {
    showToast(
      "Введите сумму.",
      "error"
    );

    return;
  }

  if (!date) {
    showToast(
      "Укажите дату.",
      "error"
    );

    return;
  }

  if (!categoryId) {
    showToast(
      "Выберите категорию.",
      "error"
    );

    return;
  }

  const mainCategory =
    getCategory(categoryId);

  if (
    !mainCategory ||
    mainCategory.parent_id !== null
  ) {
    showToast(
      "Для операции можно выбрать только основную категорию.",
      "error"
    );

    return;
  }

  const items =
    type === "expense"
      ? getFormItems()
      : [];

  const invalidItem =
    items.find(
      item =>
        !item.name ||
        !Number.isFinite(
          item.amount
        ) ||
        item.amount <= 0
    );

  if (invalidItem) {
    showToast(
      "Проверьте позиции покупки.",
      "error"
    );

    return;
  }

  const invalidCategory =
    items.find(
      item => {

        if (!item.category_id) {
          return false;
        }

        const category =
          getCategory(
            item.category_id
          );

        return (
          !category ||
          category.parent_id !==
            categoryId
        );
      }
    );

  if (invalidCategory) {
    showToast(
      "Подкатегория не принадлежит выбранной категории.",
      "error"
    );

    return;
  }

  if (items.length) {

    const itemsTotal =
      roundMoney(
        sum(
          items.map(
            item =>
              Number(item.amount)
          )
        )
      );

    if (
      Math.abs(
        itemsTotal - amount
      ) >= 0.01
    ) {
      showToast(
        `Сумма позиций ${money(
          itemsTotal
        )} не совпадает с суммой операции ${money(
          amount
        )}.`,
        "error"
      );

      return;
    }
  }

  const merchantName =
    type === "expense"
      ? (
          $("#transaction-merchant")
            ?.value.trim() || null
        )
      : null;

  const comment =
    $("#transaction-note")
      ?.value.trim() || null;

  setSaving(true);

  try {

    if (
      type === "expense" &&
      merchantName
    ) {
      await ensureMerchant(
        merchantName
      );
    }

    /*
      Критически важно:

      category_id всегда сохраняется
      в transactions.

      Даже если items.length > 0.
    */

    const payload = {
      type,
      amount,
      date,
      merchant: merchantName,
      income_source: null,
      comment,
      category_id: categoryId
    };

    let transactionId =
      state.editingTransaction?.id ||
      null;

    if (transactionId) {

      const {
        error
      } = await supabaseClient
        .from("transactions")
        .update(payload)
        .eq(
          "id",
          transactionId
        );

      if (error) {
        throw error;
      }

    } else {

      const {
        data,
        error
      } = await supabaseClient
        .from("transactions")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      transactionId =
        data.id;
    }

    /*
      Детализация полностью пересобирается.

      Это проще и надёжнее, чем пытаться
      синхронизировать diff строк.
    */

    const {
      error: deleteItemsError
    } = await supabaseClient
      .from("transaction_items")
      .delete()
      .eq(
        "transaction_id",
        transactionId
      );

    if (deleteItemsError) {
      throw deleteItemsError;
    }

    if (
      type === "expense" &&
      items.length
    ) {

      const rows =
        items.map(item => ({
          transaction_id:
            transactionId,

          name:
            item.name,

          amount:
            roundMoney(
              item.amount
            ),

          category_id:
            item.category_id || null
        }));

      const {
        error
      } = await supabaseClient
        .from("transaction_items")
        .insert(rows);

      if (error) {
        throw error;
      }
    }

    closeModal(
      "transaction-modal"
    );

    state.editingTransaction =
      null;

    await reloadCurrentMonth();

    showToast(
      "Операция сохранена."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );

  } finally {
    setSaving(false);
  }
}


/* =========================================================
   EDIT / DELETE TRANSACTIONS
========================================================= */

async function editTransaction(id) {

  const transaction =
    state.transactions.find(
      item =>
        item.id === id
    );

  if (!transaction) {
    showToast(
      "Операция не найдена.",
      "error"
    );

    return;
  }

  openTransactionModal(
    transaction.type,
    transaction
  );
}


async function deleteTransaction(id) {

  const transaction =
    state.transactions.find(
      item =>
        item.id === id
    );

  if (!transaction) {
    return;
  }

  const confirmed =
    window.confirm(
      `Удалить операцию ${money(
        Number(transaction.amount)
      )}?`
    );

  if (!confirmed) {
    return;
  }

  try {

    setLoading(true);

    const {
      error: itemsError
    } = await supabaseClient
      .from("transaction_items")
      .delete()
      .eq(
        "transaction_id",
        id
      );

    if (itemsError) {
      throw itemsError;
    }

    const {
      error
    } = await supabaseClient
      .from("transactions")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {
      throw error;
    }

    await reloadCurrentMonth();

    showToast(
      "Операция удалена."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );

  } finally {
    setLoading(false);
  }
}


/* =========================================================
   CATEGORY HELPERS
========================================================= */

function getCategory(id) {
  if (!id) {
    return null;
  }

  return (
    state.categories.find(
      category =>
        category.id === id
    ) || null
  );
}


function getTransactionMainCategories() {

  const type =
    state.transactionType;

  return state.categories
    .filter(
      category =>
        category.type === type &&
        category.parent_id === null
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "ru"
        )
    );
}


function getChildCategories(
  parentId
) {

  if (!parentId) {
    return [];
  }

  return state.categories
    .filter(
      category =>
        category.parent_id ===
        parentId
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "ru"
        )
    );
}


function getRootCategory(
  categoryId
) {

  let category =
    getCategory(categoryId);

  if (!category) {
    return null;
  }

  if (
    category.parent_id === null
  ) {
    return category;
  }

  return getCategory(
    category.parent_id
  );
}


function getTransactionMainCategoryId(
  transaction
) {

  if (!transaction) {
    return null;
  }

  /*
    Новая правильная структура.
  */

  const direct =
    getCategory(
      transaction.category_id
    );

  if (
    direct &&
    direct.parent_id === null
  ) {
    return direct.id;
  }

  /*
    Совместимость со старыми
    детализированными транзакциями,
    где category_id был ошибочно NULL.
  */

  const firstItem =
    transaction.transaction_items?.find(
      item =>
        item.category_id
    );

  if (firstItem) {

    const root =
      getRootCategory(
        firstItem.category_id
      );

    if (root) {
      return root.id;
    }
  }

  return null;
}


function getSelectedTransactionMainCategoryId() {
  return (
    $("#transaction-category")
      ?.value || null
  );
}


/* =========================================================
   CATEGORY FILTERS
========================================================= */

function populateCategoryFilters() {

  const select =
    $("#transaction-category-filter");

  if (!select) {
    return;
  }

  const current =
    select.value;

  select.innerHTML = `
    <option value="all">
      Все категории
    </option>
  `;

  const roots =
    state.categories
      .filter(
        category =>
          category.parent_id === null
      )
      .sort(
        (a, b) =>
          a.type.localeCompare(
            b.type
          ) ||
          a.name.localeCompare(
            b.name,
            "ru"
          )
      );

  roots.forEach(root => {

    const option =
      document.createElement("option");

    option.value =
      root.id;

    option.textContent =
      root.name;

    select.appendChild(option);

    getChildCategories(root.id)
      .forEach(child => {

        const childOption =
          document.createElement(
            "option"
          );

        childOption.value =
          child.id;

        childOption.textContent =
          `— ${child.name}`;

        select.appendChild(
          childOption
        );
      });
  });

  if (
    [...select.options]
      .some(
        option =>
          option.value === current
      )
  ) {
    select.value = current;
  }
}


function transactionMatchesCategory(
  transaction,
  categoryId
) {

  if (
    transaction.category_id ===
    categoryId
  ) {
    return true;
  }

  const selected =
    getCategory(categoryId);

  if (!selected) {
    return false;
  }

  /*
    Если выбрана основная категория,
    старые транзакции с NULL category_id
    тоже можно найти по подкатегориям.
  */

  if (
    selected.parent_id === null
  ) {

    return (
      transaction.transaction_items ||
      []
    ).some(item => {

      const root =
        getRootCategory(
          item.category_id
        );

      return (
        root?.id === categoryId
      );
    });
  }

  return (
    transaction.transaction_items ||
    []
  ).some(
    item =>
      item.category_id ===
      categoryId
  );
}


/* =========================================================
   CATEGORY QUICK CREATION
========================================================= */

function openQuickCategoryModal(
  parentId = null
) {

  const input =
    $("#quick-category-name");

  if (input) {
    input.value = "";
  }

  ensureQuickCategoryParentField();

  const parentSelect =
    $("#quick-category-parent");

  if (parentSelect) {

    populateQuickCategoryParents();

    parentSelect.value =
      parentId || "";
  }

  openModal(
    "quick-category-modal"
  );

  setTimeout(() => {
    input?.focus();
  }, 100);
}


function ensureQuickCategoryParentField() {

  const form =
    $("#quick-category-form");

  if (!form) {
    return;
  }

  if (
    $("#quick-category-parent-wrap")
  ) {
    return;
  }

  const wrap =
    document.createElement("label");

  wrap.id =
    "quick-category-parent-wrap";

  wrap.innerHTML = `
    Родительская категория

    <select id="quick-category-parent">
      <option value="">
        Основная категория
      </option>
    </select>
  `;

  const actions =
    form.querySelector(
      ".modal-actions"
    );

  if (actions) {
    form.insertBefore(
      wrap,
      actions
    );
  } else {
    form.appendChild(wrap);
  }
}


function populateQuickCategoryParents() {

  const select =
    $("#quick-category-parent");

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">
      Основная категория
    </option>
  `;

  const type =
    state.transactionType;

  state.categories
    .filter(
      category =>
        category.type === type &&
        category.parent_id === null
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "ru"
        )
    )
    .forEach(category => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        category.id;

      option.textContent =
        category.name;

      select.appendChild(option);
    });
}


async function addQuickCategory(event) {

  event.preventDefault();

  const name =
    $("#quick-category-name")
      ?.value.trim();

  const parentId =
    $("#quick-category-parent")
      ?.value || null;

  if (!name) {
    return;
  }

  const type =
    state.transactionType === "income"
      ? "income"
      : "expense";

  if (parentId) {

    const parent =
      getCategory(parentId);

    if (
      !parent ||
      parent.parent_id !== null ||
      parent.type !== type
    ) {
      showToast(
        "Некорректная родительская категория.",
        "error"
      );

      return;
    }
  }

  try {

    const {
      data,
      error
    } = await supabaseClient
      .from("categories")
      .insert({
        name,
        type,
        parent_id: parentId
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await loadReferenceData();

    const newCategory =
      data ||
      state.categories.find(
        category =>
          category.name === name &&
          category.type === type &&
          category.parent_id === parentId
      );

    /*
      Если создавали подкатегорию,
      автоматически оставляем текущую
      основную категорию и не ломаем форму.
    */

    if (
      newCategory &&
      newCategory.parent_id
    ) {

      const mainId =
        newCategory.parent_id;

      setValue(
        "#transaction-category",
        mainId
      );

      renderTransactionCategoryChips(
        mainId
      );

      refreshAllItemCategoryOptions();

    } else if (newCategory) {

      setValue(
        "#transaction-category",
        newCategory.id
      );

      renderTransactionCategoryChips(
        newCategory.id
      );

      refreshAllItemCategoryOptions();
    }

    closeModal(
      "quick-category-modal"
    );

    renderSettings();

    showToast(
      parentId
        ? "Подкатегория добавлена."
        : "Категория добавлена."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


/* =========================================================
   CATEGORY SETTINGS
========================================================= */

async function addCategory(event) {

  event.preventDefault();

  const name =
    $("#new-category-name")
      ?.value.trim();

  const type =
    $("#new-category-type")
      ?.value || "expense";

  if (!name) {
    return;
  }

  try {

    const {
      error
    } = await supabaseClient
      .from("categories")
      .insert({
        name,
        type,
        parent_id: null
      });

    if (error) {
      throw error;
    }

    $("#new-category-name").value =
      "";

    await loadReferenceData();

    renderEverything();

    showToast(
      "Категория добавлена."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


async function deleteCategory(id) {

  const category =
    getCategory(id);

  if (!category) {
    return;
  }

  const children =
    getChildCategories(id);

  const message =
    children.length
      ? `Удалить «${category.name}» и ${children.length} подкатегори${
          children.length === 1
            ? "ю"
            : children.length < 5
              ? "и"
              : "й"
        }?`
      : `Удалить категорию «${category.name}»?`;

  if (!window.confirm(message)) {
    return;
  }

  try {

    const {
      error
    } = await supabaseClient
      .from("categories")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {
      throw error;
    }

    await loadReferenceData();
    await loadMonthData();

    renderEverything();

    showToast(
      "Категория удалена."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


function renderSettings() {
  renderCategoriesSettings();
  renderMerchantsSettings();
}


function renderCategoriesSettings() {

  const container =
    $("#categories-settings");

  if (!container) {
    return;
  }

  const roots =
    state.categories
      .filter(
        category =>
          category.parent_id === null
      )
      .sort(
        (a, b) =>
          a.type.localeCompare(
            b.type
          ) ||
          a.name.localeCompare(
            b.name,
            "ru"
          )
      );

  if (!roots.length) {

    container.innerHTML =
      emptyState(
        "Категорий пока нет."
      );

    return;
  }

  container.innerHTML =
    `
      <div class="category-tree">
        ${roots.map(renderCategoryTreeNode).join("")}
      </div>
    `;
}


function renderCategoryTreeNode(
  category
) {

  const children =
    getChildCategories(
      category.id
    );

  return `
    <div class="category-tree-node">

      <div class="category-tree-parent">

        <div class="category-tree-info">

          <strong>
            ${escapeHtml(category.name)}
          </strong>

          <span class="category-type-badge">
            ${
              category.type === "income"
                ? "Доход"
                : "Расход"
            }
          </span>

        </div>

        <div class="category-tree-actions">

          <button
            class="link-button category-add-child"
            type="button"
            data-add-child-category="${escapeHtmlAttribute(
              category.id
            )}"
          >
            + Подкатегория
          </button>

          <button
            class="icon-button"
            type="button"
            title="Удалить"
            data-delete-category="${escapeHtmlAttribute(
              category.id
            )}"
          >
            ×
          </button>

        </div>

      </div>

      ${
        children.length
          ? `
            <div class="category-tree-children">
              ${children.map(
                child => `
                  <div class="category-tree-child">

                    <div class="category-tree-child-name">
                      <span class="category-tree-branch">
                        └
                      </span>

                      <span>
                        ${escapeHtml(
                          child.name
                        )}
                      </span>
                    </div>

                    <button
                      class="icon-button"
                      type="button"
                      title="Удалить"
                      data-delete-category="${escapeHtmlAttribute(
                        child.id
                      )}"
                    >
                      ×
                    </button>

                  </div>
                `
              ).join("")}
            </div>
          `
          : ""
      }

    </div>
  `;
}


/* =========================================================
   MERCHANTS
========================================================= */

function populateMerchantOptions() {

  const datalist =
    $("#merchant-options");

  if (!datalist) {
    return;
  }

  datalist.innerHTML =
    state.merchants
      .map(
        merchant => `
          <option
            value="${escapeHtmlAttribute(
              merchant.name
            )}"
          ></option>
        `
      )
      .join("");
}


async function ensureMerchant(name) {

  const normalized =
    name.trim();

  if (!normalized) {
    return null;
  }

  const existing =
    state.merchants.find(
      merchant =>
        merchant.name
          .trim()
          .toLowerCase() ===
        normalized.toLowerCase()
    );

  if (existing) {
    return existing;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("merchants")
    .insert({
      name: normalized
    })
    .select("*")
    .single();

  if (error) {

    if (
      error.code === "23505"
    ) {

      const {
        data: duplicate
      } = await supabaseClient
        .from("merchants")
        .select("*")
        .ilike(
          "name",
          normalized
        )
        .limit(1)
        .maybeSingle();

      return duplicate || null;
    }

    throw error;
  }

  state.merchants.push(data);

  state.merchants.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        "ru"
      )
  );

  return data;
}


async function addMerchant(event) {

  event.preventDefault();

  const name =
    $("#new-merchant-name")
      ?.value.trim();

  if (!name) {
    return;
  }

  try {

    await ensureMerchant(name);

    $("#new-merchant-name").value =
      "";

    await loadReferenceData();

    renderEverything();

    showToast(
      "Магазин добавлен."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


async function deleteMerchant(id) {

  const merchant =
    state.merchants.find(
      item =>
        item.id === id
    );

  if (!merchant) {
    return;
  }

  if (
    !window.confirm(
      `Удалить магазин «${merchant.name}»?`
    )
  ) {
    return;
  }

  try {

    const {
      error
    } = await supabaseClient
      .from("merchants")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {
      throw error;
    }

    await loadReferenceData();

    renderEverything();

    showToast(
      "Магазин удалён."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


function renderMerchantsSettings() {

  const container =
    $("#merchants-settings");

  if (!container) {
    return;
  }

  if (!state.merchants.length) {

    container.innerHTML =
      emptyState(
        "Магазинов пока нет."
      );

    return;
  }

  container.innerHTML =
    state.merchants
      .map(
        merchant => `
          <div class="settings-item">

            <div>
              <div class="settings-item-name">
                ${escapeHtml(
                  merchant.name
                )}
              </div>
            </div>

            <button
              class="icon-button"
              type="button"
              title="Удалить"
              data-delete-merchant="${escapeHtmlAttribute(
                merchant.id
              )}"
            >
              ×
            </button>

          </div>
        `
      )
      .join("");
}


/* =========================================================
   BUDGETS
========================================================= */

function populateBudgetCategories() {

  const select =
    $("#budget-category");

  if (!select) {
    return;
  }

  const current =
    select.value;

  select.innerHTML = `
    <option value="">
      Выберите категорию
    </option>
  `;

  getTransactionMainCategoriesForType(
    "expense"
  ).forEach(category => {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      category.id;

    option.textContent =
      category.name;

    select.appendChild(
      option
    );
  });

  if (
    [...select.options]
      .some(
        option =>
          option.value === current
      )
  ) {
    select.value = current;
  }
}


function getTransactionMainCategoriesForType(
  type
) {

  return state.categories
    .filter(
      category =>
        category.type === type &&
        category.parent_id === null
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "ru"
        )
    );
}


function openBudgetModal() {

  populateBudgetCategories();

  setValue(
    "#budget-category",
    ""
  );

  setValue(
    "#budget-amount",
    ""
  );

  openModal(
    "budget-modal"
  );
}


async function saveBudget(event) {

  event.preventDefault();

  const categoryId =
    $("#budget-category")
      ?.value;

  const amount =
    roundMoney(
      Number(
        $("#budget-amount")
          ?.value || 0
      )
    );

  if (!categoryId) {

    showToast(
      "Выберите категорию.",
      "error"
    );

    return;
  }

  const category =
    getCategory(categoryId);

  if (
    !category ||
    category.parent_id !== null ||
    category.type !== "expense"
  ) {

    showToast(
      "Лимит можно установить только для основной категории расхода.",
      "error"
    );

    return;
  }

  if (
    !amount ||
    amount <= 0
  ) {

    showToast(
      "Введите сумму лимита.",
      "error"
    );

    return;
  }

  try {

    const {
      data: existing,
      error: findError
    } = await supabaseClient
      .from("budgets")
      .select("id")
      .eq(
        "month",
        state.selectedMonth
      )
      .eq(
        "category_id",
        categoryId
      )
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    let error;

    if (existing?.id) {

      ({
        error
      } = await supabaseClient
        .from("budgets")
        .update({
          amount
        })
        .eq(
          "id",
          existing.id
        ));

    } else {

      ({
        error
      } = await supabaseClient
        .from("budgets")
        .insert({
          month:
            state.selectedMonth,

          category_id:
            categoryId,

          amount
        }));
    }

    if (error) {
      throw error;
    }

    closeModal(
      "budget-modal"
    );

    await loadMonthData();

    renderBudgets();

    showToast(
      "Лимит сохранён."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


function renderBudgets() {

  const container =
    $("#budgets-list");

  if (!container) {
    return;
  }

  if (!state.budgets.length) {

    container.innerHTML =
      emptyState(
        "На этот месяц лимитов пока нет."
      );

    return;
  }

  container.innerHTML =
    state.budgets
      .map(
        budget => {

          const category =
            budget.category ||
            getCategory(
              budget.category_id
            );

          const spent =
            getCategorySpent(
              budget.category_id
            );

          const limit =
            Number(
              budget.amount
            ) || 0;

          const percent =
            limit > 0
              ? Math.round(
                  spent / limit * 100
                )
              : 0;

          const width =
            Math.min(
              Math.max(
                percent,
                0
              ),
              100
            );

          const status =
            percent >= 100
              ? "danger"
              : percent >= 80
                ? "warning"
                : "";

          const remaining =
            limit - spent;

          return `
            <article
              class="budget-card ${status}"
            >

              <div class="budget-header">

                <div>
                  <div class="budget-name">
                    ${escapeHtml(
                      category?.name ||
                      "Категория"
                    )}
                  </div>

                  <div class="budget-values">
                    ${money(spent)}
                    из
                    ${money(limit)}
                  </div>
                </div>

                <button
                  class="icon-button"
                  type="button"
                  title="Удалить"
                  data-delete-budget="${escapeHtmlAttribute(
                    budget.id
                  )}"
                >
                  ×
                </button>

              </div>

              <div class="budget-progress">

                <div
                  class="budget-progress-bar"
                  style="width:${width}%"
                ></div>

              </div>

              <div class="budget-footer">

                <span>
                  ${
                    remaining >= 0
                      ? `Осталось ${money(
                          remaining
                        )}`
                      : `Превышение ${money(
                          Math.abs(
                            remaining
                          )
                        )}`
                  }
                </span>

                <strong>
                  ${percent}%
                </strong>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


async function deleteBudget(id) {

  if (
    !window.confirm(
      "Удалить этот лимит?"
    )
  ) {
    return;
  }

  try {

    const {
      error
    } = await supabaseClient
      .from("budgets")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {
      throw error;
    }

    await loadMonthData();

    renderBudgets();

    showToast(
      "Лимит удалён."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


function getCategorySpent(
  categoryId
) {

  return state.transactions
    .filter(
      transaction =>
        transaction.type === "expense"
    )
    .reduce(
      (
        total,
        transaction
      ) => {

        const transactionMain =
          getTransactionMainCategoryId(
            transaction
          );

        if (
          transactionMain ===
          categoryId
        ) {
          /*
            Если есть позиции,
            берём их сумму.
            Если позиция без категории,
            она всё равно относится
            к основной категории.
          */

          if (
            transaction.transaction_items?.length
          ) {
            return (
              total +
              sum(
                transaction.transaction_items
                  .map(
                    item =>
                      Number(
                        item.amount
                      ) || 0
                  )
              )
            );
          }

          return (
            total +
            Number(
              transaction.amount
            )
          );
        }

        return total;
      },
      0
    );
}


/* =========================================================
   ANALYTICS
========================================================= */

async function renderAnalytics() {

  try {

    const transactions =
      await getAnalyticsTransactions(
        state.analyticsPeriod
      );

    state.analyticsTransactions =
      transactions;

    renderAnalyticsCategories(
      transactions
    );

    renderAnalyticsMerchants(
      transactions
    );

    renderAnalyticsItems(
      transactions
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


async function getAnalyticsTransactions(
  period
) {

  const end =
    getMonthRange(
      state.selectedMonth
    ).end;

  let start;

  if (period === "year") {

    const date =
      new Date(
        `${state.selectedMonth}-01T00:00:00`
      );

    date.setMonth(
      date.getMonth() - 11
    );

    start =
      dateToString(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          1
        )
      );

  } else if (
    period === "3months"
  ) {

    const date =
      new Date(
        `${state.selectedMonth}-01T00:00:00`
      );

    date.setMonth(
      date.getMonth() - 2
    );

    start =
      dateToString(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          1
        )
      );

  } else {

    start =
      getMonthRange(
        state.selectedMonth
      ).start;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("transactions")
    .select(`
      *,
      category:categories (
        id,
        name,
        type,
        parent_id
      ),
      transaction_items (
        id,
        name,
        amount,
        category_id,
        category:categories (
          id,
          name,
          type,
          parent_id
        )
      )
    `)
    .gte(
      "date",
      start
    )
    .lte(
      "date",
      end
    )
    .order(
      "date",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}


function renderAnalyticsCategories(
  transactions
) {

  const container =
    $("#analytics-categories");

  if (!container) {
    return;
  }

  const expenses =
    transactions.filter(
      transaction =>
        transaction.type === "expense"
    );

  const groups =
    aggregateMainCategories(
      expenses
    );

  const total =
    [...groups.values()]
      .reduce(
        (
          totalValue,
          value
        ) =>
          totalValue + value,
        0
      );

  const rows =
    [...groups.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      );

  setText(
    "#analytics-category-caption",
    `${money(total)} расходов`
  );

  if (!rows.length) {

    container.innerHTML =
      emptyState(
        "Нет расходов за период."
      );

    return;
  }

  container.innerHTML =
    rows
      .map(
        ([name, amount]) => {

          const percent =
            total > 0
              ? Math.round(
                  amount / total * 100
                )
              : 0;

          return `
            <div class="analytics-item">

              <div>
                <strong>
                  ${escapeHtml(name)}
                </strong>

                <span>
                  ${percent}%
                </span>
              </div>

              <strong>
                ${money(amount)}
              </strong>

            </div>
          `;
        }
      )
      .join("");
}


function renderAnalyticsMerchants(
  transactions
) {

  const container =
    $("#analytics-merchants");

  if (!container) {
    return;
  }

  const groups =
    new Map();

  transactions
    .filter(
      transaction =>
        transaction.type === "expense"
    )
    .forEach(
      transaction => {

        const name =
          transaction.merchant ||
          "Без магазина";

        addToMap(
          groups,
          name,
          Number(
            transaction.amount
          )
        );
      }
    );

  const rows =
    [...groups.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 15);

  if (!rows.length) {

    container.innerHTML =
      emptyState(
        "Нет данных о магазинах."
      );

    return;
  }

  container.innerHTML =
    rows
      .map(
        ([name, amount]) => `
          <div class="analytics-item">

            <div>
              <strong>
                ${escapeHtml(name)}
              </strong>
            </div>

            <strong>
              ${money(amount)}
            </strong>

          </div>
        `
      )
      .join("");
}


function renderAnalyticsItems(
  transactions
) {

  const container =
    $("#analytics-items");

  if (!container) {
    return;
  }

  const groups =
    new Map();

  transactions
    .filter(
      transaction =>
        transaction.type === "expense"
    )
    .forEach(
      transaction => {

        const items =
          transaction.transaction_items ||
          [];

        items.forEach(item => {

          const name =
            item.name ||
            "Без названия";

          addToMap(
            groups,
            name,
            Number(
              item.amount
            )
          );
        });
      }
    );

  const rows =
    [...groups.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 20);

  if (!rows.length) {

    container.innerHTML =
      emptyState(
        "Разобранных товаров за этот период нет."
      );

    return;
  }

  container.innerHTML =
    rows
      .map(
        ([name, amount]) => `
          <div class="analytics-item">

            <div>
              <strong>
                ${escapeHtml(name)}
              </strong>
            </div>

            <strong>
              ${money(amount)}
            </strong>

          </div>
        `
      )
      .join("");
}


/* =========================================================
   MAIN CATEGORY AGGREGATION
========================================================= */

function aggregateMainCategories(
  transactions
) {

  const groups =
    new Map();

  transactions.forEach(
    transaction => {

      const items =
        transaction.transaction_items ||
        [];

      /*
        Обычная транзакция:
        category_id = main category.
      */

      if (!items.length) {

        const main =
          getRootCategory(
            transaction.category_id
          );

        const name =
          main?.name ||
          transaction.category?.name ||
          "Без категории";

        addToMap(
          groups,
          name,
          Number(
            transaction.amount
          )
        );

        return;
      }

      /*
        Детализированная транзакция.

        Каждая позиция относится
        к основной категории через
        свою подкатегорию.

        Если подкатегория не указана,
        используем category_id самой
        транзакции.
      */

      items.forEach(item => {

        const root =
          item.category_id
            ? getRootCategory(
                item.category_id
              )
            : getRootCategory(
                transaction.category_id
              );

        const name =
          root?.name ||
          "Без категории";

        addToMap(
          groups,
          name,
          Number(
            item.amount
          )
        );
      });
    }
  );

  return groups;
}


/* =========================================================
   TRANSACTION CATEGORY LABEL
========================================================= */

function getTransactionCategoryLabel(
  transaction
) {

  const main =
    getRootCategory(
      transaction.category_id
    ) ||
    (
      transaction.category
        ?.parent_id === null
        ? transaction.category
        : null
    );

  const mainName =
    main?.name ||
    "Без категории";

  const children =
    [
      ...new Set(
        (
          transaction.transaction_items ||
          []
        )
          .map(
            item => {

              const category =
                getCategory(
                  item.category_id
                );

              if (
                category?.parent_id ===
                main?.id
              ) {
                return category.name;
              }

              return (
                item.category?.parent_id ===
                  main?.id
                  ? item.category.name
                  : null
              );
            }
          )
          .filter(Boolean)
      )
    ];

  if (!children.length) {
    return mainName;
  }

  return `${mainName} · ${children.join(", ")}`;
}


/* =========================================================
   SEARCH
========================================================= */

function transactionSearchText(
  transaction
) {

  const parts = [
    transaction.merchant,
    transaction.income_source,
    transaction.comment,
    transaction.date,
    transaction.category?.name
  ];

  (
    transaction.transaction_items ||
    []
  ).forEach(item => {

    parts.push(
      item.name
    );

    parts.push(
      item.category?.name
    );
  });

  return parts
    .filter(Boolean)
    .join(" ");
}


/* =========================================================
   INSIGHTS
========================================================= */

function renderInsights() {

  const container =
    $("#insights");

  if (!container) {
    return;
  }

  const expenses =
    state.transactions.filter(
      transaction =>
        transaction.type === "expense"
    );

  if (!expenses.length) {

    container.innerHTML = `
      <div class="insight">

        <strong>
          Пока нечего анализировать
        </strong>

        <p>
          Добавьте несколько расходов,
          и здесь появятся финансовые наблюдения.
        </p>

      </div>
    `;

    return;
  }

  const total =
    sum(
      expenses.map(
        transaction =>
          Number(
            transaction.amount
          )
      )
    );

  const largest =
    [...expenses]
      .sort(
        (a, b) =>
          Number(b.amount) -
          Number(a.amount)
      )[0];

  const categories =
    aggregateMainCategories(
      expenses
    );

  const topCategory =
    [...categories.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1]
      )[0];

  const average =
    total /
    Math.max(
      1,
      new Set(
        expenses.map(
          transaction =>
            transaction.date
        )
      ).size
    );

  const insights = [];

  if (topCategory) {

    insights.push({
      title:
        topCategory[0],

      text:
        `${money(
          topCategory[1]
        )} — крупнейшая категория расходов за месяц.`
    });
  }

  if (largest) {

    insights.push({
      title:
        `Крупная покупка ${money(
          Number(
            largest.amount
          )
        )}`,

      text:
        `${largest.merchant || "Без магазина"} · ${formatDate(
          largest.date
        )}.`
    });
  }

  insights.push({
    title:
      "Средний расход в день",

    text:
      `${money(
        average
      )} по дням, в которые были расходы.`
  });

  container.innerHTML =
    insights
      .slice(0, 3)
      .map(
        insight => `
          <div class="insight">

            <strong>
              ${escapeHtml(
                insight.title
              )}
            </strong>

            <p>
              ${escapeHtml(
                insight.text
              )}
            </p>

          </div>
        `
      )
      .join("");
}


/* =========================================================
   EXPORT
========================================================= */

async function exportData() {

  try {

    showToast(
      "Готовим экспорт..."
    );

    const transactions =
      await fetchAllTransactions();

    const budgets =
      await fetchAllBudgets();

    const payload = {
      version: 2,

      exported_at:
        new Date().toISOString(),

      user_id:
        state.user?.id || null,

      categories:
        state.categories,

      merchants:
        state.merchants,

      budgets,

      transactions
    };

    downloadFile(
      JSON.stringify(
        payload,
        null,
        2
      ),
      `fintracker-${new Date()
        .toISOString()
        .slice(0, 10)}.json`,
      "application/json"
    );

    $("#user-menu")
      ?.classList.add(
        "hidden"
      );

    showToast(
      "Экспорт готов."
    );

  } catch (error) {

    console.error(error);

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}


async function fetchAllBudgets() {

  const {
    data,
    error
  } = await supabaseClient
    .from("budgets")
    .select(`
      *,
      category:categories (
        id,
        name,
        type,
        parent_id
      )
    `)
    .order(
      "month",
      {
        ascending: false
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   MONTH
========================================================= */

function setMonthUI() {

  const title =
    formatMonthTitle(
      state.selectedMonth
    );

  setText(
    "#month-picker-button",
    title
  );

  setText(
    "#dashboard-month-title",
    title
  );

  const input =
    $("#month-input");

  if (input) {
    input.value =
      state.selectedMonth;
  }
}


function getMonthKey(date) {

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}`;
}


function getMonthRange(
  monthKey
) {

  const [
    year,
    month
  ] =
    monthKey
      .split("-")
      .map(Number);

  const lastDay =
    new Date(
      year,
      month,
      0
    ).getDate();

  return {
    start:
      `${year}-${pad(month)}-01`,

    end:
      `${year}-${pad(month)}-${pad(
        lastDay
      )}`
  };
}


function formatMonthTitle(
  monthKey
) {

  const [
    year,
    month
  ] =
    monthKey
      .split("-")
      .map(Number);

  return `${MONTH_NAMES[
    month - 1
  ]} ${year}`;
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "hidden"
  );

  document.body.classList.add(
    "modal-open"
  );
}


function closeModal(id) {

  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.add(
    "hidden"
  );

  if (
    !$(".modal:not(.hidden)")
  ) {
    document.body.classList.remove(
      "modal-open"
    );
  }

  if (
    id === "transaction-modal"
  ) {
    resetTransactionForm();
  }
}


function closeAllModals() {

  $$(".modal").forEach(
    modal => {
      modal.classList.add(
        "hidden"
      );
    }
  );

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   UI STATE
========================================================= */

function setLoading(value) {

  state.loading =
    Boolean(value);

  document.body.classList.toggle(
    "is-loading",
    state.loading
  );
}


function setSaving(value) {

  state.saving =
    Boolean(value);

  const button =
    $("#transaction-form")
      ?.querySelector(
        'button[type="submit"]'
      );

  if (!button) {
    return;
  }

  button.disabled =
    state.saving;

  button.textContent =
    state.saving
      ? "Сохраняем..."
      : "Сохранить";
}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message,
  type = "success"
) {

  const container =
    $("#toast-container");

  if (!container) {
    console[
      type === "error"
        ? "error"
        : "log"
    ](message);

    return;
  }

  const toast =
    document.createElement(
      "div"
    );

  toast.className =
    `toast ${type}`;

  toast.textContent =
    message;

  container.appendChild(
    toast
  );

  requestAnimationFrame(
    () => {
      toast.classList.add(
        "visible"
      );
    }
  );

  setTimeout(
    () => {

      toast.classList.remove(
        "visible"
      );

      setTimeout(
        () => toast.remove(),
        250
      );

    },
    3000
  );
}


/* =========================================================
   FORMATTERS
========================================================= */

function money(value) {

  const number =
    Number(value) || 0;

  return (
    new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 2,

        minimumFractionDigits:
          Number.isInteger(number)
            ? 0
            : 2
      }
    )
      .format(number)
      + " ₽"
  );
}


function formatDate(value) {

  if (!value) {
    return "";
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "numeric",
      month: "short"
    }
  ).format(date);
}


function dateToString(date) {

  return [
    date.getFullYear(),

    pad(
      date.getMonth() + 1
    ),

    pad(
      date.getDate()
    )
  ].join("-");
}


function transactionDateForNewTransaction() {

  return dateToString(
    new Date()
  );
}


function pad(value) {

  return String(
    value
  ).padStart(
    2,
    "0"
  );
}


function roundMoney(value) {

  return Math.round(
    (
      Number(value) || 0
    ) * 100
  ) / 100;
}


function sum(values) {

  return values.reduce(
    (
      total,
      value
    ) =>
      total +
      (
        Number(value) || 0
      ),
    0
  );
}


function addToMap(
  map,
  key,
  amount
) {

  map.set(
    key,
    (
      map.get(key) || 0
    ) +
    (
      Number(amount) || 0
    )
  );
}


/* =========================================================
   HTML SAFETY
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeHtmlAttribute(
  value
) {
  return escapeHtml(value);
}


function emptyState(message) {

  return `
    <div class="empty-state">
      ${escapeHtml(message)}
    </div>
  `;
}


/* =========================================================
   ERRORS
========================================================= */

function getErrorMessage(error) {

  if (!error) {
    return "Произошла неизвестная ошибка.";
  }

  if (
    error.code === "23505"
  ) {
    return "Такая запись уже существует.";
  }

  if (
    error.code === "23503"
  ) {
    return "Нельзя удалить запись, которая используется другими данными.";
  }

  if (
    error.code === "42501"
  ) {
    return "Недостаточно прав для этой операции.";
  }

  if (
    error.code === "23514"
  ) {
    return (
      error.message ||
      "Данные не прошли проверку базы данных."
    );
  }

  if (
    error.message
  ) {
    return error.message;
  }

  return "Не удалось выполнить операцию.";
}


/* =========================================================
   DOWNLOAD
========================================================= */

function downloadFile(
  content,
  filename,
  type
) {

  const blob =
    new Blob(
      [content],
      {
        type
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    filename;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );
}


/* =========================================================
   GLOBAL COMPATIBILITY HANDLERS
========================================================= */

window.editTransaction =
  editTransaction;

window.deleteTransaction =
  deleteTransaction;

window.deleteCategory =
  deleteCategory;

window.deleteMerchant =
  deleteMerchant;

window.deleteBudget =
  deleteBudget;