"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "uk" | "de" | "ru";

const languages: Language[] = ["en", "uk", "de", "ru"];

const common = {
  en: { home: "Home", tennis: "Tennis", padel: "Padel", bracket: "Live bracket", language: "Language", back: "Back to home", openBracket: "Open tournament bracket", noTournament: "The next tournament will be announced soon.", loadingTournament: "Loading the next tournament…", upcoming: "Upcoming tournament", location: "Location", pairs: "Pairs", status: "Status", scheduled: "Scheduled", live: "Live", completed: "Completed", viewBracket: "View live bracket", contact: "Contact", copyright: "International tennis & padel community" },
  uk: { home: "Головна", tennis: "Теніс", padel: "Падел", bracket: "Сітка турніру", language: "Мова", back: "На головну", openBracket: "Відкрити турнірну сітку", noTournament: "Наступний турнір буде оголошено незабаром.", loadingTournament: "Завантажуємо наступний турнір…", upcoming: "Найближчий турнір", location: "Локація", pairs: "Пари", status: "Статус", scheduled: "Заплановано", live: "Наживо", completed: "Завершено", viewBracket: "Дивитися сітку", contact: "Контакти", copyright: "Міжнародна тенісна та падел-спільнота" },
  de: { home: "Startseite", tennis: "Tennis", padel: "Padel", bracket: "Turnierbaum", language: "Sprache", back: "Zur Startseite", openBracket: "Turnierbaum öffnen", noTournament: "Das nächste Turnier wird bald angekündigt.", loadingTournament: "Nächstes Turnier wird geladen…", upcoming: "Nächstes Turnier", location: "Ort", pairs: "Paare", status: "Status", scheduled: "Geplant", live: "Live", completed: "Beendet", viewBracket: "Turnierbaum ansehen", contact: "Kontakt", copyright: "Internationale Tennis- & Padel-Community" },
  ru: { home: "Главная", tennis: "Теннис", padel: "Падел", bracket: "Турнирная сетка", language: "Язык", back: "На главную", openBracket: "Открыть турнирную сетку", noTournament: "Следующий турнир будет объявлен в ближайшее время.", loadingTournament: "Загружаем следующий турнир…", upcoming: "Ближайший турнир", location: "Локация", pairs: "Пары", status: "Статус", scheduled: "Запланирован", live: "В эфире", completed: "Завершён", viewBracket: "Смотреть сетку", contact: "Контакты", copyright: "Международное сообщество тенниса и падела" },
} as const;

type CommonKey = keyof typeof common.en;

