"use strict";

window.FinTrackerBankImport = (() => {

  const R =
    window.FinTrackerBankRules;


  const RULES_KEY =
    "fintracker.bankImport.rules.v1";


  const IMPORT_SOURCE =
    "alfa_bank";


  let supabaseClient =
    null;


  let categories = [];

  let existingTransactions =
    [];


  let prepared = [];


  const $ =
    selector =>
      document.querySelector(
        selector
      );


  function getClient() {

    if (
      supabaseClient
    ) {

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

    if (
      !name
    ) {

      return null;

    }


    const normalized =
      R.clean(name)
        .toLowerCase();


    return (
      categories.find(
        category =>

          category.type ===
            type &&

          category.parent_id ===
            null &&

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

    /*
     * Переводы не требуют
     * категории.
     */

    if (
      operation.isTransfer ||
      operation.type ===
        "transfer"
    ) {

      return {

        ...operation,

        categoryId:
          null,

        categoryName:
          "Перевод",

        autoCategory:
          false

      };

    }


    /*
     * HOLD не импортируем
     * автоматически.
     */

    if (
      operation.isHold
    ) {

      return {

        ...operation,

        categoryId:
          null,

        categoryName:
          "HOLD — проверить",

        autoCategory:
          false

      };

    }


    const categoryName =
      R.findRuleCategory(
        operation,
        getRules()
      );


    let category =
      findCategory(
        categoryName,

        operation.type ===
          "income"
          ? "income"
          : "expense"
      );





    return {

      ...operation,

      categoryId:
        category?.id ||
        null,

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
            `
              id,
              date,
              type,
              amount,
              merchant,
              comment,
              import_source,
              import_external_id,
              import_fingerprint,
              is_transfer
            `
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
      categoriesResult.data ||
      [];


    existingTransactions =
      transactionsResult.data ||
      [];

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
        transaction.comment ||
        ""

    });

  }


function prepare(operations) {
  const externalIds = new Set(
    existingTransactions
      .filter(transaction =>
        transaction.import_source === IMPORT_SOURCE &&
        transaction.import_external_id
      )
      .map(transaction =>
        transaction.import_external_id
      )
  );

  const fingerprintSet = new Set(
    existingTransactions
      .map(existingFingerprint)
  );

  // Отдельный набор fingerprint'ов
  // для операций внутри текущего Excel.
  const importedFingerprintSet = new Set();

  const importedExternalIdSet = new Set();

  prepared = operations.map(operation => {
    const item = classify(operation);

    const fingerprint =
      R.makeFingerprint(item);

    const externalId =
      R.extractOperationId(item);

    const duplicateById =
      Boolean(
        externalId &&
        (
          externalIds.has(externalId) ||
          importedExternalIdSet.has(externalId)
        )
      );

    const duplicateByFingerprint =
      !externalId &&
      (
        fingerprintSet.has(fingerprint) ||
        importedFingerprintSet.has(fingerprint)
      );

    const duplicate =
      duplicateById ||
      duplicateByFingerprint;

    // Запоминаем текущую операцию,
    // чтобы следующая строка Excel
    // могла быть распознана как дубль.
    if (externalId) {
      importedExternalIdSet.add(externalId);
    }

    importedFingerprintSet.add(fingerprint);

    const blocked =
      Boolean(item.isHold);

    const transfer =
      Boolean(
        item.isTransfer ||
        item.type === "transfer"
      );

    const valid =
      Boolean(
        item.date &&
        Number.isFinite(
          Number(item.amount)
        ) &&
        item.type !== "unknown" &&
        !blocked &&
        (
          transfer ||
          item.categoryId
        )
      );

    return {
      ...item,

      importSource:
        IMPORT_SOURCE,

      externalId,

      fingerprint,

      duplicate,

      duplicateReason:
        duplicateById
          ? "Код операции уже импортирован"
          : duplicateByFingerprint
            ? "Такая операция уже есть"
            : null,

      blocked,

      transfer,

      selected:
        !duplicate &&
        !blocked &&
        valid,

      valid
    };
  });

  return prepared;
}


  function buildPayload(
    item
  ) {

    return {

      type:
        item.transfer
          ? "expense"
          : item.type,

      amount:
        Math.abs(
          Number(
            item.amount
          )
        ),

      date:
        item.date,

      merchant:
        item.type ===
        "expense"

          ? (
              item.merchant ||
              null
            )

          : null,

      income_source:
        item.type ===
        "income"

          ? (
              item.merchant ||
              null
            )

          : null,

      comment:
        item.description ||
        null,

      category_id:
        item.transfer
          ? null
          : item.categoryId,

      import_source:
        item.importSource,

      import_external_id:
        item.externalId,

      import_fingerprint:
        item.fingerprint,

      imported_at:
        new Date().toISOString(),

      is_transfer:
        item.transfer

    };

  }


  async function importSelected() {

    const selected =
      prepared.filter(
        item =>

          item.selected &&

          !item.duplicate &&

          !item.blocked &&

          item.valid
      );


    if (
      !selected.length
    ) {

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


    let imported =
      0;


    for (
      let i = 0;

      i <
        payloads.length;

      i +=
        CHUNK_SIZE
    ) {

      const chunk =
        payloads.slice(
          i,
          i +
            CHUNK_SIZE
        );


      /*
       * Важнейшая часть.
       *
       * Если операция уже есть,
       * Supabase не создаст вторую.
       */

      const {
  error
} =
  await client
    .from(
      "transactions"
    )
    .insert(
      chunk
    );


      if (
        error
      ) {

        throw error;

      }


      imported +=
        chunk.length;

    }


    return imported;

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
          minimumFractionDigits:
            2,

          maximumFractionDigits:
            2
        }
      ).format(
        Number(value) ||
        0
      )

      +

      " ₽"

    );

  }


  function categoryOptions(
    item
  ) {

    const type =
      item.type ===
        "income"

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
        (
          a,
          b
        ) =>
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
      $(
        "#bank-import-content"
      );


    if (
      !content
    ) {

      return;

    }


    const duplicates =
      prepared.filter(
        item =>
          item.duplicate
      ).length;


    const holds =
      prepared.filter(
        item =>
          item.blocked
      ).length;


    const transfers =
      prepared.filter(
        item =>
          item.transfer
      ).length;


    const ready =
      prepared.filter(
        item =>

          item.selected &&

          item.valid &&

          !item.duplicate &&

          !item.blocked
      ).length;


    const invalid =
      prepared.filter(
        item =>

          !item.valid &&

          !item.duplicate &&

          !item.blocked
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
          HOLD
          <strong>
            ${holds}
          </strong>
        </div>

        <div>
          Переводов
          <strong>
            ${transfers}
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

              <th>
                Дата
              </th>

              <th>
                Описание
              </th>

              <th>
                Сумма
              </th>

              <th>
                Тип
              </th>

              <th>
                Категория
              </th>

              <th>
                Статус
              </th>

            </tr>

          </thead>


          <tbody>

            ${prepared.map(
              (
                item,
                index
              ) => `

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
    item.blocked
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
                      item.transfer

                        ? "Перевод"

                        : item.type ===
                          "income"

                          ? "Доход"

                          : item.type ===
                            "expense"

                            ? "Расход"

                            : "?"

                    }

                  </td>


<td>

  ${
    item.transfer

      ? "Не требуется"

      : item.blocked

        ? "Проверить HOLD"

        : `

          <select
            class="bank-import-category"
            data-import-category="${index}"
          >

            <option value="">
              Выберите категорию
            </option>

            ${categoryOptions(item)}

          </select>

        `
  }

</td>


                  <td>

                    ${
                      item.duplicate

                        ? escapeHtml(
                            item.duplicateReason ||
                            "Дубликат"
                          )

                        : item.blocked

                          ? "HOLD — пропущено"

                          : item.transfer

                            ? "Перевод"

                            : item.autoCategory

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
                prepared[
                  index
                ];


              item.categoryId =
                event.target
                  .value ||
                null;


              item.valid =
                Boolean(

                  item.date &&

                  item.categoryId &&

                  item.type !==
                    "unknown" &&

                  !item.transfer &&

                  !item.blocked

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

          !item.duplicate &&

          !item.blocked
      ).length;


    const duplicates =
      prepared.filter(
        item =>
          item.duplicate
      ).length;


    const holds =
      prepared.filter(
        item =>
          item.blocked
      ).length;


    const transfers =
      prepared.filter(
        item =>
          item.transfer
      ).length;


    const invalid =
      prepared.filter(
        item =>

          !item.valid &&

          !item.duplicate &&

          !item.blocked
      ).length;


    const stats =
      document.querySelectorAll(
        "#bank-import-content strong"
      );


    if (
      stats.length >= 6
    ) {

      stats[0].textContent =
        prepared.length;

      stats[1].textContent =
        ready;

      stats[2].textContent =
        duplicates;

      stats[3].textContent =
        holds;

      stats[4].textContent =
        transfers;

      stats[5].textContent =
        invalid;

    }


    const submit =
      $(
        "#bank-import-submit"
      );


    if (
      submit
    ) {

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
      event.target
        .files?.[0];


    if (
      !file
    ) {

      return;

    }


    try {

      await loadReferenceData();


      const parsed =
        await window
          .FinTrackerExcelParser
          .readFile(
            file
          );


      prepare(
        parsed.operations
      );


      $(
        "#bank-import-start"
      )
        ?.classList.add(
          "hidden"
        );


      $(
        "#bank-import-content"
      )
        ?.classList.remove(
          "hidden"
        );


      renderPreview();


    } catch (
      error
    ) {

      console.error(
        error
      );


      const content =
        $(
          "#bank-import-content"
        );


      if (
        content
      ) {

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
      $(
        "#bank-import-submit"
      );


    if (
      !button
    ) {

      return;

    }


    button.disabled =
      true;


    button.textContent =
      "Импортируем...";


    try {

      const count =
        await importSelected();


      $(
        "#bank-import-modal"
      )
        ?.classList.add(
          "hidden"
        );


      alert(
        `Импортировано операций: ${count}`
      );


      location.reload();


    } catch (
      error
    ) {

      console.error(
        error
      );


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
      $(
        "#bank-import-styles"
      )
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
            auto-fit,
            minmax(
              120px,
              1fr
            )
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
        min-width: 900px;
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
      $(
        "#bank-import-modal"
      )
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
      $(
        "#transactions-add"
      );


    if (
      addButton?.parentElement
    ) {

      addButton.parentElement
        .appendChild(
          button
        );

    }


    button.addEventListener(
      "click",
      () => {

        $(
          "#bank-import-modal"
        )
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
        closeButton => {

          closeButton.addEventListener(
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


    $(
      "#bank-import-file"
    )
      ?.addEventListener(
        "change",
        handleFile
      );


    $(
      "#bank-import-submit"
    )
      ?.addEventListener(
        "click",
        handleImport
      );

  }


  function init() {

    createUI();

  }

document.addEventListener(
  "change",
  event => {

    const select =
      event.target.closest(
        "[data-import-category]"
      );

    if (!select) {
      return;
    }

    const index =
      Number(
        select.dataset.importCategory
      );

    const item =
      prepared[index];

    if (!item) {
      return;
    }

    const categoryId =
      select.value || null;

    const category =
      categories.find(
        category =>
          category.id === categoryId
      );

    item.categoryId =
      categoryId;

    item.categoryName =
      category?.name ||
      "Без категории";

    item.autoCategory =
      false;

    item.valid =
      Boolean(
        item.date &&
        Number.isFinite(
          Number(item.amount)
        ) &&
        item.type !== "unknown" &&
        !item.blocked &&
        (
          item.transfer ||
          item.categoryId
        )
      );

    item.selected =
      !item.duplicate &&
      !item.blocked &&
      item.valid;

    renderPreview();

  }
);
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