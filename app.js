// app.js

"use strict";

const { createClient } = window.supabase;

const supabaseClient = createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

async function setTransactionCategoryFromItems() {

  return null;
}
/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,

  currentPage: "dashboard",

  selectedMonth: getMonthKey(new Date()),

  transactions: [],
  categories: [],
  merchants: [],
  budgets: [],
  items: [],

  transactionType: "expense",

  editingTransaction: null,

  analyticsPeriod: "month"
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
   DOM
========================================================= */

const $ = selector => document.querySelector(selector);

const $$ = selector => [...document.querySelectorAll(selector)];


/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setupEvents();

  setMonthUI();

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session?.user) {
    await enterApp(session.user);
  } else {
    showAuth();
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      await enterApp(session.user);
    }

    if (event === "SIGNED_OUT") {
      showAuth();
    }
  });
}


/* =========================================================
   AUTH
========================================================= */

function showAuth() {
  $("#auth-screen").classList.remove("hidden");
  $("#main-screen").classList.add("hidden");
}

async function enterApp(user) {
  state.user = user;

  $("#auth-screen").classList.add("hidden");
  $("#main-screen").classList.remove("hidden");

  $("#user-email").textContent = user.email || "";

  await ensureUserProfile();

  await loadReferenceData();
  await loadMonthData();

  renderEverything();
}

async function ensureUserProfile() {
  const { error } = await supabaseClient
    .from("profiles")
    .upsert({
      id: state.user.id,
      email: state.user.email
    }, {
      onConflict: "id"
    });

  if (error) {
    console.error(error);
  }
}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  /* AUTH */

  $$(".auth-tab").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.authTab;

      $$(".auth-tab").forEach(x => x.classList.remove("active"));
      button.classList.add("active");

      $("#login-form").classList.toggle("hidden", tab !== "login");
      $("#register-form").classList.toggle("hidden", tab !== "register");

      $("#auth-message").textContent = "";
    });
  });


  $("#login-form").addEventListener("submit", login);

  $("#register-form").addEventListener("submit", register);

  $("#forgot-password").addEventListener("click", resetPassword);

  $("#logout-button").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
  });


  /* NAVIGATION */

  $$(".nav-button").forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.page);
    });
  });

  $$("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.page) {
        navigate(button.dataset.page);
      }
    });
  });


  /* QUICK ACTIONS */

  $("#quick-expense").addEventListener("click", () => {
    openTransactionModal("expense");
  });

  $("#quick-income").addEventListener("click", () => {
    openTransactionModal("income");
  });

  $("#transactions-add").addEventListener("click", () => {
    openTransactionModal("expense");
  });


  /* USER MENU */

  $("#user-menu-button").addEventListener("click", event => {
    event.stopPropagation();
    $("#user-menu").classList.toggle("hidden");
  });

  document.addEventListener("click", event => {
    if (!event.target.closest("#user-menu") &&
        !event.target.closest("#user-menu-button")) {
      $("#user-menu").classList.add("hidden");
    }
  });


  /* MONTH */

  $("#month-picker-button").addEventListener("click", () => {
    $("#month-input").value = state.selectedMonth;
    openModal("month-modal");
  });

  $("#month-save").addEventListener("click", async () => {
    state.selectedMonth = $("#month-input").value;

    closeModal("month-modal");

    setMonthUI();

    await loadMonthData();
    renderEverything();
  });


  /* TRANSACTION TYPE */

  $$(".transaction-type").forEach(button => {
    button.addEventListener("click", () => {
      setTransactionType(button.dataset.transactionType);
    });
  });


  /* TRANSACTION */

  $("#transaction-form").addEventListener("submit", saveTransaction);

  $("#add-item-button").addEventListener("click", addItemRow);

  $("#transaction-items").addEventListener("input", updateItemsTotal);

  $("#transaction-items").addEventListener("change", updateItemsTotal);

  $("#transaction-items").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-item]");

    if (!button) {
      return;
    }

    button.closest(".item-row").remove();

    updateItemsTotal();
  });


  /* SEARCH */

  $("#transaction-search").addEventListener("input", renderTransactions);

  $("#transaction-type-filter").addEventListener("change", renderTransactions);

  $("#transaction-category-filter").addEventListener("change", renderTransactions);


  /* ANALYTICS */

  $$(".period-button").forEach(button => {
    button.addEventListener("click", async () => {

      $$(".period-button").forEach(x => x.classList.remove("active"));
      button.classList.add("active");

      state.analyticsPeriod = button.dataset.period;

      await renderAnalytics();
    });
  });


  /* BUDGETS */

  $("#add-budget-button").addEventListener("click", openBudgetModal);

  $("#budget-form").addEventListener("submit", saveBudget);


  /* SETTINGS */

  $("#category-form").addEventListener("submit", addCategory);

  $("#merchant-form").addEventListener("submit", addMerchant);


  /* EXPORT */

  $("#export-data").addEventListener("click", exportData);


  /* CLOSE MODALS */

  $$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  $$(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", () => {
      backdrop.closest(".modal").classList.add("hidden");
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      $$(".modal").forEach(modal => modal.classList.add("hidden"));
    }
  });
}


