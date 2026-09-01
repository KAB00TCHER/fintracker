"use strict";

(() => {

  const DEFAULT_CATEGORIES = [
    ["Продукты", "expense"],
    ["Кафе и рестораны", "expense"],
    ["Транспорт", "expense"],
    ["Жильё", "expense"],
    ["Здоровье", "expense"],
    ["Одежда", "expense"],
    ["Маркетплейсы", "expense"],
    ["Развлечения", "expense"],
    ["Подписки", "expense"],
    ["Быт", "expense"],
    ["ЖКХ", "expense"],
    ["Прочее", "expense"],

    ["Зарплата", "income"],
    ["Фриланс", "income"],
    ["Прочий доход", "income"]
  ];


  const selectedCategories =
    new Map();


  function getClient() {

    return window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );

  }


  async function syncDefaultCategories() {

    const client =
      getClient();

    const {
      data: {
        session
      }
    } =
      await client.auth.getSession();

    if (!session?.user) {
      return false;
    }


    const {
      data,
      error
    } =
      await client
        .from("categories")
        .select(
          "id,name,type,parent_id"
        )
        .is(
          "parent_id",
          null
        );


    if (error) {

      console.warn(
        "Не удалось проверить стандартные категории:",
        error.message
      );

      return false;
    }


    const existing =
      new Set(
        (data || []).map(
          category =>
            `${category.type}::${category.name.trim().toLowerCase()}`
        )
      );


    const missing =
      DEFAULT_CATEGORIES
        .filter(
          ([name, type]) =>
            !existing.has(
              `${type}::${name.toLowerCase()}`
            )
        )
        .map(
          ([name, type]) => ({
            name,
            type,
            parent_id: null
          })
        );


    if (!missing.length) {
      return false;
    }


    const {
      error: insertError
    } =
      await client
        .from("categories")
        .insert(
          missing
        );


    if (insertError) {

      console.warn(
        "Не удалось создать стандартные категории:",
        insertError.message
      );

      return false;
    }


    return true;
  }


  function getType(select) {

    const row =
      select.closest("tr");

    const typeCell =
      row?.querySelector(
        "td:nth-child(5)"
      );

    return (
      typeCell?.textContent.includes(
        "Доход"
      )
        ? "income"
        : "expense"
    );
  }


  function addCreateOption(select) {

    if (
      select.querySelector(
        'option[value="__create_category__"]'
      )
    ) {
      return;
    }


    const option =
      document.createElement(
        "option"
      );

    option.value =
      "__create_category__";

    option.textContent =
      "＋ Добавить категорию…";

    select.appendChild(
      option
    );
  }


  function showCreator(select) {

    const cell =
      select.closest("td");

    if (!cell) {
      return;
    }


    let creator =
      cell.querySelector(
        ".bank-import-category-creator"
      );


    if (!creator) {

      creator =
        document.createElement(
          "div"
        );

      creator.className =
        "bank-import-category-creator";


      creator.innerHTML = `

        <input
          type="text"
          class="bank-import-new-category"
          maxlength="80"
          placeholder="Новая категория"
        >

        <button
          type="button"
          class="secondary-button bank-import-add-category"
        >
          Добавить
        </button>

      `;


      cell.appendChild(
        creator
      );


      const input =
        creator.querySelector(
          ".bank-import-new-category"
        );


      const button =
        creator.querySelector(
          ".bank-import-add-category"
        );


      async function createCategory() {

        const name =
          input.value.trim();

        if (!name) {

          input.focus();

          return;
        }


        button.disabled =
          true;

        button.textContent =
          "Добавляем…";


        try {

          const client =
            getClient();

          const type =
            getType(select);


          let {
            data,
            error
          } =
            await client
              .from("categories")
              .insert({
                name,
                type,
                parent_id: null
              })
              .select("*")
              .single();


          /*
            Если такая категория уже существует,
            просто используем её.
          */

          if (
            error?.code === "23505"
          ) {

            const existing =
              await client
                .from("categories")
                .select("*")
                .eq(
                  "name",
                  name
                )
                .eq(
                  "type",
                  type
                )
                .is(
                  "parent_id",
                  null
                )
                .maybeSingle();


            data =
              existing.data;

            error =
              existing.error;
          }


          if (error) {
            throw error;
          }


          if (!data) {
            throw new Error(
              "Не удалось создать категорию."
            );
          }


          /*
            Добавляем категорию
            во все строки того же типа.
          */

          document
            .querySelectorAll(
              ".bank-import-category"
            )
            .forEach(
              other => {

                if (
                  getType(other) !==
                  type
                ) {
                  return;
                }


                addCreateOption(
                  other
                );


                if (
                  ![
                    ...other.options
                  ].some(
                    option =>
                      option.value ===
                      data.id
                  )
                ) {

                  const option =
                    document.createElement(
                      "option"
                    );

                  option.value =
                    data.id;

                  option.textContent =
                    data.name;

                  other.insertBefore(
                    option,
                    other.lastElementChild
                  );
                }

              }
            );


          const index =
            select.dataset
              .importCategory;


          selectedCategories.set(
            index,
            {
              id: data.id,
              name: data.name
            }
          );


          select.value =
            data.id;


          /*
            Передаём изменение
            существующему импортеру.
          */

          select.dispatchEvent(
            new Event(
              "change",
              {
                bubbles: true
              }
            )
          );


          creator.remove();


        } catch (error) {

          console.error(
            error
          );

          alert(
            error.message ||
            "Не удалось добавить категорию."
          );


          button.disabled =
            false;

          button.textContent =
            "Добавить";
        }

      }


      button.addEventListener(
        "click",
        createCategory
      );


      input.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
            "Enter"
          ) {

            event.preventDefault();

            createCategory();
          }

        }
      );

    }


    creator
      .querySelector(
        ".bank-import-new-category"
      )
      ?.focus();
  }


  function enhance(root) {

    root
      .querySelectorAll(
        ".bank-import-category"
      )
      .forEach(
        select => {

          addCreateOption(
            select
          );


          if (
            select.dataset
              .categoryEnhanced ===
            "1"
          ) {
            return;
          }


          select.dataset
            .categoryEnhanced =
            "1";


          select.dataset
            .previousValue =
            select.value;


          select.addEventListener(
            "change",
            event => {

              if (
                event.target.value ===
                "__create_category__"
              ) {

                event.target.value =
                  event.target.dataset
                    .previousValue ||
                  "";

                showCreator(
                  event.target
                );

                return;
              }


              event.target.dataset
                .previousValue =
                event.target.value;
            }
          );


          const saved =
            selectedCategories.get(
              select.dataset
                .importCategory
            );


          if (saved) {

            if (
              ![
                ...select.options
              ].some(
                option =>
                  option.value ===
                  saved.id
              )
            ) {

              const option =
                document.createElement(
                  "option"
                );

              option.value =
                saved.id;

              option.textContent =
                saved.name;

              select.insertBefore(
                option,
                select.lastElementChild
              );
            }


            select.value =
              saved.id;
          }

        }
      );
  }


  function injectStyles() {

    if (
      document.getElementById(
        "bank-import-category-enhancement-styles"
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        "style"
      );


    style.id =
      "bank-import-category-enhancement-styles";


    style.textContent = `

      .bank-import-category-creator {
        display: flex;
        gap: 6px;
        margin-top: 6px;
        min-width: 260px;
      }

      .bank-import-new-category {
        width: 100%;
        min-width: 0;
        padding: 7px 9px;
        border: 1px solid var(--border, #ddd);
        border-radius: 8px;
        background: var(--surface, #fff);
        color: inherit;
      }

      .bank-import-add-category {
        white-space: nowrap;
        padding: 7px 10px;
      }

    `;


    document.head.appendChild(
      style
    );
  }


  async function init() {

    injectStyles();


    let created =
      false;


    try {

      created =
        await syncDefaultCategories();

    } catch (error) {

      console.warn(
        "Синхронизация стандартных категорий:",
        error
      );
    }


    /*
      Если это старый аккаунт,
      после добавления стандартных категорий
      один раз перезагружаем страницу,
      чтобы основной app.js загрузил
      свежий список категорий.
    */

    if (
      created &&
      !sessionStorage.getItem(
        "fintracker-defaults-synced"
      )
    ) {

      sessionStorage.setItem(
        "fintracker-defaults-synced",
        "1"
      );

      location.reload();

      return;
    }


    const content =
      document.getElementById(
        "bank-import-content"
      );


    if (content) {
      enhance(content);
    }


    const observer =
      new MutationObserver(
        () => {

          const target =
            document.getElementById(
              "bank-import-content"
            );

          if (target) {
            enhance(target);
          }

        }
      );


    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

  }


  window.addEventListener(
    "DOMContentLoaded",
    init
  );

})();