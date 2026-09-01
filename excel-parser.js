"use strict";

window.FinTrackerExcelParser = (() => {

  const R =
    window.FinTrackerBankRules;


  const HEADER_ALIASES = {

    date: [
      "дата операции",
      "дата",
      "operation date",
      "transaction date"
    ],

    postingDate: [
      "дата проводки",
      "дата обработки",
      "posting date",
      "value date"
    ],

    amount: [
      "сумма",
      "сумма операции",
      "amount",
      "transaction amount"
    ],

    description: [
      "описание",
      "назначение платежа",
      "назначение",
      "описание операции",
      "description",
      "details"
    ],

    bankCategory: [
      "категория",
      "категория операции",
      "тип операции",
      "category",
      "operation category"
    ],

    bankCode: [
      "код операции",
      "код",
      "номер операции",
      "operation code",
      "transaction id"
    ],

    status: [
      "статус",
      "состояние",
      "status"
    ]

  };


  function normalizeHeader(value) {

    return R.clean(value)
      .toLowerCase()
      .replace(/ё/g, "е")
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
      const alias of aliases
    ) {

      const index =
        normalized.indexOf(
          normalizeHeader(alias)
        );

      if (index !== -1) {
        return headers[index];
      }

    }

    return null;
  }


  function detectColumns(headers) {

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

    return result;
  }


  function convertRows(rows) {

    if (!rows.length) {
      throw new Error(
        "В Excel не найдено строк."
      );
    }


    const headers =
      Object.keys(rows[0]);

    const columns =
      detectColumns(headers);


    if (!columns.amount) {
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
      (raw, index) => {

        const operation =
          R.normalizeOperation({

            date:
              columns.date
                ? raw[columns.date]
                : raw[columns.postingDate],

            postingDate:
              columns.postingDate
                ? raw[columns.postingDate]
                : null,

            amount:
              raw[columns.amount],

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
                : ""

          });


        operation.rowNumber =
          index + 2;

        operation.raw =
          raw;


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


  async function readFile(file) {

    if (!window.XLSX) {

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


      if (rows.length) {

        return {

          fileName:
            file.name,

          sheetName,

          rowCount:
            rows.length,

          ...convertRows(rows)

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