const autoTranslations: Record<string, Partial<Record<Exclude<Language, "en">, string>>> = {
  "Back to home": { uk: "На головну", de: "Zur Startseite", ru: "На главную" },
  "Live tournament experience": { uk: "Турнір наживо", de: "Turniererlebnis live", ru: "Турнир в реальном времени" },
  "Tournament bracket": { uk: "Турнірна сітка", de: "Turnierbaum", ru: "Турнирная сетка" },
  "bracket": { uk: "сітка", de: "Turnierbaum", ru: "сетка" },
  "Tournament rounds": { uk: "Раунди турніру", de: "Turnierrunden", ru: "Раунды турнира" },
  "Live updates": { uk: "Оновлення наживо", de: "Live-Updates", ru: "Обновления в реальном времени" },
  "Tournament completed": { uk: "Турнір завершено", de: "Turnier beendet", ru: "Турнир завершён" },
  "Tournament schedule": { uk: "Розклад турніру", de: "Turnierplan", ru: "Расписание турнира" },
  "Choose tournament": { uk: "Оберіть турнір", de: "Turnier wählen", ru: "Выберите турнир" },
  "Champion": { uk: "Чемпіон", de: "Champion", ru: "Чемпион" },
  "Loading the draw…": { uk: "Завантажуємо сітку…", de: "Turnierbaum wird geladen…", ru: "Загружаем сетку…" },
  "Quarterfinals": { uk: "Чвертьфінали", de: "Viertelfinale", ru: "Четвертьфиналы" },
  "Semifinals": { uk: "Півфінали", de: "Halbfinale", ru: "Полуфиналы" },
  "Final": { uk: "Фінал", de: "Finale", ru: "Финал" },
  "Round of 16": { uk: "1/8 фіналу", de: "Achtelfinale", ru: "1/8 финала" },
  "Round of 32": { uk: "1/16 фіналу", de: "Sechzehntelfinale", ru: "1/16 финала" },
  "Previous": { uk: "Назад", de: "Zurück", ru: "Назад" },
  "Next": { uk: "Далі", de: "Weiter", ru: "Далее" },
  "Results update automatically": { uk: "Результати оновлюються автоматично", de: "Ergebnisse werden automatisch aktualisiert", ru: "Результаты обновляются автоматически" },
  "Protected area": { uk: "Захищена зона", de: "Geschützter Bereich", ru: "Защищённая зона" },
  "Tournament admin": { uk: "Адміністрування турніру", de: "Turnierverwaltung", ru: "Администрирование турнира" },
  "admin": { uk: "адмінпанель", de: "Verwaltung", ru: "админка" },
  "Sign in to create tournaments, manage participants, schedules and live results.": { uk: "Увійдіть, щоб створювати турніри й керувати учасниками, розкладом і результатами.", de: "Melden Sie sich an, um Turniere, Teilnehmende, Zeitpläne und Live-Ergebnisse zu verwalten.", ru: "Войдите, чтобы создавать турниры и управлять участниками, расписанием и результатами." },
  "Password": { uk: "Пароль", de: "Passwort", ru: "Пароль" },
  "Sign in": { uk: "Увійти", de: "Anmelden", ru: "Войти" },
  "Create account": { uk: "Створити акаунт", de: "Konto erstellen", ru: "Создать аккаунт" },
  "Create a new account": { uk: "Створити новий акаунт", de: "Neues Konto erstellen", ru: "Создать новый аккаунт" },
  "I already have an account": { uk: "У мене вже є акаунт", de: "Ich habe bereits ein Konto", ru: "У меня уже есть аккаунт" },
  "Sign out": { uk: "Вийти", de: "Abmelden", ru: "Выйти" },
  "Checking access…": { uk: "Перевіряємо доступ…", de: "Zugriff wird geprüft…", ru: "Проверяем доступ…" },
  "Tournament control centre": { uk: "Центр керування турніром", de: "Turnier-Kontrollzentrum", ru: "Центр управления турниром" },
  "Match control": { uk: "Керування матчами", de: "Match-Steuerung", ru: "Управление матчами" },
  "Open public bracket": { uk: "Відкрити публічну сітку", de: "Öffentlichen Turnierbaum öffnen", ru: "Открыть публичную сетку" },
  "Current tournament": { uk: "Поточний турнір", de: "Aktuelles Turnier", ru: "Текущий турнир" },
  "No tournament selected": { uk: "Турнір не обрано", de: "Kein Turnier gewählt", ru: "Турнир не выбран" },
  "+ New tournament": { uk: "+ Новий турнір", de: "+ Neues Turnier", ru: "+ Новый турнир" },
  "Close": { uk: "Закрити", de: "Schließen", ru: "Закрыть" },
  "New tournament": { uk: "Новий турнір", de: "Neues Turnier", ru: "Новый турнир" },
  "A complete empty bracket will be created automatically.": { uk: "Повна порожня сітка буде створена автоматично.", de: "Ein vollständiger leerer Turnierbaum wird automatisch erstellt.", ru: "Полная пустая сетка будет создана автоматически." },
  "Name": { uk: "Назва", de: "Name", ru: "Название" },
  "URL slug": { uk: "URL-адреса", de: "URL-Kürzel", ru: "URL-адрес" },
  "Location": { uk: "Локація", de: "Ort", ru: "Локация" },
  "Starts at": { uk: "Початок", de: "Beginn", ru: "Начало" },
  "Sport": { uk: "Вид спорту", de: "Sportart", ru: "Вид спорта" },
  "Pairs": { uk: "Пари", de: "Paare", ru: "Пары" },
  "Create tournament": { uk: "Створити турнір", de: "Turnier erstellen", ru: "Создать турнир" },
  "Creating…": { uk: "Створюємо…", de: "Wird erstellt…", ru: "Создаём…" },
  "Tournament": { uk: "Турнір", de: "Turnier", ru: "Турнир" },
  "Publish, start live coverage or archive the completed tournament.": { uk: "Опублікуйте турнір, запустіть трансляцію або перенесіть завершений турнір до архіву.", de: "Turnier veröffentlichen, Live-Betrieb starten oder ein beendetes Turnier archivieren.", ru: "Опубликуйте турнир, запустите прямое обновление или архивируйте завершённый турнир." },
  "Participants": { uk: "Учасники", de: "Teilnehmende", ru: "Участники" },
  "Edit every pair, then place them manually into the draw.": { uk: "Відредагуйте кожну пару, а потім вручну розмістіть її в сітці.", de: "Bearbeiten Sie jedes Paar und setzen Sie es anschließend manuell in den Turnierbaum.", ru: "Отредактируйте каждую пару, затем вручную разместите её в сетке." },
  "Manual draw": { uk: "Ручне жеребкування", de: "Manuelle Setzung", ru: "Ручная расстановка" },
  "Use the arrows to assign each pair to a first-round position.": { uk: "Стрілками призначте кожній парі позицію в першому раунді.", de: "Weisen Sie jedem Paar mit den Pfeilen eine Position in der ersten Runde zu.", ru: "Стрелками назначьте каждой паре позицию в первом раунде." },
  "Matches & courts": { uk: "Матчі та корти", de: "Matches & Courts", ru: "Матчи и корты" },
  "Schedule matches, switch LIVE on, enter scores and correct results safely.": { uk: "Плануйте матчі, вмикайте LIVE, вводьте рахунок і безпечно виправляйте результати.", de: "Matches planen, LIVE aktivieren, Ergebnisse eingeben und sicher korrigieren.", ru: "Планируйте матчи, включайте LIVE, вводите счёт и безопасно исправляйте результаты." },
  "Team & roles": { uk: "Команда та ролі", de: "Team & Rollen", ru: "Команда и роли" },
  "Activity log": { uk: "Журнал дій", de: "Aktivitätsprotokoll", ru: "Журнал действий" },
  "Court": { uk: "Корт", de: "Court", ru: "Корт" },
  "Date & time": { uk: "Дата й час", de: "Datum & Uhrzeit", ru: "Дата и время" },
  "Save schedule": { uk: "Зберегти розклад", de: "Zeitplan speichern", ru: "Сохранить расписание" },
  "Save result": { uk: "Зберегти результат", de: "Ergebnis speichern", ru: "Сохранить результат" },
  "Correct result": { uk: "Виправити результат", de: "Ergebnis korrigieren", ru: "Исправить результат" },
  "Reset result": { uk: "Скинути результат", de: "Ergebnis zurücksetzen", ru: "Сбросить результат" },
  "Saving…": { uk: "Зберігаємо…", de: "Wird gespeichert…", ru: "Сохраняем…" },
  "Tournament name": { uk: "Назва турніру", de: "Turniername", ru: "Название турнира" },
  "Visibility / status": { uk: "Видимість / статус", de: "Sichtbarkeit / Status", ru: "Видимость / статус" },
  "Draft · hidden": { uk: "Чернетка · приховано", de: "Entwurf · verborgen", ru: "Черновик · скрыт" },
  "Published": { uk: "Опубліковано", de: "Veröffentlicht", ru: "Опубликован" },
  "Live now": { uk: "Наживо зараз", de: "Jetzt live", ru: "Сейчас в эфире" },
  "Completed · archive": { uk: "Завершено · архів", de: "Beendet · Archiv", ru: "Завершён · архив" },
  "Save tournament": { uk: "Зберегти турнір", de: "Turnier speichern", ru: "Сохранить турнир" },
  "Pair name": { uk: "Назва пари", de: "Paarname", ru: "Название пары" },
  "Player one": { uk: "Перший гравець", de: "Spieler eins", ru: "Первый игрок" },
  "Player two": { uk: "Другий гравець", de: "Spieler zwei", ru: "Второй игрок" },
  "Save names": { uk: "Зберегти імена", de: "Namen speichern", ru: "Сохранить имена" },
  "Save manual draw": { uk: "Зберегти розстановку", de: "Setzung speichern", ru: "Сохранить расстановку" },
  "Only the tournament owner can change the draw.": { uk: "Лише власник турніру може змінити розстановку.", de: "Nur der Turnierinhaber kann die Setzung ändern.", ru: "Только владелец турнира может менять расстановку." },
  "Status": { uk: "Статус", de: "Status", ru: "Статус" },
  "Scheduled": { uk: "Заплановано", de: "Geplant", ru: "Запланирован" },
  "Completed": { uk: "Завершено", de: "Beendet", ru: "Завершён" },
  "Waiting for winner": { uk: "Очікуємо переможця", de: "Warten auf Sieger", ru: "Ожидаем победителя" },
  "Previous round": { uk: "Попередній раунд", de: "Vorherige Runde", ru: "Предыдущий раунд" },
  "Account email": { uk: "Email акаунта", de: "Konto-E-Mail", ru: "Email аккаунта" },
  "Role": { uk: "Роль", de: "Rolle", ru: "Роль" },
  "Administrator": { uk: "Адміністратор", de: "Administrator", ru: "Администратор" },
  "Owner": { uk: "Власник", de: "Inhaber", ru: "Владелец" },
  "Add member": { uk: "Додати учасника команди", de: "Mitglied hinzufügen", ru: "Добавить участника команды" },
  "Adding…": { uk: "Додаємо…", de: "Wird hinzugefügt…", ru: "Добавляем…" },
  "Remove": { uk: "Видалити", de: "Entfernen", ru: "Удалить" },
  "No changes recorded yet.": { uk: "Змін поки не зафіксовано.", de: "Noch keine Änderungen aufgezeichnet.", ru: "Изменений пока не зафиксировано." },
  "Owners control structure and access; administrators manage tournament operations.": { uk: "Власники контролюють структуру й доступ; адміністратори керують турніром.", de: "Inhaber kontrollieren Struktur und Zugriff; Administratoren führen das Turnier durch.", ru: "Владельцы контролируют структуру и доступ; администраторы управляют турниром." },
  "The latest protected changes to tournament data.": { uk: "Останні захищені зміни турнірних даних.", de: "Die neuesten geschützten Änderungen an Turnierdaten.", ru: "Последние защищённые изменения турнирных данных." },
  "This account has no tournament access yet. Ask an owner to add your email as an administrator.": { uk: "Цей акаунт ще не має доступу до турнірів. Попросіть власника додати ваш email як адміністратора.", de: "Dieses Konto hat noch keinen Turnierzugriff. Bitten Sie einen Inhaber, Ihre E-Mail als Administrator hinzuzufügen.", ru: "У этого аккаунта пока нет доступа к турнирам. Попросите владельца добавить ваш email как администратора." },
  "No published tournament bracket is available yet.": { uk: "Опублікованої турнірної сітки поки немає.", de: "Noch kein veröffentlichter Turnierbaum verfügbar.", ru: "Опубликованной турнирной сетки пока нет." },
  "Location TBA": { uk: "Локація уточнюється", de: "Ort folgt", ru: "Локация уточняется" },
  "Schedule TBA": { uk: "Розклад уточнюється", de: "Zeitplan folgt", ru: "Расписание уточняется" },
  "Court TBA": { uk: "Корт уточнюється", de: "Court folgt", ru: "Корт уточняется" },
  "To be decided": { uk: "Ще не визначено", de: "Noch offen", ru: "Ещё не определено" },
  "Winner of previous match": { uk: "Переможець попереднього матчу", de: "Sieger des vorherigen Matches", ru: "Победитель предыдущего матча" },
  "Contact": { uk: "Контакти", de: "Kontakt", ru: "Контакты" },
  "KYNG standard": { uk: "Стандарт KYNG", de: "KYNG-Standard", ru: "Стандарт KYNG" },
  "Quarterfinal": { uk: "Чвертьфінал", de: "Viertelfinale", ru: "Четвертьфинал" },
  "Live · Centre court": { uk: "Наживо · Центральний корт", de: "Live · Center Court", ru: "В эфире · Центральный корт" },
  "Cookie policy": { uk: "Політика cookies", de: "Cookie-Richtlinie", ru: "Политика cookies" },
  "Privacy notice · Updated 14 August 2026": { uk: "Повідомлення про приватність · Оновлено 14 серпня 2026", de: "Datenschutzhinweis · Aktualisiert am 14. August 2026", ru: "Уведомление о конфиденциальности · Обновлено 14 августа 2026" },
  "What we store": { uk: "Що ми зберігаємо", de: "Was wir speichern", ru: "Что мы сохраняем" },
  "Essential storage": { uk: "Обов’язкове зберігання", de: "Notwendige Speicherung", ru: "Обязательное хранение" },
  "Optional cookies": { uk: "Необов’язкові cookies", de: "Optionale Cookies", ru: "Необязательные cookies" },
  "Your choice": { uk: "Ваш вибір", de: "Ihre Wahl", ru: "Ваш выбор" },
  "Privacy & cookies": { uk: "Приватність і cookies", de: "Datenschutz & Cookies", ru: "Конфиденциальность и cookies" },
  "Necessary only": { uk: "Лише необхідні", de: "Nur notwendige", ru: "Только необходимые" },
  "Accept all": { uk: "Прийняти всі", de: "Alle akzeptieren", ru: "Принять все" },
  "Read cookie policy": { uk: "Політика cookies", de: "Cookie-Richtlinie lesen", ru: "Политика cookies" },
};

