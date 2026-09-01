"use strict";

window.FinTrackerExcelParser = (() => {

  const R =
    window.FinTrackerBankRules;


  const HEADER_ALIASES = {

    date: [
      "дата операции",
      "дата",
      "дата операции по счету",
      "operation date",
      "transaction date"
    ],

    postingDate: [
      "дата проводки",
      "дата обработки",
      "дата списания",
      "posting date",
      "value date"
    ],


amount: [
  "сумма",
  "сумма операции",
  "сумма операции в валюте счета",
  "сумма операции в валюте операции",
  "сумма в валюте счета",
  "сумма в валюте операции",
  "сумма списания",
  "сумма зачисления",
  "сумма платежа",
  "сумма транзакции",
  "сумма операции руб",
  "сумма операции руб.",
  "сумма, руб.",
  "сумма руб",
  "расход",
  "amount",
  "transaction amount"
],



    description: [
      "описание",
      "назначение платежа",
      "назначение",
      "описание операции",
      "назначение операции",
      "description",
      "details"
    ],

    bankCategory: [
      "категория",
      "категория операции",
      "тип операции",
      "категория транзакции",
      "category",
      "operation category"
    ],

    bankCode: [
      "код операции",
      "код",
      "номер операции",
      "номер транзакции",
      "идентификатор операции",
      "operation code",
      "transaction id",
      "external id"
    ],

    status: [
      "статус",
      "состояние",
      "статус операции",
      "status"
    ],

    merchant: [
      "магазин",
      "торговая точка",
      "получатель",
      "отправитель",
      "merchant",
      "merchant name"
    ],

    mcc: [
      "mcc",
      "код mcc",
      "mcc code"
    ]

  };


  function normalizeHeader(
    value
  ) {

    return R.clean(value)
      .toLowerCase()
      .replace(
        /ё/g,
        "е"
      )
      .replace(
        /[_\-\/]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  }


  function findColumn(
    headers,
    aliases
  ) {

    const normalized =
      headers.map(
        normalizeHeader
      );


    for (
      const alias
      of aliases
    ) {

      const index =
        normalized.indexOf(
          normalizeHeader(
            alias
          )
        );


      if (
        index !== -1
      ) {

        return headers[index];

      }

    }


    return null;

  }


function findAmountColumn(headers) {
  const exact = findColumn(
    headers,
    HEADER_ALIASES.amount
  );

  if (exact) {
    return exact;
  }

  const normalized = headers.map(
    normalizeHeader
  );

  const candidates = [
    /\bсумм\w*\b.*\bоперац\w*\b/,
    /\bсумм\w*\b.*\bсписан\w*\b/,
    /\bсумм\w*\b.*\bзачислен\w*\b/,
    /\bсумм\w*\b.*\bплатеж\w*\b/,
    /\bсумм\w*\b.*\bтранзакц\w*\b/,
    /\bсумм\w*\b.*\bруб\b/,
    /\bрасход\b/,
    /\bamount\b/,
    /\btransaction\s+amount\b/
  ];

  for (const pattern of candidates) {
    const index = normalized.findIndex(
      value => pattern.test(value)
    );

    if (index !== -1) {
      return headers[index];
    }
  }

  return null;
}




  function detectColumns(
    headers
  ) {

    const result = {};


    for (
      const [key, aliases]
      of Object.entries(
        HEADER_ALIASES
      )
    ) {

      result[key] =
        findColumn(
          headers,
          aliases
        );

    }

    result.amount = findAmountColumn(headers);
    return result;

  }


  function convertRows(
    rows
  ) {

    if (
      !rows.length
    ) {

      throw new Error(
        "В Excel не найдено строк."
      );

    }


    const headers =
      Object.keys(
        rows[0]
      );


    const columns =
      detectColumns(
        headers
      );


    if (
      !columns.amount
    ) {

      throw new Error(
        "Не удалось определить колонку «Сумма»."
      );

    }


    if (
      !columns.date &&
      !columns.postingDate
    ) {

      throw new Error(
        "Не удалось определить дату операции."
      );

    }


    const operations = [];


    rows.forEach(
      (
        raw,
        index
      ) => {

        const operation =
          R.normalizeOperation({

            date:
              columns.date
                ? raw[
                    columns.date
                  ]
                : raw[
                    columns.postingDate
                  ],

            postingDate:
              columns.postingDate
                ? raw[
                    columns.postingDate
                  ]
                : null,

            amount:
              raw[
                columns.amount
              ],

            description:
              columns.description
                ? raw[
                    columns.description
                  ]
                : "",

            bankCategory:
              columns.bankCategory
                ? raw[
                    columns.bankCategory
                  ]
                : "",

            bankCode:
              columns.bankCode
                ? raw[
                    columns.bankCode
                  ]
                : "",

            status:
              columns.status
                ? raw[
                    columns.status
                  ]
                : "",

            merchant:
              columns.merchant
                ? raw[
                    columns.merchant
                  ]
                : "",

            mcc:
              columns.mcc
                ? raw[
                    columns.mcc
                  ]
                : ""

          });


        operation.rowNumber =
          index + 2;


        operation.raw =
          raw;


        /*
         * Нулевые строки Excel,
         * заголовки и прочий мусор
         * отбрасываем.
         */

        if (
          operation.amount !== 0 &&
          operation.date
        ) {

          operations.push(
            operation
          );

        }

      }
    );


    return {

      headers,

      columns,

      operations

    };

  }


  async function readFile(
    file
  ) {

    if (
      !window.XLSX
    ) {

      throw new Error(
        "Библиотека XLSX не загружена."
      );

    }


    const buffer =
      await file.arrayBuffer();


    const workbook =
      window.XLSX.read(
        buffer,
        {
          type: "array",
          cellDates: true
        }
      );


    if (
      !workbook.SheetNames.length
    ) {

      throw new Error(
        "В Excel нет листов."
      );

    }


    for (
      const sheetName
      of workbook.SheetNames
    ) {

      const rows =
        window.XLSX.utils
          .sheet_to_json(
            workbook.Sheets[
              sheetName
            ],
            {
              defval: "",
              raw: true
            }
          );


      if (
        rows.length
      ) {

        return {

          fileName:
            file.name,

          sheetName,

          rowCount:
            rows.length,

          ...convertRows(
            rows
          )

        };

      }

    }


    throw new Error(
      "В Excel не найдено данных."
    );

  }


  return {

    readFile,

    detectColumns,

    normalizeHeader

  };

})();