/* =========================================================
   AUTH FUNCTIONS
========================================================= */

async function login(event) {
  event.preventDefault();

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  setAuthMessage("Выполняется вход...");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  setAuthMessage("");
}

async function register(event) {
  event.preventDefault();

  const email = $("#register-email").value.trim();
  const password = $("#register-password").value;
  const confirm = $("#register-password-confirm").value;

  if (password !== confirm) {
    setAuthMessage("Пароли не совпадают.");
    return;
  }

  setAuthMessage("Создаём аккаунт...");

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    setAuthMessage(error.message);
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
  const email = $("#login-email").value.trim();

  if (!email) {
    setAuthMessage("Сначала укажите почту.");
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  setAuthMessage("Письмо для восстановления отправлено.");
}

function setAuthMessage(message) {
  $("#auth-message").textContent = message;
}


/* =========================================================
   NAVIGATION
========================================================= */

async function navigate(page) {
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
    merchantsResult,
    budgetsResult
  ] = await Promise.all([

    supabaseClient
      .from("categories")
      .select("*")
      .order("name"),

    supabaseClient
      .from("merchants")
      .select("*")
      .order("name"),

    supabaseClient
      .from("budgets")
      .select("*")
      .eq("month", state.selectedMonth)
      .order("amount", { ascending: false })
  ]);


  if (categoriesResult.error) {
    handleDbError(categoriesResult.error);
    return;
  }

  if (merchantsResult.error) {
    handleDbError(merchantsResult.error);
    return;
  }

  if (budgetsResult.error) {
    handleDbError(budgetsResult.error);
    return;
  }


  state.categories = categoriesResult.data || [];
  state.merchants = merchantsResult.data || [];
  state.budgets = budgetsResult.data || [];
}

async function loadMonthData() {

  const [year, month] =
    state.selectedMonth
      .split("-")
      .map(Number);


  const start =
    `${year}-${pad(month)}-01`;


  const lastDay =
    new Date(
      year,
      month,
      0
    ).getDate();


  const end =
    `${year}-${pad(month)}-${pad(lastDay)}`;


  const {
    data,
    error
  } =
    await supabaseClient
      .from("transactions")
      .select(`
        *,
        transaction_items (
          id,
          name,
          amount,
          category_id,
          category:categories (
            id,
            name,
            type
          )
        ),
        category:categories (
          id,
          name,
          type
        )
      `)
      .gte("date", start)
      .lte("date", end)
      .order("date", {
        ascending: false
      })
      .order("created_at", {
        ascending: false
      });


  if (error) {
    handleDbError(error);
    return;
  }


  state.transactions =
    data || [];


  state.items =
    state.transactions.flatMap(
      transaction =>
        transaction.transaction_items || []
    );


  const {
    data: budgets,
    error: budgetError
  } =
    await supabaseClient
      .from("budgets")
      .select("*")
      .eq(
        "month",
        state.selectedMonth
      )
      .order("amount", {
        ascending: false
      });


  if (budgetError) {
    handleDbError(budgetError);
    return;
  }


  state.budgets =
    budgets || [];
}


/* =========================================================
   RENDER EVERYTHING
========================================================= */

function renderEverything() {
  setMonthUI();

  populateCategoryFilters();
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

  const income = sum(
    state.transactions
      .filter(x => x.type === "income")
      .map(x => Number(x.amount))
  );

  const expenses = sum(
    state.transactions
      .filter(x => x.type === "expense")
      .map(x => Number(x.amount))
  );

  const balance = calculateAllTimeBalance();

  const remaining = income - expenses;


  $("#balance-value").textContent = money(balance);

  $("#income-value").textContent = money(income);

  $("#expense-value").textContent = money(expenses);

  $("#remaining-value").textContent = money(remaining);


  renderCategoryOverview();

  renderRecentTransactions();

  renderInsights();
}


function calculateAllTimeBalance() {

  const income = state.transactions
    .filter(x => x.type === "income")
    .reduce(
      (total, item) => total + Number(item.amount),
      0
    );

  const expense = state.transactions
    .filter(x => x.type === "expense")
    .reduce(
      (total, item) => total + Number(item.amount),
      0
    );

  return income - expense;
}


