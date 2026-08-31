// config.example.js
//
// Скопируй этот файл в config.js.
// Подставь значения из:
// Supabase → Project Settings → API
//
// В GitHub config.js лучше не хранить.
// Для Vercel можно использовать Environment Variables,
// но для простого static deploy этот файл тоже работает,
// если ты сознательно оставляешь anon key публичным.
//
// ВАЖНО:
// Supabase anon/publishable key не является секретом.
// Секретность данных обеспечивается RLS в базе.

window.APP_CONFIG = {
  SUPABASE_URL: "https://qzchcruzgxfrqfmydwox.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_XIEa5-4bbmpsrwfEBHw_EQ_3Y53hMpF"
};