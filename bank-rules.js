"use strict";

window.FinTrackerBankRules = (() => {

  const MCC_RULES = {
    "4111": "Транспорт",
    "4121": "Транспорт",
    "4131": "Транспорт",
    "4789": "Транспорт",

    "5411": "Продукты",
    "5422": "Продукты",
    "5441": "Продукты",
    "5451": "Продукты",
    "5462": "Продукты",
    "5499": "Продукты",

    "5541": "Автомобиль",
    "5542": "Автомобиль",

    "5812": "Рестораны",
    "5814": "Кафе",

    "5912": "Здоровье",

    "5942": "Покупки",
    "5943": "Покупки",
    "5944": "Покупки",
    "5945": "Покупки",
    "5999": "Покупки",

    "6011": "Банковские услуги",

    "7011": "Путешествия",

    "7832": "Развлечения",
    "7922": "Развлечения",
    "7995": "Развлечения",

    "8011": "Здоровье",
    "8021": "Здоровье",
    "8099": "Здоровье"
  };


  const MERCHANT_RULES = [

    [/пят[её]роч|pyateroch|5ka/i, "Продукты"],
    [/магнит|magnit/i, "Продукты"],
    [/вкусвилл|vkusvill/i, "Продукты"],
    [/перекр[её]ст|perekrest/i, "Продукты"],
    [/лента|lenta/i, "Продукты"],
    [/ашан|auchan/i, "Продукты"],
    [/окей|o'key|okey/i, "Продукты"],

    [/steam|playstation|xbox|nintendo/i, "Игры"],

    [
      /яндекс.*такси|yandex.*taxi|uber|ситимобил|citymobil/i,
      "Транспорт"
    ],

    [
      /яндекс.*еда|yandex.*eda|delivery club|деливери/i,
      "Рестораны"
    ],

    [
      /озон|ozon|wildberries|вайлдберриз|aliexpress|алиэкспресс/i,
      "Покупки"
    ],

    [/аптека|pharmacy|eapteka/i, "Здоровье"],

    [
      /кино|cinema|kinopoisk|ivi|okko|netflix|spotify/i,
      "Развлечения"
    ],

    [/зарплат|salary|заработ|аванс/i, "Зарплата"],

    [
      /жкх|коммунал|электроэнерг|водоканал|газоснабж/i,
      "Коммунальные услуги"
    ],

    [/мтс|мегафон|билайн|tele2|теле2/i, "Связь"]
  ];


  function clean(value) {

    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  }


  function parseAmount(value) {

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return Math.round(value * 100) / 100;
    }

    let text = clean(value)
      .replace(/\u00a0/g, " ")
      .replace(/₽|RUB|руб\.?/gi, "")
      .replace(/\s/g, "");

    if (!text) {
      return 0;
    }

    const negative =
      /^-/.test(text) ||
      /^\(.*\)$/.test(text);

    text = text.replace(/[()]/g, "");

    if (
      text.includes(",") &&
      text.includes(".")
    ) {

      if (
        text.lastIndexOf(",") >
        text.lastIndexOf(".")
      ) {
        text = text
          .replace(/\./g, "")
          .replace(",", ".");
      } else {
        text = text.replace(/,/g, "");
      }

    } else {

      text = text.replace(",", ".");

    }

    const number = Number(text);

    if (!Number.isFinite(number)) {
      return 0;
    }

    const result =
      Math.round(
        Math.abs(number) * 100
      ) / 100;

    return negative
      ? -result
      : result;
  }


  function parseDate(value) {

    if (!value) {
      return null;
    }

    if (
      value instanceof Date &&
      !Number.isNaN(value.getTime())
    ) {
      return value
        .toISOString()
        .slice(0, 10);
    }

    if (
      typeof value === "number" &&
      window.XLSX?.SSF
    ) {

      const parsed =
        window.XLSX.SSF.parse_date_code(
          value
        );

      if (parsed) {

        return (
          `${parsed.y}-` +
          `${String(parsed.m).padStart(2, "0")}-` +
          `${String(parsed.d).padStart(2, "0")}`
        );

      }
    }

    const text = clean(value);

    let match =
      text.match(
        /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/
      );

    if (match) {

      return (
        `${match[3]}-` +
        `${String(match[2]).padStart(2, "0")}-` +
        `${String(match[1]).padStart(2, "0")}`
      );

    }

    match =
      text.match(
        /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/
      );

    if (match) {

      return (
        `${match[1]}-` +
        `${String(match[2]).padStart(2, "0")}-` +
        `${String(match[3]).padStart(2, "0")}`
      );

    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date
      .toISOString()
      .slice(0, 10);
  }


  function extractMcc(description) {

    const match =
      clean(description).match(
        /\bMCC\s*[:#-]?\s*(\d{4})\b/i
      );

    return match
      ? match[1]
      : null;
  }


  function extractMerchant(description) {

    const text =
      clean(description);

    const place =
      text.match(
        /место совершения операции\s*:\s*([^,\n]+)/i
      );

    if (place) {

      return clean(place[1])
        .replace(/^RU\//i, "")
        .replace(
          /^RUSSIAN FEDERATION\//i,
          ""
        );

    }

    const beneficiary =
      text.match(
        /(?:в пользу|получатель|магазин|торговая точка)\s*[:\-]?\s*([^,;\n]+)/i
      );

    if (beneficiary) {
      return clean(beneficiary[1]);
    }

    return null;
  }


  function detectType(row) {

    const text =
      clean(
        `${row.description || ""} ${
          row.bankCategory || ""
        }`
      ).toLowerCase();

    const amount =
      Number(row.amount) || 0;

    if (
      /внутрибанковск|между счет|межсчет|между собственн|между своими/i
        .test(text)
    ) {
      return "transfer";
    }

    if (
      /зарплат|аванс/i.test(text) &&
      amount > 0
    ) {
      return "income";
    }

    if (amount > 0) {
      return "income";
    }

    if (amount < 0) {
      return "expense";
    }

    return "unknown";
  }


  function normalizeOperation(row) {

    const description =
      clean(row.description);

    const amount =
      parseAmount(row.amount);

    return {

      date:
        parseDate(row.date),

      postingDate:
        parseDate(row.postingDate),

      amount,

      description,

      merchant:
        clean(
          row.merchant ||
          extractMerchant(description)
        ) || null,

      mcc:
        row.mcc ||
        extractMcc(description),

      bankCode:
        clean(row.bankCode) || null,

      bankCategory:
        clean(row.bankCategory) || null,

      status:
        clean(row.status) || null,

      type:
        detectType({
          ...row,
          amount,
          description
        }),

      source:
        "bank_import"
    };
  }


  function findRuleCategory(
    operation,
    userRules = []
  ) {

    const haystack =
      clean(
        `${operation.merchant || ""} ${
          operation.description || ""
        } ${
          operation.bankCategory || ""
        }`
      );


    for (const rule of userRules) {

      if (
        !rule?.pattern ||
        !rule?.categoryName
      ) {
        continue;
      }

      try {

        if (
          new RegExp(
            rule.pattern,
            "i"
          ).test(haystack)
        ) {
          return rule.categoryName;
        }

      } catch (_) {}

    }


    for (
      const [pattern, category]
      of MERCHANT_RULES
    ) {

      if (pattern.test(haystack)) {
        return category;
      }

    }


    if (
      operation.mcc &&
      MCC_RULES[operation.mcc]
    ) {
      return MCC_RULES[
        operation.mcc
      ];
    }


    const bank =
      clean(
        operation.bankCategory
      ).toLowerCase();

    if (
      /продукт|магазин|супермаркет/i
        .test(bank)
    ) {
      return "Продукты";
    }

    if (
      /игр|steam/i.test(bank)
    ) {
      return "Игры";
    }

    if (
      /зарплат|доход|заработ/i.test(bank) &&
      operation.type === "income"
    ) {
      return "Зарплата";
    }

    return null;
  }


  function makeFingerprint(operation) {

    return [

      operation.date || "",

      Math.abs(
        Number(operation.amount) || 0
      ).toFixed(2),

      operation.type || "",

      clean(
        operation.merchant
      ).toLowerCase(),

      clean(
        operation.description
      ).toLowerCase()

    ].join("|");
  }


  return {

    clean,
    parseAmount,
    parseDate,
    extractMcc,
    extractMerchant,
    detectType,
    normalizeOperation,
    findRuleCategory,
    makeFingerprint

  };

})();