type I18nContextValue = { language: Language; setLanguage: (language: Language) => void; t: (key: CommonKey) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

function translateDom(language: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "uk" ? "uk" : language;
  const reverse = new Map<string, string>();
  Object.entries(autoTranslations).forEach(([english, values]) => {
    reverse.set(english, english);
    Object.values(values).forEach((value) => value && reverse.set(value, english));
  });
  const translate = (value: string) => {
    const trimmed = value.trim();
    const english = reverse.get(trimmed);
    if (!english) return value;
    const translated = language === "en" ? english : autoTranslations[english]?.[language] ?? english;
    return value.replace(trimmed, translated);
  };
  const apply = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode();
    while (node) {
      if (!node.parentElement?.closest("script, style") && node.textContent) {
        const next = translate(node.textContent);
        if (next !== node.textContent) node.textContent = next;
      }
      node = walker.nextNode();
    }
    if (root instanceof Element) {
      [root, ...Array.from(root.querySelectorAll("[placeholder], [aria-label], [title]"))].forEach((element) => {
        ["placeholder", "aria-label", "title"].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (value) element.setAttribute(attribute, translate(value));
        });
      });
    }
  };
  apply(document.body);
  return new MutationObserver((mutations) => mutations.forEach((mutation) => {
    if (mutation.type === "characterData") apply(mutation.target);
    mutation.addedNodes.forEach(apply);
  }));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("kyng-language") as Language | null;
    const timer = window.setTimeout(() => {
      if (saved && languages.includes(saved)) setLanguageState(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const observer = translateDom(language);
    observer?.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer?.disconnect();
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    window.localStorage.setItem("kyng-language", next);
    setLanguageState(next);
  }, []);
  const t = useCallback((key: CommonKey) => common[language][key], [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLanguage() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