function renderCategoryOverview() {

  const container = $("#category-overview");

  const grouped = groupExpensesByCategory();

  if (!grouped.length) {
    container.innerHTML = emptyState("В этом месяце расходов пока нет.");
    return;
  }

  const total = grouped.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  container.innerHTML = grouped
    .slice(0, 7)
    .map(item => {

      const percent = total
        ? Math.round(item.amount / total * 100)
        : 0;

      return `
        <div class="category-row">
          <div class="category-main">
            <div class="category-name">
              <span>${escapeHtml(item.name)}</span>
              <span>${money(item.amount)} · ${percent}%</span>
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
    })
    .join("");
}


function groupExpensesByCategory() {

  const map = new Map();

  for (const transaction of state.transactions) {

    if (transaction.type !== "expense") {
      continue;
    }

    const items = transaction.transaction_items || [];

    if (!items.length) {

      const name =
        transaction.category?.name ||
        "Без категории";

      map.set(
        name,
        (map.get(name) || 0) + Number(transaction.amount)
      );

      continue;
    }

    for (const item of items) {

      const name =
        item.category?.name ||
        "Без категории";

      map.set(
        name,
        (map.get(name) || 0) + Number(item.amount)
      );
    }
  }

  return [...map.entries()]
    .map(([name, amount]) => ({
      name,
      amount
    }))
    .sort((a, b) => b.amount - a.amount);
}


/* =========================================================
   TRANSACTIONS
========================================================= */

function renderRecentTransactions() {

  const container = $("#recent-transactions");

  const transactions = state.transactions.slice(0, 6);

  renderTransactionList(container, transactions);
}


function renderTransactions() {

  const container = $("#all-transactions");

  if (!container) {
    return;
  }

  const search = $("#transaction-search")
    .value
    .trim()
    .toLowerCase();

  const type = $("#transaction-type-filter").value;

  const category = $("#transaction-category-filter").value;


  const filtered = state.transactions.filter(transaction => {

    if (type !== "all" && transaction.type !== type) {
      return false;
    }

    if (
      category !== "all" &&
      transaction.category_id !== category
    ) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      transaction.merchant,
      transaction.income_source,
      transaction.comment,
      transaction.category?.name,
      ...(transaction.transaction_items || []).map(x => x.name)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });


  renderTransactionList(container, filtered);
}


function renderTransactionList(container, transactions) {

  if (!transactions.length) {
    container.innerHTML = emptyState("Операций не найдено.");
    return;
  }


  container.innerHTML = transactions
    .map(transaction => {

      const isIncome = transaction.type === "income";

      const title =
        isIncome
          ? transaction.income_source || "Доход"
          : transaction.merchant || "Расход";

      const itemNames =
        (transaction.transaction_items || [])
          .map(item => item.name)
          .slice(0, 3)
          .join(", ");

      const subtitle = [
        formatDateHuman(transaction.date),
        transaction.category?.name,
        itemNames
      ]
        .filter(Boolean)
        .join(" · ");


      return `
        <div class="transaction-row">

          <div class="transaction-icon">
            ${isIncome ? "+" : "−"}
          </div>

          <div>
            <div class="transaction-title">
              ${escapeHtml(title)}
            </div>

            <div class="transaction-subtitle">
              ${escapeHtml(subtitle)}
            </div>
          </div>

          <div class="transaction-amount ${transaction.type}">
            ${isIncome ? "+" : "−"}${money(transaction.amount)}
          </div>

          <div class="transaction-actions">

            <button
              class="icon-button"
              data-edit-transaction="${transaction.id}"
              title="Редактировать"
            >✎</button>

            <button
              class="icon-button"
              data-delete-transaction="${transaction.id}"
              title="Удалить"
            >×</button>

          </div>

        </div>
      `;
    })
    .join("");


  container
    .querySelectorAll("[data-edit-transaction]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const transaction = state.transactions.find(
          x => x.id === button.dataset.editTransaction
        );

        if (transaction) {
          openTransactionModal(
            transaction.type,
            transaction
          );
        }
      });
    });


  container
    .querySelectorAll("[data-delete-transaction]")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteTransaction(button.dataset.deleteTransaction);
      });
    });
}


/* =========================================================
   TRANSACTION MODAL
========================================================= */

function openTransactionModal(type = "expense", transaction = null) {

  state.editingTransaction = transaction;

  $("#transaction-id").value =
    transaction?.id || "";

  $("#transaction-amount").value =
    transaction?.amount || "";

  $("#transaction-date").value =
    transaction?.date ||
    formatDate(new Date());

  $("#transaction-merchant").value =
    transaction?.merchant || "";

  $("#transaction-income-source").value =
    transaction?.income_source || "";

  $("#transaction-comment").value =
    transaction?.comment || "";

  $("#transaction-items").innerHTML = "";

  state.items = [];


  setTransactionType(type);


  if (
    transaction?.type === "expense" &&
    transaction.transaction_items?.length
  ) {

    for (const item of transaction.transaction_items) {
      addItemRow(item);
    }

  } else if (!transaction) {

    addItemRow();

  }


  updateItemsTotal();

  $("#transaction-modal-eyebrow").textContent =
    transaction
      ? "Редактирование"
      : "Новая операция";

  $("#transaction-modal-title").textContent =
    type === "income"
      ? "Доход"
      : "Расход";

  openModal("transaction-modal");
}


function setTransactionType(type) {

  state.transactionType = type;

  $$(".transaction-type").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.transactionType === type
    );
  });


  $$(".expense-only").forEach(element => {
    element.classList.toggle(
      "hidden",
      type !== "expense"
    );
  });


  $$(".income-only").forEach(element => {
    element.classList.toggle(
      "hidden",
      type !== "income"
    );
  });


  $("#transaction-modal-title").textContent =
    type === "income"
      ? "Доход"
      : "Расход";

  updateItemsTotal();
}


function addItemRow(item = null) {

  const row = document.createElement("div");

  row.className = "item-row";

  row.innerHTML = `

    <label>
      Товар
      <input
        class="item-name"
        placeholder="Например, мясо"
        value="${escapeAttribute(item?.name || "")}"
        required
      >
    </label>

    <label>
      Сумма
      <input
        class="item-amount"
        type="number"
        min="0.01"
        step="0.01"
        placeholder="0"
        value="${item?.amount || ""}"
        required
      >
    </label>

    <label class="item-category">
      Категория
      <select class="item-category-select">
        ${renderCategoryOptions(
          "expense",
          item?.category_id || ""
        )}
      </select>
    </label>

    <button
      class="icon-button"
      type="button"
      data-remove-item
      title="Удалить"
    >×</button>

  `;

  $("#transaction-items").appendChild(row);

  updateItemsTotal();
}


function updateItemsTotal() {

  const rows = $$("#transaction-items .item-row");

  let total = 0;

  rows.forEach(row => {
    total += Number(
      row.querySelector(".item-amount")?.value || 0
    );
  });

  $("#items-total").textContent = money(total);

  const transactionAmount =
    Number($("#transaction-amount").value || 0);


  const validation = $("#items-validation");

  if (state.transactionType !== "expense" || !rows.length) {
    validation.textContent = "";
    validation.className = "validation-message";
    return;
  }


  if (!transactionAmount) {
    validation.textContent = "";
    validation.className = "validation-message";
    return;
  }


  const difference =
    Math.round((total - transactionAmount) * 100) / 100;


  if (difference === 0) {

    validation.textContent =
      "Состав покупки совпадает с общей суммой.";

    validation.className =
      "validation-message success";

  } else {

    validation.textContent =
      `Состав отличается на ${money(Math.abs(difference))}.`;

    validation.className =
      "validation-message error";
  }
}


$("#transaction-amount")?.addEventListener(
  "input",
  updateItemsTotal
);


/* =========================================================
   SAVE TRANSACTION
========================================================= */

async function saveTransaction(event) {

  event.preventDefault();

  const id =
    $("#transaction-id").value || null;

  const type =
    state.transactionType;

  const amount =
    Number($("#transaction-amount").value);

  const date =
    $("#transaction-date").value;

  const merchant =
    $("#transaction-merchant").value.trim() || null;

  const incomeSource =
    $("#transaction-income-source").value.trim() || null;

  const comment =
    $("#transaction-comment").value.trim() || null;


  if (!amount || amount <= 0) {
    toast("Укажите сумму.");
    return;
  }


  if (!date) {
    toast("Укажите дату.");
    return;
  }


  let items = [];


  if (type === "expense") {

    const rows =
      $$("#transaction-items .item-row");


    for (const row of rows) {

      const name =
        row.querySelector(".item-name")
          .value
          .trim();

      const itemAmount =
        Number(
          row.querySelector(".item-amount")
            .value
        );

      const categoryId =
        row.querySelector(
          ".item-category-select"
        ).value || null;


      if (!name || !itemAmount) {
        toast("Заполните позицию покупки.");
        return;
      }


      items.push({
        name,
        amount: itemAmount,
        category_id: categoryId
      });
    }


    if (items.length > 0) {

      const itemsTotal =
        items.reduce(
          (total, item) =>
            total + item.amount,
          0
        );


      if (
        Math.round(itemsTotal * 100) !==
        Math.round(amount * 100)
      ) {
        toast(
          "Сумма позиций должна совпадать с общей суммой."
        );

        return;
      }
    }
  }


  const transactionPayload = {
    type,
    amount,
    date,
    merchant:
      type === "expense"
        ? merchant
        : null,
    income_source:
      type === "income"
        ? incomeSource
        : null,
    comment
  };


  let transactionId =
    id;


  if (id) {

    const {
      error
    } =
      await supabaseClient
        .from("transactions")
        .update(transactionPayload)
        .eq("id", id);


    if (error) {
      handleDbError(error);
      return;
    }


    const {
      error: itemsDeleteError
    } =
      await supabaseClient
        .from("transaction_items")
        .delete()
        .eq(
          "transaction_id",
          id
        );


    if (itemsDeleteError) {
      handleDbError(itemsDeleteError);
      return;
    }

  } else {

    const {
      data,
      error
    } =
      await supabaseClient
        .from("transactions")
        .insert(transactionPayload)
        .select("id")
        .single();


    if (error) {
      handleDbError(error);
      return;
    }


    transactionId =
      data.id;
  }


  if (items.length > 0) {

    const payload =
      items.map(item => ({
        transaction_id:
          transactionId,

        name:
          item.name,

        amount:
          item.amount,

        category_id:
          item.category_id
      }));


    const {
      error
    } =
      await supabaseClient
        .from("transaction_items")
        .insert(payload);


    if (error) {
      handleDbError(error);
      return;
    }
  }


  if (merchant) {
    await rememberMerchant(merchant);
  }


  closeModal(
    "transaction-modal"
  );


  toast(
    id
      ? "Операция обновлена."
      : "Операция сохранена."
  );


  await loadReferenceData();

  await loadMonthData();

  renderEverything();
}


/* =========================================================
   DELETE TRANSACTION
========================================================= */

async function deleteTransaction(id) {

  if (!confirm("Удалить эту операцию?")) {
    return;
  }


  const { error } = await supabaseClient
    .from("transactions")
    .delete()
    .eq("id", id);


  if (error) {
    handleDbError(error);
    return;
  }


  toast("Операция удалена.");

  await loadMonthData();

  renderEverything();
}


/* =========================================================
   CATEGORIES
========================================================= */

async function addCategory(event) {

  event.preventDefault();

  const name =
    $("#new-category-name").value.trim();

  const type =
    $("#new-category-type").value;

  if (!name) {
    return;
  }


  const { error } = await supabaseClient
    .from("categories")
    .insert({
      name,
      type
    });


  if (error) {
    handleDbError(error);
    return;
  }


  $("#new-category-name").value = "";

  await loadReferenceData();

  renderSettings();

  populateCategoryFilters();

  toast("Категория добавлена.");
}


async function deleteCategory(id) {

  if (
    !confirm(
      "Удалить категорию? Существующие операции не будут удалены."
    )
  ) {
    return;
  }


  const { error } = await supabaseClient
    .from("categories")
    .delete()
    .eq("id", id);


  if (error) {
    handleDbError(error);
    return;
  }


  await loadReferenceData();

  renderSettings();

  populateCategoryFilters();

  toast("Категория удалена.");
}


function renderSettings() {

  const categories = $("#categories-settings");

  categories.innerHTML =
    state.categories
      .map(category => `
        <div class="setting-row">
          <div>
            <strong>${escapeHtml(category.name)}</strong>
            <span>${category.type === "expense" ? "Расход" : "Доход"}</span>
          </div>

          <button
            class="icon-button"
            data-delete-category="${category.id}"
          >×</button>
        </div>
      `)
      .join("") ||
    emptyState("Категорий пока нет.");


  categories
    .querySelectorAll("[data-delete-category]")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteCategory(button.dataset.deleteCategory);
      });
    });


  const merchants = $("#merchants-settings");

  merchants.innerHTML =
    state.merchants
      .map(merchant => `
        <div class="setting-row">
          <div>
            <strong>${escapeHtml(merchant.name)}</strong>
          </div>

          <button
            class="icon-button"
            data-delete-merchant="${merchant.id}"
          >×</button>
        </div>
      `)
      .join("") ||
    emptyState("Магазинов пока нет.");


  merchants
    .querySelectorAll("[data-delete-merchant]")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteMerchant(button.dataset.deleteMerchant);
      });
    });
}


/* =========================================================
   MERCHANTS
========================================================= */

async function addMerchant(event) {

  event.preventDefault();

  const name =
    $("#new-merchant-name").value.trim();

  if (!name) {
    return;
  }


  const { error } = await supabaseClient
    .from("merchants")
    .insert({
      name
    });


  if (error) {
    handleDbError(error);
    return;
  }


  $("#new-merchant-name").value = "";

  await loadReferenceData();

  renderSettings();

  populateMerchantOptions();

  toast("Магазин добавлен.");
}


async function rememberMerchant(name) {

  const normalized = name.trim();

  if (!normalized) {
    return;
  }


  const exists = state.merchants.some(
    merchant =>
      merchant.name.toLowerCase() === normalized.toLowerCase()
  );

  if (exists) {
    return;
  }


  const { error } = await supabaseClient
    .from("merchants")
    .insert({
      name: normalized
    });


  if (error) {
    console.error(error);
  }
}


async function deleteMerchant(id) {

  if (!confirm("Удалить магазин из справочника?")) {
    return;
  }


  const { error } = await supabaseClient
    .from("merchants")
    .delete()
    .eq("id", id);


  if (error) {
    handleDbError(error);
    return;
  }


  await loadReferenceData();

  renderSettings();

  populateMerchantOptions();

  toast("Магазин удалён.");
}


/* =========================================================
   BUDGETS
========================================================= */

function openBudgetModal() {

  const expenseCategories =
    state.categories.filter(
      category => category.type === "expense"
    );


  $("#budget-category").innerHTML =
    expenseCategories
      .map(category => `
        <option value="${category.id}">
          ${escapeHtml(category.name)}
        </option>
      `)
      .join("");


  $("#budget-amount").value = "";

  openModal("budget-modal");
}


async function saveBudget(event) {

  event.preventDefault();

  const categoryId =
    $("#budget-category").value;

  const amount =
    Number($("#budget-amount").value);


  if (!categoryId || !amount || amount <= 0) {
    return;
  }


  const { error } = await supabaseClient
    .from("budgets")
    .upsert({
      month: state.selectedMonth,
      category_id: categoryId,
      amount
    }, {
      onConflict: "user_id,month,category_id"
    });


  if (error) {
    handleDbError(error);
    return;
  }


  closeModal("budget-modal");

  await loadReferenceData();

  await loadMonthData();

  renderBudgets();

  toast("Лимит сохранён.");
}


function renderBudgets() {

  const container = $("#budgets-list");

  if (!state.budgets.length) {

    container.innerHTML = `
      <div class="panel">
        ${emptyState("Лимитов на этот месяц пока нет.")}
      </div>
    `;

    return;
  }


  const expensesByCategory =
    getExpenseAmountsByCategory();


  container.innerHTML =
    state.budgets
      .map(budget => {

        const category =
          state.categories.find(
            x => x.id === budget.category_id
          );

        const spent =
          expensesByCategory.get(budget.category_id) || 0;

        const limit =
          Number(budget.amount);

        const percent =
          limit
            ? Math.round(spent / limit * 100)
            : 0;

        const width =
          Math.min(percent, 100);

        return `
          <article class="budget-card">

            <div class="budget-header">
              <div>
                <strong>
                  ${escapeHtml(category?.name || "Категория")}
                </strong>

                <span>
                  ${money(limit)} лимит
                </span>
              </div>

              <span class="budget-percent">
                ${percent}%
              </span>
            </div>

            <div class="progress">
              <div
                class="progress-bar"
                style="width:${width}%"
              ></div>
            </div>

            <div class="budget-numbers">
              <span>Потрачено ${money(spent)}</span>
              <span>
                ${spent > limit
                  ? `Превышение ${money(spent - limit)}`
                  : `Осталось ${money(limit - spent)}`}
              </span>
            </div>

          </article>
        `;
      })
      .join("");
}


function getExpenseAmountsByCategory() {

  const map = new Map();

  for (const transaction of state.transactions) {

    if (transaction.type !== "expense") {
      continue;
    }


    const items =
      transaction.transaction_items || [];


    if (!items.length) {
      continue;
    }


    for (const item of items) {

      if (!item.category_id) {
        continue;
      }

      map.set(
        item.category_id,
        (map.get(item.category_id) || 0) +
        Number(item.amount)
      );
    }
  }

  return map;
}


/* =========================================================
   ANALYTICS
========================================================= */

async function renderAnalytics() {

  const transactions =
    await getAnalyticsTransactions();


  renderAnalyticsCategories(transactions);

  renderAnalyticsMerchants(transactions);

  renderAnalyticsItems(transactions);
}


async function getAnalyticsTransactions() {

  const { start, end } =
    getAnalyticsDateRange();


  const { data, error } =
    await supabaseClient
      .from("transactions")
      .select(`
        *,
        transaction_items (
          id,
          name,
          amount,
          category_id,
          category:categories (
            id,
            name,
            type
          )
        ),
        category:categories (
          id,
          name,
          type
        )
      `)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });


  if (error) {
    handleDbError(error);
    return [];
  }


  return data || [];
}


function getAnalyticsDateRange() {

  const [year, month] =
    state.selectedMonth.split("-").map(Number);


  if (state.analyticsPeriod === "month") {

    return {
      start: `${year}-${pad(month)}-01`,
      end: formatDate(
        new Date(year, month, 0)
      )
    };
  }


  if (state.analyticsPeriod === "3months") {

    const startDate =
      new Date(year, month - 3, 1);

    const endDate =
      new Date(year, month, 0);


    return {
      start: formatDate(startDate),
      end: formatDate(endDate)
    };
  }


  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`
  };
}


function renderAnalyticsCategories(transactions) {

  const container =
    $("#analytics-categories");

  const map = new Map();


  for (const transaction of transactions) {

    if (transaction.type !== "expense") {
      continue;
    }


    const items =
      transaction.transaction_items || [];


    if (!items.length) {

      const name =
        transaction.category?.name ||
        "Без категории";

      map.set(
        name,
        (map.get(name) || 0) +
        Number(transaction.amount)
      );

    } else {

      for (const item of items) {

        const name =
          item.category?.name ||
          "Без категории";

        map.set(
          name,
          (map.get(name) || 0) +
          Number(item.amount)
        );
      }
    }
  }


  const entries =
    [...map.entries()]
      .map(([name, amount]) => ({
        name,
        amount
      }))
      .sort((a, b) => b.amount - a.amount);


  const total =
    entries.reduce(
      (sum, item) => sum + item.amount,
      0
    );


  $("#analytics-category-caption").textContent =
    `Всего: ${money(total)}`;


  if (!entries.length) {
    container.innerHTML =
      emptyState("Нет расходов за выбранный период.");
    return;
  }


  container.innerHTML =
    entries
      .map(item => {

        const percent =
          total
            ? Math.round(item.amount / total * 100)
            : 0;

        return `
          <div class="analytics-item">
            <div>
              <strong>${escapeHtml(item.name)}</strong>

              <div class="progress" style="margin-top:8px">
                <div
                  class="progress-bar"
                  style="width:${percent}%"
                ></div>
              </div>
            </div>

            <span>
              ${money(item.amount)} · ${percent}%
            </span>
          </div>
        `;
      })
      .join("");
}


function renderAnalyticsMerchants(transactions) {

  const container =
    $("#analytics-merchants");

  const map = new Map();


  for (const transaction of transactions) {

    if (
      transaction.type !== "expense" ||
      !transaction.merchant
    ) {
      continue;
    }


    map.set(
      transaction.merchant,
      (map.get(transaction.merchant) || 0) +
      Number(transaction.amount)
    );
  }


  const entries =
    [...map.entries()]
      .map(([name, amount]) => ({
        name,
        amount
      }))
      .sort((a, b) => b.amount - a.amount);


  if (!entries.length) {
    container.innerHTML =
      emptyState("Нет данных о местах покупок.");
    return;
  }


  container.innerHTML =
    entries
      .slice(0, 15)
      .map(item => `
        <div class="analytics-item">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${money(item.amount)}</span>
        </div>
      `)
      .join("");
}


function renderAnalyticsItems(transactions) {

  const container =
    $("#analytics-items");

  const map = new Map();


  for (const transaction of transactions) {

    if (transaction.type !== "expense") {
      continue;
    }


    for (const item of transaction.transaction_items || []) {

      map.set(
        item.name,
        (map.get(item.name) || 0) +
        Number(item.amount)
      );
    }
  }


  const entries =
    [...map.entries()]
      .map(([name, amount]) => ({
        name,
        amount
      }))
      .sort((a, b) => b.amount - a.amount);


  if (!entries.length) {
    container.innerHTML =
      emptyState("Детализированных позиций пока нет.");
    return;
  }


  container.innerHTML =
    entries
      .slice(0, 30)
      .map(item => `
        <div class="analytics-item">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${money(item.amount)}</span>
        </div>
      `)
      .join("");
}


/* =========================================================
   INSIGHTS
========================================================= */

function renderInsights() {

  const container = $("#insights");

  const categories =
    groupExpensesByCategory();


  if (!categories.length) {

    container.innerHTML = `
      <div class="insight">
        <strong>Пока нечего анализировать</strong>
        <p>
          Добавьте несколько расходов, и здесь появятся
          автоматически найденные изменения.
        </p>
      </div>
    `;

    return;
  }


  const biggest =
    categories[0];


  const expensiveItem =
    getMostExpensiveItem();


  const transactionCount =
    state.transactions.filter(
      x => x.type === "expense"
    ).length;


  const insights = [];


  insights.push({
    title: "Самая крупная категория",
    text:
      `${biggest.name}: ${money(biggest.amount)} за месяц.`
  });


  if (expensiveItem) {

    insights.push({
      title: "Крупнейшая позиция",
      text:
        `${expensiveItem.name}: ${money(expensiveItem.amount)}.`
    });

  } else {

    insights.push({
      title: "Детализация",
      text:
        "Разбирайте чеки на позиции, чтобы видеть конкретные товары."
    });
  }


  insights.push({
    title: "Количество расходов",
    text:
      `${transactionCount} операций за выбранный месяц.`
  });


  container.innerHTML =
    insights
      .map(item => `
        <div class="insight">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.text)}</p>
        </div>
      `)
      .join("");
}


function getMostExpensiveItem() {

  let result = null;


  for (const transaction of state.transactions) {

    if (transaction.type !== "expense") {
      continue;
    }


    for (const item of transaction.transaction_items || []) {

      if (
        !result ||
        Number(item.amount) > result.amount
      ) {
        result = {
          name: item.name,
          amount: Number(item.amount)
        };
      }
    }
  }


  return result;
}


/* =========================================================
   FILTERS / OPTIONS
========================================================= */

function populateCategoryFilters() {

  const filter =
    $("#transaction-category-filter");

  const current =
    filter.value;


  filter.innerHTML =
    `<option value="all">Все категории</option>` +
    state.categories
      .filter(x => x.type === "expense")
      .map(category => `
        <option value="${category.id}">
          ${escapeHtml(category.name)}
        </option>
      `)
      .join("");


  filter.value =
    [...filter.options].some(
      option => option.value === current
    )
      ? current
      : "all";
}


function populateMerchantOptions() {

  $("#merchant-options").innerHTML =
    state.merchants
      .map(merchant => `
        <option value="${escapeAttribute(merchant.name)}">
      `)
      .join("");
}


function renderCategoryOptions(type, selected = "") {

  return `
    <option value="">Без категории</option>

    ${state.categories
      .filter(category => category.type === type)
      .map(category => `
        <option
          value="${category.id}"
          ${category.id === selected ? "selected" : ""}
        >
          ${escapeHtml(category.name)}
        </option>
      `)
      .join("")}
  `;
}


/* =========================================================
   EXPORT
========================================================= */

async function exportData() {

  const [
    transactions,
    categories,
    merchants,
    budgets
  ] = await Promise.all([

    fetchAll("transactions", "*"),

    fetchAll("categories", "*"),

    fetchAll("merchants", "*"),

    fetchAll("budgets", "*")
  ]);


  const items =
    await fetchAll("transaction_items", "*");


  const payload = {
    exported_at: new Date().toISOString(),

    user_id: state.user.id,

    transactions,
    transaction_items: items,
    categories,
    merchants,
    budgets
  };


  const blob =
    new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json" }
    );


  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;

  anchor.download =
    `money-tracker-${new Date().toISOString().slice(0, 10)}.json`;

  anchor.click();

  URL.revokeObjectURL(url);

  toast("Данные экспортированы.");
}


