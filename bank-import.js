"use strict";

window.FinTrackerBankImport = (() => {

  const R =
    window.FinTrackerBankRules;

  const RULES_KEY =
    "fintracker.bankImport.rules.v1";

  let supabaseClient = null;

  let categories = [];

  let existingTransactions = [];

  let prepared = [];


  const $ =
    selector =>
      document.querySelector(
        selector
      );


  function getClient() {

    if (supabaseClient) {
      return supabaseClient;
    }

    supabaseClient =
      window.supabase.createClient(

        window.APP_CONFIG
          .SUPABASE_URL,

        window.APP_CONFIG
          .SUPABASE_ANON_KEY

      );

    return supabaseClient;
  }


  function getRules() {

    try {

      return JSON.parse(
        localStorage.getItem(
          RULES_KEY
        ) || "[]"
      );

    } catch {

      return [];

    }

  }


  function findCategory(
    name,
    type
  ) {

    if (!name) {
      return null;
    }

    const normalized =
      R.clean(name)
        .toLowerCase();


    return (
      categories.find(
        category =>

          category.type === type &&

          category.parent_id === null &&

          R.clean(
            category.name
          ).toLowerCase() ===
            normalized
      ) || null
    );

  }


  function classify(
    operation
  ) {

    const categoryName =
      R.findRuleCategory(
        operation,
        getRules()
      );


    let category =
      findCategory(
        categoryName,
        operation.type === "income"
          ? "income"
          : "expense"
      );


    if (
      !category &&
      operation.type === "expense"
    ) {

      category =
        findCategory(
          "Прочее",
          "expense"
        );

    }


    return {

      ...operation,

      categoryId:
        category?.id || null,

      categoryName:
        category?.name ||
        "Без категории",

      autoCategory:
        Boolean(
          categoryName &&
          category
        )

    };

  }


  async function loadReferenceData() {

    const client =
      getClient();


    const [
      categoriesResult,
      transactionsResult
    ] =
      await Promise.all([

        client
          .from("categories")
          .select("*")
          .order("name"),

        client
          .from("transactions")
          .select(
            "id,date,type,amount,merchant,comment"
          )

      ]);


    if (
      categoriesResult.error
    ) {
      throw categoriesResult.error;
    }


    if (
      transactionsResult.error
    ) {
      throw transactionsResult.error;
    }


    categories =
      categoriesResult.data || [];

    existingTransactions =
      transactionsResult.data || [];

  }


  function existingFingerprint(
    transaction
  ) {

    return R.makeFingerprint({

      date:
        transaction.date,

      amount:
        Number(
          transaction.amount
        ),

      type:
        transaction.type,

      merchant:
        transaction.merchant,

      description:
        transaction.comment || ""

    });

  }


  function prepare(
    operations
  ) {

    const duplicateSet =
      new Set(
        existingTransactions.map(
          existingFingerprint
        )
      );


    prepared =
      operations.map(
        operation => {

          const item =
            classify(
              operation
            );


          const fingerprint =
            R.makeFingerprint(
              item
            );


          const duplicate =
            duplicateSet.has(
              fingerprint
            );


          return {

            ...item,

            fingerprint,

            duplicate,

            selected:
              !duplicate,

            valid:
              Boolean(

                item.date &&

                Number.isFinite(
                  Number(
                    item.amount
                  )
                ) &&

                item.type !==
                  "unknown" &&

                item.type !==
                  "transfer" &&

                item.categoryId

              )

          };

        }
      );


    return prepared;

  }


  function buildPayload(
    item
  ) {

    return {

      type:
        item.type,

      amount:
        Math.abs(
          Number(item.amount)
        ),

      date:
        item.date,

      merchant:
        item.type === "expense"
          ? (
              item.merchant ||
              null
            )
          : null,

      income_source:
        item.type === "income"
          ? (
              item.merchant ||
              null
            )
          : null,

      comment:
        item.description ||
        null,

      category_id:
        item.categoryId

    };

  }


  async function importSelected() {

    const selected =
      prepared.filter(
        item =>

          item.selected &&

          !item.duplicate &&

          item.valid
      );


    if (!selected.length) {

      throw new Error(
        "Нет операций для импорта."
      );

    }


    const client =
      getClient();


    const payloads =
      selected.map(
        buildPayload
      );


    const CHUNK_SIZE =
      100;


    for (
      let i = 0;
      i < payloads.length;
      i += CHUNK_SIZE
    ) {

      const chunk =
        payloads.slice(
          i,
          i + CHUNK_SIZE
        );


      const {
        error
      } =
        await client
          .from("transactions")
          .insert(chunk);


      if (error) {
        throw error;
      }

    }


    return selected.length;

  }


  function escapeHtml(
    value
  ) {

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


  function formatMoney(
    value
  ) {

    return (
      new Intl.NumberFormat(
        "ru-RU",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      ).format(
        Number(value) || 0
      ) +
      " ₽"
    );

  }


  function categoryOptions(
    item
  ) {

    const type =
      item.type === "income"
        ? "income"
        : "expense";


    return categories

      .filter(
        category =>

          category.type ===
            type &&

          category.parent_id ===
            null
      )

      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name,
            "ru"
          )
      )

      .map(
        category => `

          <option
            value="${escapeHtml(
              category.id
            )}"
            ${
              category.id ===
              item.categoryId
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(
              category.name
            )}
          </option>

        `
      )

      .join("");

  }


  function renderPreview() {

    const content =
      $("#bank-import-content");


    if (!content) {
      return;
    }


    const duplicates =
      prepared.filter(
        item =>
          item.duplicate
      ).length;


    const ready =
      prepared.filter(
        item =>

          item.selected &&
          item.valid &&
          !item.duplicate
      ).length;


    const invalid =
      prepared.filter(
        item =>
          !item.valid &&
          !item.duplicate
      ).length;


    content.innerHTML = `

      <div
        class="bank-import-summary"
      >

        <div>
          Найдено
          <strong>
            ${prepared.length}
          </strong>
        </div>

        <div>
          Новых
          <strong>
            ${ready}
          </strong>
        </div>

        <div>
          Дубликатов
          <strong>
            ${duplicates}
          </strong>
        </div>

        <div>
          Проверить
          <strong>
            ${invalid}
          </strong>
        </div>

      </div>


      <div
        class="bank-import-table-wrap"
      >

        <table
          class="bank-import-table"
        >

          <thead>

            <tr>
              <th></th>
              <th>Дата</th>
              <th>Описание</th>
              <th>Сумма</th>
              <th>Тип</th>
              <th>Категория</th>
              <th></th>
            </tr>

          </thead>


          <tbody>

            ${prepared.map(
              (item, index) => `

                <tr>

                  <td>

                    <input
                      type="checkbox"
                      data-import-index="${index}"
                      ${
                        item.selected
                          ? "checked"
                          : ""
                      }
                      ${
                        item.duplicate ||
                        !item.valid
                          ? "disabled"
                          : ""
                      }
                    >

                  </td>


                  <td>
                    ${escapeHtml(
                      item.date
                    )}
                  </td>


                  <td
                    title="${escapeHtml(
                      item.description
                    )}"
                  >
                    ${escapeHtml(
                      item.merchant ||
                      item.description ||
                      "—"
                    )}
                  </td>


                  <td>
                    ${formatMoney(
                      item.amount
                    )}
                  </td>


                  <td>

                    ${
                      item.type ===
                      "income"
                        ? "Доход"
                        : item.type ===
                          "expense"
                          ? "Расход"
                          : item.type ===
                            "transfer"
                            ? "Перевод"
                            : "?"
                    }

                  </td>


                  <td>

                    ${
                      item.valid

                        ? `

                          <select
                            data-import-category="${index}"
                          >

                            ${categoryOptions(
                              item
                            )}

                          </select>

                        `

                        : `

                          ${
                            item.duplicate
                              ? "Дубликат"
                              : "Нужно проверить"
                          }

                        `
                    }

                  </td>


                  <td>

                    ${
                      item.autoCategory
                        ? "Авто"
                        : "Ручн."
                    }

                  </td>

                </tr>

              `
            ).join("")}

          </tbody>

        </table>

      </div>

    `;


    content
      .querySelectorAll(
        "[data-import-index]"
      )
      .forEach(
        checkbox => {

          checkbox.addEventListener(
            "change",
            event => {

              prepared[
                Number(
                  event.target
                    .dataset
                    .importIndex
                )
              ].selected =
                event.target.checked;

              updateStats();

            }
          );

        }
      );


    content
      .querySelectorAll(
        "[data-import-category]"
      )
      .forEach(
        select => {

          select.addEventListener(
            "change",
            event => {

              const index =
                Number(
                  event.target
                    .dataset
                    .importCategory
                );


              const item =
                prepared[index];


              item.categoryId =
                event.target.value ||
                null;


              item.valid =
                Boolean(
                  item.date &&
                  item.categoryId &&
                  item.type !==
                    "unknown" &&
                  item.type !==
                    "transfer"
                );


              updateStats();

            }
          );

        }
      );


    updateStats();

  }


  function updateStats() {

    const ready =
      prepared.filter(
        item =>

          item.selected &&
          item.valid &&
          !item.duplicate
      ).length;


    const duplicates =
      prepared.filter(
        item =>
          item.duplicate
      ).length;


    const invalid =
      prepared.filter(
        item =>
          !item.valid &&
          !item.duplicate
      ).length;


    const stats =
      document.querySelectorAll(
        "#bank-import-content strong"
      );


    if (stats.length >= 4) {

      stats[0].textContent =
        prepared.length;

      stats[1].textContent =
        ready;

      stats[2].textContent =
        duplicates;

      stats[3].textContent =
        invalid;

    }


    const submit =
      $("#bank-import-submit");


    if (submit) {

      submit.textContent =
        `Импортировать ${ready}`;

      submit.classList.toggle(
        "hidden",
        ready === 0
      );

    }

  }


  async function handleFile(
    event
  ) {

    const file =
      event.target.files?.[0];


    if (!file) {
      return;
    }


    try {

      await loadReferenceData();


      const parsed =
        await window
          .FinTrackerExcelParser
          .readFile(file);


      prepare(
        parsed.operations
      );


      $("#bank-import-start")
        ?.classList.add(
          "hidden"
        );


      $("#bank-import-content")
        ?.classList.remove(
          "hidden"
        );


      renderPreview();


    } catch (error) {

      console.error(error);


      const content =
        $("#bank-import-content");


      if (content) {

        content.classList.remove(
          "hidden"
        );

        content.innerHTML = `
          <p>
            ${escapeHtml(
              error.message ||
              "Не удалось прочитать файл."
            )}
          </p>
        `;

      }

    }

  }


  async function handleImport() {

    const button =
      $("#bank-import-submit");


    if (!button) {
      return;
    }


    button.disabled = true;

    button.textContent =
      "Импортируем...";


    try {

      const count =
        await importSelected();


      $("#bank-import-modal")
        ?.classList.add(
          "hidden"
        );


      alert(
        `Импортировано операций: ${count}`
      );


      location.reload();


    } catch (error) {

      console.error(error);


      alert(
        error.message ||
        "Импорт не удался."
      );


      button.disabled =
        false;

      updateStats();

    }

  }


  function injectStyles() {

    if (
      $("#bank-import-styles")
    ) {
      return;
    }


    const style =
      document.createElement(
        "style"
      );


    style.id =
      "bank-import-styles";


    style.textContent = `

      .bank-import-button {
        margin-left: 8px;
      }

      .bank-import-summary {
        display: grid;
        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );
        gap: 10px;
        margin: 16px 0;
      }

      .bank-import-summary > div {
        padding: 12px;
        border: 1px solid
          var(--border, #ddd);
        border-radius: 12px;
      }

      .bank-import-summary strong {
        display: block;
        font-size: 20px;
        margin-top: 4px;
      }

      .bank-import-table-wrap {
        max-height: 52vh;
        overflow: auto;
        border: 1px solid
          var(--border, #ddd);
        border-radius: 12px;
      }

      .bank-import-table {
        width: 100%;
        border-collapse:
          collapse;
        min-width: 780px;
      }

      .bank-import-table th,
      .bank-import-table td {
        padding: 9px 10px;
        border-bottom: 1px solid
          var(--border, #eee);
        text-align: left;
        vertical-align: middle;
      }

      .bank-import-table th {
        position: sticky;
        top: 0;
        background:
          var(--surface, #fff);
        z-index: 1;
      }

      @media (max-width: 700px) {

        .bank-import-summary {
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
        }

        .bank-import-button {
          margin-left: 0;
          margin-top: 8px;
        }

      }

    `;


    document.head.appendChild(
      style
    );

  }


  function createUI() {

    if (
      $("#bank-import-modal")
    ) {
      return;
    }


    injectStyles();


    const button =
      document.createElement(
        "button"
      );


    button.id =
      "bank-import-button";

    button.className =
      "secondary-button bank-import-button";

    button.type =
      "button";

    button.textContent =
      "Импорт выписки";


    const addButton =
      $("#transactions-add");


    if (
      addButton?.parentElement
    ) {

      addButton.parentElement
        .appendChild(button);

    }


    button.addEventListener(
      "click",
      () => {

        $("#bank-import-modal")
          ?.classList.remove(
            "hidden"
          );

      }
    );


    const modal =
      document.createElement(
        "div"
      );


    modal.id =
      "bank-import-modal";

    modal.className =
      "modal hidden";


    modal.innerHTML = `

      <div
        class="modal-backdrop"
      ></div>


      <div
        class="modal-card"
        style="
          max-width:1100px;
          width:calc(100% - 24px)
        "
      >

        <div
          class="modal-header"
        >

          <div>

            <p class="eyebrow">
              Банк
            </p>

            <h2>
              Импорт выписки
            </h2>

          </div>


          <button
            class="close-button"
            type="button"
            data-bank-import-close
          >
            ×
          </button>

        </div>


        <div
          id="bank-import-start"
        >

          <p>
            Загрузите XLS/XLSX.
            Файл читается локально
            в браузере.
          </p>

          <input
            id="bank-import-file"
            type="file"
            accept=".xlsx,.xls"
          >

        </div>


        <div
          id="bank-import-content"
          class="hidden"
        ></div>


        <div
          class="modal-actions"
        >

          <button
            class="secondary-button"
            type="button"
            data-bank-import-close
          >
            Отмена
          </button>


          <button
            id="bank-import-submit"
            class="primary-button hidden"
            type="button"
          >
            Импортировать
          </button>

        </div>

      </div>

    `;


    document.body.appendChild(
      modal
    );


    modal
      .querySelectorAll(
        "[data-bank-import-close]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              modal.classList.add(
                "hidden"
              );

            }
          );

        }
      );


    modal
      .querySelector(
        ".modal-backdrop"
      )
      ?.addEventListener(
        "click",
        () => {

          modal.classList.add(
            "hidden"
          );

        }
      );


    $("#bank-import-file")
      ?.addEventListener(
        "change",
        handleFile
      );


    $("#bank-import-submit")
      ?.addEventListener(
        "click",
        handleImport
      );

  }


  function init() {
    createUI();
  }


  return {
    init
  };

})();


document.addEventListener(
  "DOMContentLoaded",
  () => {

    window
      .FinTrackerBankImport
      .init();

  }
);