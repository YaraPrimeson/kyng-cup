"use client";

import { useLanguage } from "../i18n";

const copy = {
  en: {
    eyebrow: "Privacy notice · Updated 18 August 2026",
    title: "Cookie\npolicy",
    sections: [
      ["What we store", "KYNG CUP uses essential browser storage to keep administrators securely signed in, remember cookie preferences and maintain reliable site functionality."],
      ["Essential storage", "Authentication information is required for the protected tournament administration area. It cannot be disabled from the cookie banner because the admin area would no longer work."],
      ["Optional cookies", "We currently do not use advertising cookies. If analytics or marketing tools are added later, optional cookies will only be activated after consent."],
      ["Your choice", "You may choose “Necessary only” or “Accept all” in the banner. The choice is saved on this device. Clearing browser data will reset it and show the banner again."],
    ],
    contact: "Questions about privacy can be sent to",
  },
  uk: {
    eyebrow: "Повідомлення про приватність · Оновлено 18 серпня 2026",
    title: "Політика\ncookies",
    sections: [
      ["Що ми зберігаємо", "KYNG CUP використовує необхідне сховище браузера для безпечного входу адміністраторів, збереження налаштувань cookies і стабільної роботи сайту."],
      ["Обов’язкове зберігання", "Дані автентифікації потрібні для захищеної панелі керування турнірами. Їх не можна вимкнути в банері, інакше адмінпанель перестане працювати."],
      ["Необов’язкові cookies", "Зараз ми не використовуємо рекламні cookies. Якщо згодом з’являться аналітичні або маркетингові інструменти, вони активуватимуться лише після вашої згоди."],
      ["Ваш вибір", "У банері можна обрати «Лише необхідні» або «Прийняти всі». Вибір зберігається на цьому пристрої. Після очищення даних браузера банер з’явиться знову."],
    ],
    contact: "Запитання щодо приватності надсилайте на",
  },
  de: {
    eyebrow: "Datenschutzhinweis · Aktualisiert am 18. August 2026",
    title: "Cookie-\nRichtlinie",
    sections: [
      ["Was wir speichern", "KYNG CUP nutzt notwendige Browser-Speicherung, damit Administratoren sicher angemeldet bleiben, Cookie-Einstellungen erhalten bleiben und die Website zuverlässig funktioniert."],
      ["Notwendige Speicherung", "Authentifizierungsdaten werden für den geschützten Turnierbereich benötigt. Sie können im Cookie-Banner nicht deaktiviert werden, da die Verwaltung sonst nicht funktionieren würde."],
      ["Optionale Cookies", "Derzeit verwenden wir keine Werbe-Cookies. Sollten später Analyse- oder Marketing-Werkzeuge hinzukommen, werden optionale Cookies erst nach Ihrer Zustimmung aktiviert."],
      ["Ihre Wahl", "Im Banner können Sie „Nur notwendige“ oder „Alle akzeptieren“ wählen. Die Auswahl wird auf diesem Gerät gespeichert. Durch Löschen der Browserdaten wird sie zurückgesetzt."],
    ],
    contact: "Fragen zum Datenschutz senden Sie bitte an",
  },
  ru: {
    eyebrow: "Уведомление о конфиденциальности · Обновлено 18 августа 2026",
    title: "Политика\ncookies",
    sections: [
      ["Что мы сохраняем", "KYNG CUP использует обязательное хранилище браузера для безопасного входа администраторов, сохранения настроек cookies и стабильной работы сайта."],
      ["Обязательное хранение", "Данные авторизации необходимы для защищённой панели управления турнирами. Их нельзя отключить в баннере, иначе админпанель перестанет работать."],
      ["Необязательные cookies", "Сейчас мы не используем рекламные cookies. Если позже появятся аналитические или маркетинговые инструменты, они будут активированы только после вашего согласия."],
      ["Ваш выбор", "В баннере можно выбрать «Только необходимые» или «Принять все». Выбор сохраняется на этом устройстве. Очистка данных браузера сбросит его и снова покажет баннер."],
    ],
    contact: "Вопросы о конфиденциальности отправляйте на",
  },
} as const;

export default function CookieContent() {
  const { language } = useLanguage();
  const text = copy[language];
  const [first, second] = text.title.split("\n");
  return (
    <article>
      <p className="eyebrow">{text.eyebrow}</p>
      <h1>{first}<br />{second}<span>.</span></h1>
      {text.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}
      <section><h2>Contact</h2><p>{text.contact} <a href="mailto:hello@kyngcup.com">hello@kyngcup.com</a>.</p></section>
    </article>
  );
}
