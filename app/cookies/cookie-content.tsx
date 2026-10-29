"use client";

import { useLanguage } from "../i18n";

const copy = {
  en: {
    eyebrow: "Privacy notice · Updated 29 October 2026",
    title: "Privacy &\ncookies",
    sections: [
      ["Player account", "Your account stores a permanent player ID, name, confirmed email and optional photo through Supabase. Google sign-in, when connected, shares basic identity information for authentication. Your profile and photo are private at this stage. Account and authentication pages are excluded from analytics. Contact us using the address below to request deletion."],
      ["Registration data", "When you apply for a tournament, KYNG CUP receives the pair name, both players’ names, email addresses, phone numbers, optional messenger contacts, playing levels, ratings and your optional message."],
      ["Why we use it", "We use this information to review the application, organise the tournament, contact the players and prevent duplicate registrations. Optional marketing messages are sent only when Player 1 selects the separate marketing checkbox."],
      ["Service providers", "Registration data is stored through Supabase and application notifications may be delivered to the KYNG CUP team through Telegram. These providers process data to operate the registration service."],
      ["Essential storage", "Authentication information is required for secure player and organiser sign-in. Essential session storage cannot be disabled from the cookie banner."],
      ["Optional analytics", "Google Analytics is activated only after you choose “Accept all”. It helps us understand page visits and registration steps. Advertising storage and ad personalisation remain disabled."],
      ["Retention and your choices", "We keep registration data only as long as needed to organise the tournament and handle related enquiries. You may ask us to access, correct or delete your data. You may choose “Necessary only” in the cookie banner; clearing browser data resets that choice."],
    ],
    contact: "Questions about privacy can be sent to",
  },
  uk: {
    eyebrow: "Повідомлення про приватність · Оновлено 29 жовтня 2026",
    title: "Приватність і\ncookies",
    sections: [
      ["Акаунт гравця", "У Supabase зберігаються постійний ID гравця, ім’я, підтверджений email і необов’язкове фото. Підключений вхід через Google передає основні дані для автентифікації. Профіль і фото на цьому етапі приватні. Сторінки акаунта й авторизації виключені з аналітики. Для видалення даних зверніться за адресою нижче."],
      ["Дані реєстрації", "Під час подання заявки KYNG CUP отримує назву пари, імена, email, телефони, необов’язкові контакти в месенджерах, рівні гри й рейтинги обох гравців, а також необов’язкове повідомлення."],
      ["Навіщо ми їх використовуємо", "Ми використовуємо ці дані для перевірки заявки, організації турніру, зв’язку з гравцями та запобігання дублюванню заявок. Маркетингові повідомлення надсилаються лише після окремої згоди першого гравця."],
      ["Постачальники послуг", "Дані реєстрації зберігаються через Supabase, а повідомлення про заявки можуть надходити команді KYNG CUP через Telegram. Ці постачальники обробляють дані для роботи сервісу реєстрації."],
      ["Обов’язкове зберігання", "Дані автентифікації потрібні для безпечного входу гравців та організаторів. Обов’язкове сховище сесії не вимикається в банері cookies."],
      ["Необов’язкова аналітика", "Google Analytics активується лише після вибору «Прийняти всі». Вона допомагає аналізувати відвідування сторінок і кроки реєстрації. Рекламне сховище та персоналізація реклами залишаються вимкненими."],
      ["Зберігання та ваші права", "Ми зберігаємо дані лише стільки, скільки потрібно для організації турніру та опрацювання звернень. Ви можете попросити надати, виправити або видалити свої дані. У банері можна обрати «Лише необхідні»."],
    ],
    contact: "Запитання щодо приватності надсилайте на",
  },
  de: {
    eyebrow: "Datenschutzhinweis · Aktualisiert am 29. Oktober 2026",
    title: "Datenschutz &\nCookies",
    sections: [
      ["Spielerkonto", "Eine dauerhafte Spieler-ID, Name, bestätigte E-Mail-Adresse und optionales Foto werden über Supabase gespeichert. Eine verbundene Google-Anmeldung übermittelt grundlegende Identitätsdaten zur Anmeldung. Profil und Foto sind in dieser Phase privat. Konto- und Anmeldeseiten sind von der Analyse ausgeschlossen. Zur Löschung kontaktieren Sie uns über die unten genannte Adresse."],
      ["Anmeldedaten", "Bei einer Turnieranmeldung erhält KYNG CUP den Paarnamen, Namen, E-Mail-Adressen, Telefonnummern, optionale Messenger-Kontakte, Spielstärken und Ratings beider Spieler sowie die optionale Nachricht."],
      ["Wofür wir die Daten nutzen", "Wir verwenden diese Angaben zur Prüfung der Anmeldung, Organisation des Turniers, Kontaktaufnahme und Vermeidung doppelter Anmeldungen. Marketingnachrichten werden nur nach einer gesonderten Einwilligung von Spieler 1 versendet."],
      ["Dienstleister", "Anmeldedaten werden über Supabase gespeichert; Benachrichtigungen können dem KYNG CUP Team über Telegram zugestellt werden. Diese Anbieter verarbeiten Daten für den Betrieb der Anmeldung."],
      ["Notwendige Speicherung", "Authentifizierungsdaten sind für die sichere Anmeldung von Spielern und Organisatoren erforderlich. Die notwendige Sitzungsspeicherung kann im Cookie-Banner nicht deaktiviert werden."],
      ["Optionale Analyse", "Google Analytics wird erst aktiviert, wenn Sie „Alle akzeptieren“ wählen. Es hilft uns, Seitenaufrufe und Registrierungsschritte zu verstehen. Werbespeicherung und personalisierte Werbung bleiben deaktiviert."],
      ["Speicherung und Ihre Rechte", "Wir speichern Anmeldedaten nur so lange, wie es für die Turnierorganisation und zugehörige Anfragen erforderlich ist. Sie können Auskunft, Berichtigung oder Löschung Ihrer Daten verlangen und im Banner „Nur notwendige“ wählen."],
    ],
    contact: "Fragen zum Datenschutz senden Sie bitte an",
  },
  ru: {
    eyebrow: "Уведомление о конфиденциальности · Обновлено 29 октября 2026",
    title: "Конфиденциальность и\ncookies",
    sections: [
      ["Аккаунт игрока", "В Supabase хранятся постоянный ID игрока, имя, подтверждённый email и необязательное фото. Подключённый вход через Google передаёт основные данные для авторизации. Профиль и фото на этом этапе закрыты от других игроков. Страницы аккаунта и авторизации исключены из аналитики. Для удаления данных обратитесь по адресу ниже."],
      ["Данные регистрации", "При подаче заявки KYNG CUP получает название пары, имена, email, телефоны, необязательные контакты в мессенджерах, уровни игры и рейтинги обоих игроков, а также необязательное сообщение."],
      ["Зачем мы их используем", "Мы используем эти данные для проверки заявки, организации турнира, связи с игроками и предотвращения повторных регистраций. Маркетинговые сообщения отправляются только после отдельного согласия первого игрока."],
      ["Поставщики услуг", "Регистрационные данные хранятся через Supabase, а уведомления о заявках могут доставляться команде KYNG CUP через Telegram. Эти поставщики обрабатывают данные для работы сервиса регистрации."],
      ["Обязательное хранение", "Данные авторизации необходимы для безопасного входа игроков и организаторов. Обязательное хранилище сессии не отключается в cookie-баннере."],
      ["Необязательная аналитика", "Google Analytics активируется только после выбора «Принять все». Она помогает анализировать посещения страниц и шаги регистрации. Рекламное хранилище и персонализация рекламы остаются отключёнными."],
      ["Хранение и ваши права", "Мы храним регистрационные данные только столько, сколько необходимо для организации турнира и обработки связанных обращений. Вы можете запросить доступ, исправление или удаление данных и выбрать «Только необходимые» в cookie-баннере."],
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