async function fetchAll(table, columns) {

  const { data, error } =
    await supabaseClient
      .from(table)
      .select(columns);


  if (error) {
    handleDbError(error);
    return [];
  }


  return data || [];
}


/* =========================================================
   MONTH
========================================================= */

function setMonthUI() {

  const [year, month] =
    state.selectedMonth.split("-").map(Number);

  const text =
    `${MONTH_NAMES[month - 1]} ${year}`;


  $("#month-picker-button").textContent =
    text;

  $("#dashboard-month-title").textContent =
    text;
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {
  $(`#${id}`).classList.remove("hidden");
}

function closeModal(id) {
  $(`#${id}`).classList.add("hidden");
}


/* =========================================================
   UTILITIES
========================================================= */

function getMonthKey(date) {

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1)
  ].join("-");
}


function formatDate(date) {

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}


function formatDateHuman(dateString) {

  const [year, month, day] =
    dateString.split("-").map(Number);

  return `${pad(day)}.${pad(month)}.${year}`;
}


function pad(value) {
  return String(value).padStart(2, "0");
}


function money(value) {

  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0
    }
  ).format(Number(value) || 0);
}


function sum(values) {
  return values.reduce(
    (total, value) => total + Number(value),
    0
  );
}


function emptyState(text) {

  return `
    <div class="empty-state">
      ${escapeHtml(text)}
    </div>
  `;
}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {
  return escapeHtml(value);
}


function toast(message) {

  const element =
    document.createElement("div");

  element.className = "toast";

  element.textContent = message;

  $("#toast-container").appendChild(element);


  setTimeout(() => {
    element.remove();
  }, 3000);
}


function handleDbError(error) {

  console.error(error);

  toast(
    error?.message ||
    "Произошла ошибка при работе с базой данных."
  );
}